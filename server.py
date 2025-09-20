"""Local Flask proxy server for the MONKY dashboard."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
from pathlib import Path
import pickle
from typing import Dict, Iterable, Iterator, List, Optional, Tuple, Union

try:  # Prefer ``requests`` when available, fall back to ``urllib`` otherwise.
    import requests  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback when dependency missing
    from urllib import error as urllib_error
    from urllib import parse as urllib_parse
    from urllib import request as urllib_request

    class _RequestException(Exception):
        pass

    class _SimpleResponse:
        """Minimal stand-in for ``requests.Response`` using ``urllib``."""

        def __init__(self, raw_response):
            self._raw = raw_response
            self._content: Optional[bytes] = None
            status = getattr(raw_response, "status", None)
            if status is None:
                status = getattr(raw_response, "code", None)
            if status is None:
                try:
                    status = raw_response.getcode()
                except Exception:  # pragma: no cover - defensive
                    status = None
            self.status_code = status or 0
            headers = getattr(raw_response, "headers", {})
            self.headers = dict(headers.items()) if hasattr(headers, "items") else dict(headers)

        def close(self) -> None:
            try:
                self._raw.close()
            except Exception:  # pragma: no cover - best effort cleanup
                pass

        @property
        def content(self) -> bytes:
            if self._content is None:
                self._content = self._raw.read()
                self.close()
            return self._content

        def json(self):  # type: ignore[override]
            data = self.content
            if not data:
                return {}
            return json.loads(data.decode("utf-8"))

        def iter_content(self, chunk_size: Optional[int] = 8192):
            if not chunk_size:
                chunk_size = 8192
            try:
                while True:
                    chunk = self._raw.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                self.close()

        def iter_lines(self, decode_unicode: bool = False):
            buffer = b""
            for chunk in self.iter_content(8192):
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    if decode_unicode:
                        yield line.decode("utf-8", errors="ignore")
                    else:
                        yield line
            if buffer:
                if decode_unicode:
                    yield buffer.decode("utf-8", errors="ignore")
                else:
                    yield buffer

    class _RequestsModule:
        RequestException = _RequestException
        Response = _SimpleResponse

        @staticmethod
        def request(
            method: str,
            url: str,
            *,
            headers: Optional[Dict[str, str]] = None,
            json: Optional[dict] = None,
            params: Optional[dict] = None,
            stream: bool = False,
            timeout: Optional[Tuple[float, float]] = None,
            verify: Union[bool, str] = True,
        ) -> _SimpleResponse:
            del stream, verify  # streaming handled by response iterator; TLS verify defaults
            headers = dict(headers or {})
            data: Optional[bytes] = None
            if json is not None:
                headers.setdefault("Content-Type", "application/json")
                data = json_module.dumps(json).encode("utf-8")

            if params:
                query = urllib_parse.urlencode(params)
                separator = "&" if urllib_parse.urlparse(url).query else "?"
                url = f"{url}{separator}{query}"

            req = urllib_request.Request(url, data=data, headers=headers, method=method.upper())
            timeout_value: Optional[float] = None
            if isinstance(timeout, (tuple, list)) and timeout:
                timeout_value = float(timeout[-1])
            elif isinstance(timeout, (int, float)):
                timeout_value = float(timeout)

            try:
                raw = urllib_request.urlopen(req, timeout=timeout_value)
            except urllib_error.HTTPError as exc:
                raw = exc
            except urllib_error.URLError as exc:
                raise _RequestException(str(exc)) from exc

            return _SimpleResponse(raw)

    # expose fallback under the ``requests`` name so the rest of the module works
    requests = _RequestsModule()  # type: ignore
    json_module = json
else:
    json_module = json

from flask import (
    Flask,
    Response,
    jsonify,
    request,
    send_file,
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
    "CORP_SSL_CERT_PATH": "",
    "VECTOR_INDEX_DIR": "./vectorstore",
    "DESKTOP_EXPORT_DIR": str(Path.home() / "Desktop"),
    "ICONS_DIR": "",
    "USER_AVATAR_PATH": "",
    "EMBEDDING_MODEL": "text-embedding-3-small",
    "HTTP_TIMEOUT": 300,
    "HTTP_PORT": 5000,
}

CONFIG_PATH = Path(__file__).with_name("config.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("monky.server")


def load_config() -> Dict[str, Union[str, int]]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError("config.json not found. Run setup_wizard.py first.")

    with CONFIG_PATH.open("r", encoding="utf-8") as fp:
        data = json.load(fp) or {}
    if not isinstance(data, dict):
        raise ValueError("config.json must contain an object")

    config: Dict[str, Union[str, int]] = dict(DEFAULT_CONFIG)
    config.update({k: v for k, v in data.items() if v is not None})

    # Allow environment overrides for automation/testing.
    for key in DEFAULT_CONFIG:
        env_value = os.environ.get(key)
        if env_value is not None:
            config[key] = env_value

    # Normalise numeric values.
    try:
        config["HTTP_PORT"] = int(config.get("HTTP_PORT", DEFAULT_CONFIG["HTTP_PORT"]))
    except (TypeError, ValueError):
        config["HTTP_PORT"] = DEFAULT_CONFIG["HTTP_PORT"]

    try:
        config["HTTP_TIMEOUT"] = int(config.get("HTTP_TIMEOUT", DEFAULT_CONFIG["HTTP_TIMEOUT"]))
    except (TypeError, ValueError):
        config["HTTP_TIMEOUT"] = DEFAULT_CONFIG["HTTP_TIMEOUT"]

    # Normalise paths and expand user home references.
    def _normalise_path(value: Union[str, int]) -> str:
        if not value:
            return ""
        return str(Path(str(value)).expanduser())

    vector_dir = Path(_normalise_path(config.get("VECTOR_INDEX_DIR", "")))
    if not vector_dir.is_absolute():
        vector_dir = (CONFIG_PATH.parent / vector_dir).resolve()
    config["VECTOR_INDEX_DIR"] = str(vector_dir)

    for key in ("DESKTOP_EXPORT_DIR", "ICONS_DIR", "USER_AVATAR_PATH", "CORP_SSL_CERT_PATH"):
        config[key] = _normalise_path(config.get(key, ""))

    return config


app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False

try:
    app.config["SETTINGS"] = load_config()
    app.config["CONFIG_ERROR"] = None
except Exception as exc:  # pragma: no cover - configuration errors handled at runtime
    logger.warning("Configuration not ready: %s", exc)
    app.config["SETTINGS"] = {}
    app.config["CONFIG_ERROR"] = str(exc)


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def configuration_error() -> Optional[str]:
    return app.config.get("CONFIG_ERROR")


def require_settings() -> Dict[str, Union[str, int]]:
    error = configuration_error()
    if error:
        raise RuntimeError(error)
    settings = app.config.get("SETTINGS")
    if not isinstance(settings, dict) or not settings:
        raise RuntimeError("Configuration not loaded")
    return settings


def choose_provider(preferred: Optional[str] = None) -> str:
    settings = require_settings()
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
    settings = require_settings()
    headers: Dict[str, str] = {"Content-Type": "application/json"}

    if provider == "genesis":
        headers["Authorization"] = f"Bearer {settings['GENESIS_API_KEY']}"
    elif provider == "openrouter":
        headers["Authorization"] = f"Bearer {settings['OPENROUTER_API_KEY']}"
        headers.setdefault("HTTP-Referer", "http://localhost")
        headers.setdefault("X-Title", "MONKY Dashboard")
    else:  # pragma: no cover - defensive coding
        raise ValueError(f"Unknown provider: {provider}")

    if extra:
        headers.update(extra)
    return headers


def provider_base_url(provider: str) -> str:
    settings = require_settings()
    if provider == "genesis":
        return str(settings["GENESIS_BASE_URL"]).rstrip("/")
    if provider == "openrouter":
        return "https://openrouter.ai/api/v1"
    raise ValueError(f"Unknown provider: {provider}")


def genesis_verify_option(settings: Dict[str, Union[str, int]]) -> Union[bool, str]:
    env_override = os.environ.get("VERIFY_CERT")
    if env_override and env_override.lower() in {"0", "false", "no"}:
        return False
    cert_path = str(settings.get("CORP_SSL_CERT_PATH") or "").strip()
    if cert_path:
        return cert_path
    return True


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
    settings = require_settings()
    base_url = provider_base_url(provider)
    url = f"{base_url}{path}"
    merged_headers = build_headers(provider, headers)

    timeout = (10, float(settings.get("HTTP_TIMEOUT", DEFAULT_CONFIG["HTTP_TIMEOUT"])))
    verify: Union[bool, str] = True
    if provider == "genesis":
        verify = genesis_verify_option(settings)

    response = requests.request(
        method,
        url,
        headers=merged_headers,
        json=json_payload,
        params=params,
        stream=stream,
        timeout=timeout,
        verify=verify,
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
            if docs_path.suffix == ".json":
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
        documents: List[Dict[str, str]] = []

        if isinstance(metadata, dict):
            for key in sorted(metadata.keys()):
                documents.append(self._extract_doc(metadata[key]))
        elif isinstance(metadata, list):
            for entry in metadata:
                documents.append(self._extract_doc(entry))
        else:
            logger.warning("Unsupported metadata format: %s", type(metadata))

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

        if hasattr(query_vector, "ndim") and query_vector.ndim == 1:
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


_rag_index: Optional[RagIndex] = None


def get_rag_index() -> RagIndex:
    global _rag_index
    settings = require_settings()
    vector_dir = Path(str(settings.get("VECTOR_INDEX_DIR")))
    embedding_model = str(settings.get("EMBEDDING_MODEL", DEFAULT_CONFIG["EMBEDDING_MODEL"]))
    if _rag_index is None or _rag_index.index_dir != vector_dir or _rag_index.embedding_model_name != embedding_model:
        _rag_index = RagIndex(vector_dir, embedding_model)
    return _rag_index


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def serve_index() -> Response:
    error = configuration_error()
    if error:
        return Response(
            f"Configuration error: {error}. Run setup_wizard.py first.",
            status=500,
            mimetype="text/plain",
        )
    return send_from_directory(Path(__file__).parent, "index.html")


@app.get("/health")
def health() -> Response:
    try:
        require_settings()
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True})


@app.get("/env")
def environment() -> Response:
    try:
        settings = require_settings()
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500

    api_base = request.host_url.rstrip("/")
    avatar_url = ""
    avatar_path = str(settings.get("USER_AVATAR_PATH") or "").strip()
    if avatar_path and Path(avatar_path).exists():
        mtime = int(Path(avatar_path).stat().st_mtime)
        avatar_url = f"/assets/avatar?v={mtime}"

    payload = {
        "API_BASE_URL": api_base,
        "GENESIS_READY": bool(settings.get("GENESIS_API_KEY")),
        "OPENROUTER_READY": bool(settings.get("OPENROUTER_API_KEY")),
        "GENESIS_BASE_URL": settings.get("GENESIS_BASE_URL"),
        "OPENROUTER_MODEL": settings.get("OPENROUTER_MODEL"),
        "DEFAULT_MODEL": settings.get("OPENROUTER_MODEL"),
        "VECTOR_INDEX_DIR": settings.get("VECTOR_INDEX_DIR"),
        "DESKTOP_EXPORT_DIR": settings.get("DESKTOP_EXPORT_DIR"),
        "ICONS_DIR": settings.get("ICONS_DIR"),
        "ICONS_AVAILABLE": bool(settings.get("ICONS_DIR")),
        "USER_AVATAR_URL": avatar_url,
        "EMBEDDING_MODEL": settings.get("EMBEDDING_MODEL"),
        "HTTP_PORT": settings.get("HTTP_PORT"),
    }
    return jsonify(payload)


def relay_json_response(response: requests.Response) -> Response:
    content_type = response.headers.get("Content-Type", "application/json")
    data = response.content
    return Response(data, status=response.status_code, content_type=content_type)


@app.route("/icons/<path:filename>")
def serve_icon(filename: str):
    try:
        settings = require_settings()
    except RuntimeError:
        return ("", 404)

    icons_dir = str(settings.get("ICONS_DIR") or "").strip()
    if not icons_dir:
        return ("", 404)

    directory = Path(icons_dir)
    if not directory.exists():
        return ("", 404)
    return send_from_directory(directory, filename)


@app.get("/assets/avatar")
def serve_avatar():
    try:
        settings = require_settings()
    except RuntimeError:
        return ("", 404)

    avatar_path = str(settings.get("USER_AVATAR_PATH") or "").strip()
    if not avatar_path:
        return ("", 404)

    file_path = Path(avatar_path)
    if not file_path.exists():
        return ("", 404)

    mimetype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return send_file(file_path, mimetype=mimetype)


@app.route("/api/models", methods=["GET"])
def list_models() -> Response:
    try:
        provider = choose_provider(request.args.get("provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    upstream = upstream_request("GET", provider, "/models")
    return relay_json_response(upstream)


@app.route("/api/models/<model_id>", methods=["GET"])
def get_model(model_id: str) -> Response:
    try:
        provider = choose_provider(request.args.get("provider"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    upstream = upstream_request("GET", provider, f"/models/{model_id}")
    return relay_json_response(upstream)


@app.route("/api/embeddings", methods=["POST"])
def embeddings() -> Response:
    payload = request.json or {}
    provider_hint = payload.get("provider") or request.args.get("provider")
    try:
        provider = choose_provider(provider_hint)
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
            rag_matches = get_rag_index().query(latest, k=payload.get("rag_k", 5))
        except Exception as exc:
            logger.warning("RAG lookup failed: %s", exc)
            rag_matches = []

    outbound_payload = dict(payload)
    outbound_payload["messages"] = augment_messages_with_rag(messages, rag_matches)

    try:
        upstream = upstream_request(
            "POST",
            provider,
            "/chat/completions",
            json_payload=outbound_payload,
            stream=stream,
        )
    except requests.RequestException as exc:  # type: ignore[attr-defined]
        return jsonify({"error": str(exc)}), 502

    if stream:
        return stream_chat_response(upstream, rag_matches)

    data = upstream.json()
    data.setdefault("citations", rag_matches)
    return jsonify(data), upstream.status_code


def proxy_assistants_request(method: str, path: str, stream: bool = False) -> Response:
    try:
        settings = require_settings()
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500

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
    try:
        stats = get_rag_index().stats()
    except RuntimeError as exc:
        return jsonify({"hasIndex": False, "docCount": 0, "indexPath": "", "error": str(exc)})
    return jsonify(stats)


@app.route("/api/rag/query", methods=["POST"])
def rag_query() -> Response:
    payload = request.json or {}
    query = payload.get("q") or ""
    k = int(payload.get("k") or 5)
    try:
        results = get_rag_index().query(query, k=k)
    except Exception as exc:
        return jsonify({"error": str(exc), "matches": []}), 500

    return jsonify({"matches": results})


# ---------------------------------------------------------------------------
# Application entry point
# ---------------------------------------------------------------------------


def main() -> None:
    error = configuration_error()
    if error:
        raise SystemExit(f"{error}")

    settings = require_settings()
    host = os.environ.get("PROXY_HOST", "127.0.0.1")
    port = int(os.environ.get("PROXY_PORT", settings.get("HTTP_PORT", 5000)))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":  # pragma: no cover - script execution
    main()
