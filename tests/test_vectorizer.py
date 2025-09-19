import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vectorizer import (  # noqa: E402  - imported after sys.path manipulation
    Vectorizer,
    build_vocabulary,
    tokenize,
    vectorize,
    vectorize_corpus,
    vectorize_document,
)


def test_tokenize_basic_case_and_lowercasing():
    assert tokenize("Hello, World! 42") == ["hello", "world", "42"]


def test_build_vocabulary_order_and_min_frequency():
    vocab = build_vocabulary(["foo bar", "foo baz", "qux"], min_frequency=2)
    assert list(vocab.keys()) == ["foo"]


def test_vectorize_document_binary_and_counts():
    vocab = {"foo": 0, "bar": 1}
    tokens = ["foo", "bar", "foo", "spam"]
    assert vectorize_document(tokens, vocab) == [2, 1]
    assert vectorize_document(tokens, vocab, binary=True) == [1, 1]


def test_vectorize_corpus_builds_vocabulary_and_returns_matrix():
    matrix, vocab = vectorize_corpus(["foo bar", "bar baz"])
    assert matrix == [[1, 1, 0], [0, 1, 1]]
    assert list(vocab.keys()) == ["foo", "bar", "baz"]


def test_vectorizer_roundtrip_inverse_transform():
    vec = Vectorizer()
    matrix = vec.fit_transform(["foo foo", "bar"])
    assert matrix == [[2, 0], [0, 1]]
    assert vec.inverse_transform(matrix) == [["foo", "foo"], ["bar"]]


def test_vectorize_wrapper_single_document():
    vector, vocab = vectorize("foo bar foo")
    assert vector == [2, 1]
    assert list(vocab.keys()) == ["foo", "bar"]


def test_vectorizer_transform_requires_fit():
    vec = Vectorizer()
    with pytest.raises(ValueError):
        vec.transform(["foo"])
