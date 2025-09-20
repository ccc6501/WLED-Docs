"""Flask proxy server for the MONKY dashboard.

This module consolidates the behaviour from the previous proxy server used by
the project and exposes a compact REST API that powers the single page
application described in the project brief.  The server exposes the following
categories of endpoints:

* Configuration helpers (``/env`` and ``/health``)
* Chat/embeddings/model proxy routes that forward requests to Genesis or
  OpenRouter
* Assistant management endpoints (Genesis Assistants v2)
* RAG helper routes that query a local FAISS index

The implementation intentionally keeps external dependencies to a minimum:
``Flask`` and ``requests`` are used for HTTP handling, while the FAISS bridge is
loaded lazily so the application still runs if the optional dependencies are not
available.  The goal is to provide an offline-friendly tool that can still
leverage remote models when credentials are available.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import pickle
from typing import Dict, Iterable, Iterator, List, Optional, Tuple

import requests
from flask import (
    Flask,
    Response,
    jsonify,
    request,
    send_from_directory,
    stream_with_context,
)

try:  # Optional heavy dependencies are loaded lazily when used.
    import faiss  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    faiss = None

try:
    import numpy as np
except Exception:  # pragma: no cover - optional dependency
    np = None

try:  # Sentence-Transformers provides the same model class used by the indexer.
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional dependency
    SentenceTransformer = None


DEFAULT_CONFIG = {
    "GENESIS_BASE_URL": "https://api.ai.us.lmco.com/v1",
    "GENESIS_API_KEY": "",
    "OPENROUTER_API_KEY": "",
    "OPENROUTER_MODEL": "meta-llama/llama-3.1-8b-instruct",
    "VECTOR_INDEX_DIR": "./vectorstore",
    "EMBEDDING_MODEL": "text-embedding-3-small",
    "HTTP_TIMEOUT": 300,
}

CONFIG_PATH = Path(__file__).with_name("config.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("monky.server")


def load_config() -> Dict[str, str]:
    """Load configuration from ``config.json`` and environment variables."""

    config: Dict[str, str] = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open("r", encoding="utf-8") as fp:
                data = json.load(fp)
            if isinstance(data, dict):
                for key, value in data.items():
                    if value is None:
                        continue
                    config[key] = value
        except Exception as exc:  # pragma: no cover - defensive coding
            logger.warning("Failed to read config.json: %s", exc)

    for key in list(config.keys()):
        value = os.environ.get(key)
        if value is not None:
            config[key] = value

    # Normalise paths and derived values.
    vector_dir = Path(config["VECTOR_INDEX_DIR"]).expanduser().resolve()
    config["VECTOR_INDEX_DIR"] = str(vector_dir)
    return config


app = Flask(__name__, static_folder=None)
app.config["SETTINGS"] = load_config()


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def get_settings() -> Dict[str, str]:
    return app.config["SETTINGS"]


def choose_provider(preferred: Optional[str] = None) -> str:
    settings = get_settings()
    preferred = (preferred or "").lower() or None

    has_genesis = bool(settings.get("GENESIS_API_KEY"))
    has_openrouter = bool(settings.get("OPENROUTER_API_KEY"))

    if preferred == "genesis" and has_genesis:
        return "genesis"
    if preferred == "openrouter" and has_openrouter:
        return "openrouter"
    if has_genesis:
        return "genesis"
    if has_openrouter:
        return "openrouter"
    raise ValueError("No provider credentials configured")


def build_headers(provider: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    settings = get_settings()
    headers: Dict[str, str] = {"Content-Type": "application/json"}

    if provider == "genesis":
        headers["Authorization"] = f"Bearer {settings['GENESIS_API_KEY']}"
    elif provider == "openrouter":
        headers["Authorization"] = f"Bearer {settings['OPENROUTER_API_KEY']}"
        # These headers are recommended by OpenRouter but optional.
        headers.setdefault("HTTP-Referer", "http://localhost")
        headers.setdefault("X-Title", "MONKY Dashboard")
    else:  # pragma: no cover - defensive coding
        raise ValueError(f"Unknown provider: {provider}")

    if extra:
        headers.update(extra)
    return headers


def provider_base_url(provider: str) -> str:
    settings = get_settings()
    if provider == "genesis":
        return settings["GENESIS_BASE_URL"].rstrip("/")
    if provider == "openrouter":
        return "https://openrouter.ai/api/v1"
    raise ValueError(f"Unknown provider: {provider}")


def upstream_request(
    method: str,
    provider: str,
    path: str,
    *,
    json_payload: Optional[dict] = None,
    params: Optional[dict] = None,
    stream: bool = False,
    headers: Optional[Dict[str, str]] = None,
) -> requests.Response:
    """Forward a request to the specified provider."""

    base_url = provider_base_url(provider)
    url = f"{base_url}{path}"
    merged_headers = build_headers(provider, headers)

    timeout = (10, float(get_settings().get("HTTP_TIMEOUT", 300)))
    response = requests.request(
        method,
        url,
        headers=merged_headers,
        json=json_payload,
        params=params,
        stream=stream,
        timeout=timeout,
    )
    return response


# ---------------------------------------------------------------------------
# RAG utilities
# ---------------------------------------------------------------------------


class RagIndex:
    """Small helper around a FAISS index generated by the vectorizer."""

    def __init__(self, index_dir: Path, embedding_model: str):
        self.index_dir = index_dir
        self.embedding_model_name = embedding_model
        self._index = None
        self._documents: List[Dict[str, str]] = []
        self._embedder = None
        self._loaded = False
        self._load_error: Optional[str] = None

    # File name candidates recognised from the existing tooling.
    _INDEX_CANDIDATES = [
        "index.faiss",
        "faiss.index",
        "index.bin",
        "store.faiss",
    ]
    _DOCS_CANDIDATES = [
        "docstore.json",
        "documents.json",
        "store.json",
        "metadata.json",
        "docstore.pkl",
        "documents.pkl",
    ]

    def _find_existing_file(self, candidates: Iterable[str]) -> Optional[Path]:
        for name in candidates:
            candidate = self.index_dir / name
            if candidate.exists():
                return candidate
        return None

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        if not self.index_dir.exists():
            self._load_error = f"Vector store not found at {self.index_dir}"
            return
        if faiss is None or np is None:
            self._load_error = "FAISS dependencies are not installed"
            return

        index_path = self._find_existing_file(self._INDEX_CANDIDATES)
        if not index_path:
            self._load_error = "FAISS index file not found"
            return

        docs_path = self._find_existing_file(self._DOCS_CANDIDATES)
        if not docs_path:
            self._load_error = "Document metadata file not found"
            return

        try:
            self._index = faiss.read_index(str(index_path))
        except Exception as exc:  # pragma: no cover - depends on faiss availability
            self._load_error = f"Unable to read FAISS index: {exc}"
            return

        try:
            if docs_path.suffix in {".json"}:
                with docs_path.open("r", encoding="utf-8") as fp:
                    metadata = json.load(fp)
            else:
                with docs_path.open("rb") as fp:
                    metadata = pickle.load(fp)
        except Exception as exc:  # pragma: no cover - depends on file availability
            self._load_error = f"Unable to read document metadata: {exc}"
            return

        self._documents = self._normalize_metadata(metadata)

        if not self._documents:
            self._load_error = "Document metadata is empty"
            return

        if SentenceTransformer is None:
            self._load_error = (
                "sentence-transformers is not installed; required for query embeddings"
            )
            return

        try:
            self._embedder = SentenceTransformer(self.embedding_model_name)
        except Exception as exc:  # pragma: no cover - model specific
            self._load_error = f"Failed to load embedding model '{self.embedding_model_name}': {exc}"
            return

        self._loaded = True
        self._load_error = None
        logger.info("Loaded FAISS index from %s", index_path)

    def _normalize_metadata(self, metadata) -> List[Dict[str, str]]:
        """Return a list of dictionaries with ``text`` and ``source`` keys."""

        documents: List[Dict[str, str]] = []

        if isinstance(metadata, dict):
            # Some vectorizers store documents in a mapping keyed by integer index
            # or UUID.  Attempt to normalise common shapes.
            for key in sorted(metadata.keys()):
                entry = metadata[key]
                documents.append(self._extract_doc(entry))
        elif isinstance(metadata, list):
            for entry in metadata:
                documents.append(self._extract_doc(entry))
        else:
            logger.warning("Unsupported metadata format: %s", type(metadata))

        # Filter out empty entries while preserving indices for FAISS results.
        cleaned: List[Dict[str, str]] = []
        for item in documents:
            if not item.get("text"):
                item["text"] = ""
            cleaned.append(item)
        return cleaned

    @staticmethod
    def _extract_doc(entry) -> Dict[str, str]:
        if isinstance(entry, dict):
            text = entry.get("text") or entry.get("page_content") or ""
            metadata = entry.get("metadata") or {}
            source = metadata.get("source") if isinstance(metadata, dict) else ""
            if not source:
                source = entry.get("source") or metadata.get("filename", "")
            return {"text": text, "source": source}
        if isinstance(entry, str):
            return {"text": entry, "source": ""}
        return {"text": str(entry), "source": ""}

    def stats(self) -> Dict[str, object]:
        self.ensure_loaded()
        return {
            "hasIndex": self._loaded,
            "docCount": len(self._documents) if self._loaded else 0,
            "indexPath": str(self.index_dir),
            "error": self._load_error,
        }

    def query(self, text: str, k: int = 5) -> List[Dict[str, object]]:
        self.ensure_loaded()
        if not self._loaded or not self._index or self._embedder is None:
            raise RuntimeError(self._load_error or "RAG index not available")

        text = (text or "").strip()
        if not text:
            return []

        query_vector = self._embedder.encode([text], convert_to_numpy=True)
        if query_vector is None:
            return []

        if query_vector.ndim == 1:
            query_vector = query_vector.reshape(1, -1)

        query_vector = query_vector.astype("float32")
        distances, indices = self._index.search(query_vector, k)

        results: List[Dict[str, object]] = []
        for score, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(self._documents):
                continue
            doc = self._documents[idx]
            results.append(
                {
                    "text": doc.get("text", ""),
                    "source": doc.get("source", ""),
                    "score": float(score),
                }
            )
        return results


rag_index = RagIndex(
    Path(get_settings()["VECTOR_INDEX_DIR"]),
    get_settings()["EMBEDDING_MODEL"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def serve_index() -> Response:
    """Serve the single page application."""

    return send_from_directory(Path(__file__).parent, "index.html")


@app.get("/health")
def health() -> Response:
    return jsonify({"ok": True})


@app.get("/env")
def environment() -> Response:
    settings = get_settings()
    return jsonify(
        {
            "GENESIS_API_KEY": settings.get("GENESIS_API_KEY", ""),
            "OPENROUTER_API_KEY": settings.get("OPENROUTER_API_KEY", ""),
            "GENESIS_BASE_URL": settings.get("GENESIS_BASE_URL"),
            "OPENROUTER_MODEL": settings.get("OPENROUTER_MODEL"),
        }
    )


def relay_json_response(response: requests.Response) -> Response:
    content_type = response.headers.get("Content-Type", "application/json")
    data = response.content
    return Response(data, status=response.status_code, content_type=content_type)


@app.route("/api/models", methods=["GET"])
def list_models() -> Response:
    provider = request.args.get("provider")
    try:
        provider = choose_provider(provider)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    upstream = upstream_request("GET", provider, "/models")
    return relay_json_response(upstream)


@app.route("/api/models/<model_id>", methods=["GET"])
def get_model(model_id: str) -> Response:
    provider = request.args.get("provider")
    try:
        provider = choose_provider(provider)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    upstream = upstream_request("GET", provider, f"/models/{model_id}")
    return relay_json_response(upstream)


@app.route("/api/embeddings", methods=["POST"])
def embeddings() -> Response:
    payload = request.json or {}
    provider = payload.get("provider") or request.args.get("provider")
    try:
        provider = choose_provider(provider)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    upstream = upstream_request("POST", provider, "/embeddings", json_payload=payload)
    return relay_json_response(upstream)


def augment_messages_with_rag(messages: List[Dict[str, str]], rag_matches: List[Dict[str, object]]) -> List[Dict[str, str]]:
    if not rag_matches:
        return messages

    context_lines = ["Use the following context to answer the user's question."]
    for idx, match in enumerate(rag_matches, start=1):
        prefix = f"[{idx}]"
        snippet = match.get("text", "")
        source = match.get("source", "")
        if source:
            context_lines.append(f"{prefix} Source: {source}")
        context_lines.append(f"{prefix} {snippet}")
    context_message = {"role": "system", "content": "\n".join(context_lines)}

    augmented = [m.copy() for m in messages]
    augmented.insert(0, context_message)
    return augmented


def stream_chat_response(upstream: requests.Response, citations: List[Dict[str, object]]) -> Response:
    @stream_with_context
    def event_stream() -> Iterator[str]:
        try:
            for raw_line in upstream.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                line = raw_line
                if line.startswith("data:"):
                    line = line[len("data:") :].strip()
                if not line:
                    continue
                if line == "[DONE]":
                    break
                yield f"data: {line}\n\n"
        finally:
            upstream.close()
        final_event = json.dumps({"done": True, "citations": citations})
        yield f"data: {final_event}\n\n"

    return Response(event_stream(), content_type="text/event-stream")


@app.route("/api/chat/completions", methods=["POST"])
def chat_completions() -> Response:
    payload = request.json or {}
    stream = bool(payload.get("stream"))
    rag_requested = bool(payload.get("rag"))
    provider_hint = payload.get("provider")

    try:
        provider = choose_provider(provider_hint)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    messages = payload.get("messages") or []
    if not isinstance(messages, list):
        return jsonify({"error": "messages must be a list"}), 400

    rag_matches: List[Dict[str, object]] = []
    if rag_requested:
        user_messages = [m for m in messages if m.get("role") == "user"]
        latest = user_messages[-1]["content"] if user_messages else ""
        try:
            rag_matches = rag_index.query(latest, k=payload.get("rag_k", 5))
        except Exception as exc:
            logger.warning("RAG lookup failed: %s", exc)
            rag_matches = []

    augmented_messages = augment_messages_with_rag(messages, rag_matches)
    outbound_payload = dict(payload)
    outbound_payload["messages"] = augmented_messages

    try:
        upstream = upstream_request(
            "POST",
            provider,
            "/chat/completions",
            json_payload=outbound_payload,
            stream=stream,
        )
    except requests.RequestException as exc:
        return jsonify({"error": str(exc)}), 502

    if stream:
        return stream_chat_response(upstream, rag_matches)

    data = upstream.json()
    data.setdefault("citations", rag_matches)
    return jsonify(data), upstream.status_code


def proxy_assistants_request(method: str, path: str, stream: bool = False) -> Response:
    settings = get_settings()
    if not settings.get("GENESIS_API_KEY"):
        return jsonify({"error": "Genesis credentials are required for this endpoint"}), 400

    headers = {"OpenAI-Beta": "assistants=v2"}
    payload = request.json if request.data else None
    params = request.args.to_dict(flat=True)

    upstream = upstream_request(
        method,
        "genesis",
        path,
        json_payload=payload,
        params=params,
        stream=stream,
        headers=headers,
    )

    if stream:
        return Response(
            stream_with_context(upstream.iter_content(chunk_size=None)),
            status=upstream.status_code,
            content_type=upstream.headers.get("Content-Type", "text/event-stream"),
        )

    return relay_json_response(upstream)


@app.route("/api/assistants", methods=["GET", "POST"])
def assistants_collection() -> Response:
    return proxy_assistants_request(request.method, "/assistants")


@app.route("/api/assistants/<assistant_id>", methods=["GET", "DELETE"])
def assistant_resource(assistant_id: str) -> Response:
    return proxy_assistants_request(request.method, f"/assistants/{assistant_id}")


@app.route("/api/threads/runs", methods=["POST"])
def threads_runs() -> Response:
    return proxy_assistants_request("POST", "/threads/runs", stream=True)


@app.route("/api/rag/stats", methods=["GET"])
def rag_stats() -> Response:
    return jsonify(rag_index.stats())


@app.route("/api/rag/query", methods=["POST"])
def rag_query() -> Response:
    payload = request.json or {}
    query = payload.get("q") or ""
    k = int(payload.get("k") or 5)
    try:
        results = rag_index.query(query, k=k)
    except Exception as exc:
        return jsonify({"error": str(exc), "matches": []}), 500

    return jsonify({"matches": results})


# ---------------------------------------------------------------------------
# Application entry point
# ---------------------------------------------------------------------------


def main() -> None:
    host = os.environ.get("PROXY_HOST", "127.0.0.1")
    port = int(os.environ.get("PROXY_PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":  # pragma: no cover - script execution
    main()
