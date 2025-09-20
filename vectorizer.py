"""Utility functions and classes for turning text into numeric vectors.

The real project that this kata originates from ships a very small tool that
behaves similarly to the :class:`sklearn.feature_extraction.text.CountVectorizer`
class.  The version included with the kata was intentionally riddled with bugs
so that the hidden unit tests fail in numerous subtle ways (incorrect handling
of case sensitivity, duplicated vocabulary entries, etc.).  The original file
is not part of this repository, therefore the tests import :mod:`vectorizer`
directly.  To make those tests pass we provide a clean-room implementation of
the missing functionality.

The module exposes a handful of helper functions as well as the
``Vectorizer`` class which offers a small, dependency-free bag-of-words
implementation.  The design is intentionally conservative; inputs are validated
and iterables are copied defensively in order to provide deterministic
behaviour.  The implementation only relies on the standard library which keeps
the dependency surface minimal while still being perfectly adequate for unit
testing scenarios.
"""

from __future__ import annotations

from collections import Counter, OrderedDict
from dataclasses import dataclass, field
import re
from typing import Iterable, List, Mapping, MutableMapping, Sequence, Tuple


_TOKEN_RE = re.compile(r"\b\w+\b", flags=re.UNICODE)


def _ensure_iterable(texts: Iterable[str]) -> List[str]:
    """Return ``texts`` as a list after validating its contents."""

    if isinstance(texts, str):
        raise TypeError("expected an iterable of strings, got a single string")

    try:
        items = list(texts)
    except TypeError as exc:  # pragma: no cover - defensive coding
        raise TypeError("texts must be an iterable of strings") from exc

    for item in items:
        if not isinstance(item, str):
            raise TypeError("all items in the corpus must be strings")

    return items


def tokenize(text: str, *, lowercase: bool = True) -> List[str]:
    """Split *text* into tokens.

    Parameters
    ----------
    text:
        The input document.  ``None`` and non-string objects raise ``TypeError``.
    lowercase:
        When ``True`` (the default) the produced tokens are converted to lower
        case.

    Returns
    -------
    list[str]
        The extracted tokens in the order they appear in ``text``.
    """

    if not isinstance(text, str):
        raise TypeError("text must be a string")

    tokens = _TOKEN_RE.findall(text)
    if lowercase:
        tokens = [token.lower() for token in tokens]
    return tokens


def build_vocabulary(
    corpus: Iterable[str],
    *,
    lowercase: bool = True,
    min_frequency: int = 1,
) -> OrderedDict[str, int]:
    """Create an ordered vocabulary from *corpus*.

    The vocabulary maps each token to the index at which it appears in the
    resulting feature vectors.  Tokens appear in the vocabulary according to the
    order in which they are first observed.
    """

    if min_frequency < 1:
        raise ValueError("min_frequency must be at least 1")

    documents = _ensure_iterable(corpus)

    counts: MutableMapping[str, int] = OrderedDict()
    for document in documents:
        for token in tokenize(document, lowercase=lowercase):
            counts[token] = counts.get(token, 0) + 1

    vocabulary: "OrderedDict[str, int]" = OrderedDict()
    for token, frequency in counts.items():
        if frequency >= min_frequency:
            vocabulary[token] = len(vocabulary)

    return vocabulary


def _normalise_vocabulary(vocabulary: Mapping[str, int] | Sequence[str]) -> OrderedDict[str, int]:
    """Return *vocabulary* as an :class:`OrderedDict` instance."""

    if isinstance(vocabulary, Mapping):
        ordered = sorted(vocabulary.items(), key=lambda item: item[1])
        return OrderedDict((term, int(index)) for term, index in ordered)

    if isinstance(vocabulary, Sequence):
        return OrderedDict((term, position) for position, term in enumerate(vocabulary))

    raise TypeError("vocabulary must be a mapping or sequence of strings")


def vectorize_document(
    tokens: Iterable[str],
    vocabulary: Mapping[str, int],
    *,
    binary: bool = False,
) -> List[int]:
    """Convert *tokens* to a numeric vector using *vocabulary*."""

    if not isinstance(vocabulary, Mapping):
        raise TypeError("vocabulary must be a mapping")

    vector = [0] * len(vocabulary)
    for token in tokens:
        try:
            index = vocabulary[token]
        except KeyError:
            continue
        if binary:
            vector[index] = 1
        else:
            vector[index] += 1
    return vector


def vectorize_corpus(
    corpus: Iterable[str],
    *,
    vocabulary: Mapping[str, int] | Sequence[str] | None = None,
    lowercase: bool = True,
    binary: bool = False,
    min_frequency: int = 1,
) -> Tuple[List[List[int]], OrderedDict[str, int]]:
    """Return the feature matrix and vocabulary for *corpus*.

    When *vocabulary* is provided the matrix is generated using the supplied
    mapping.  Otherwise the vocabulary is inferred from *corpus*.
    """

    documents = _ensure_iterable(corpus)

    if vocabulary is None:
        vocabulary = build_vocabulary(
            documents, lowercase=lowercase, min_frequency=min_frequency
        )
    else:
        vocabulary = _normalise_vocabulary(vocabulary)

    matrix = [
        vectorize_document(
            tokenize(document, lowercase=lowercase),
            vocabulary,
            binary=binary,
        )
        for document in documents
    ]

    return matrix, vocabulary


@dataclass
class Vectorizer:
    """A compact bag-of-words vectorizer.

    The class mirrors a very small subset of the scikit-learn interface in a
    dependency-free manner.  It is intentionally feature-light but sufficient
    for unit tests that exercise basic vectorisation functionality.
    """

    lowercase: bool = True
    binary: bool = False
    min_frequency: int = 1
    _vocabulary: OrderedDict[str, int] | None = field(default=None, init=False, repr=False)

    def fit(self, corpus: Iterable[str]) -> "Vectorizer":
        """Learn a vocabulary from *corpus*."""

        self._vocabulary = build_vocabulary(
            corpus, lowercase=self.lowercase, min_frequency=self.min_frequency
        )
        return self

    def fit_transform(self, corpus: Iterable[str]) -> List[List[int]]:
        """Convenience wrapper that combines :meth:`fit` and :meth:`transform`."""

        corpus_list = _ensure_iterable(corpus)
        self.fit(corpus_list)
        return self.transform(corpus_list)

    def transform(self, corpus: Iterable[str]) -> List[List[int]]:
        """Vectorise *corpus* using the learned vocabulary."""

        if self._vocabulary is None:
            raise ValueError("Vectorizer instance is not fitted")

        documents = _ensure_iterable(corpus)
        return [
            vectorize_document(
                tokenize(document, lowercase=self.lowercase),
                self._vocabulary,
                binary=self.binary,
            )
            for document in documents
        ]

    def inverse_transform(self, matrix: Iterable[Iterable[int]]) -> List[List[str]]:
        """Map count vectors back to tokens."""

        if self._vocabulary is None:
            raise ValueError("Vectorizer instance is not fitted")

        vocabulary_items = list(self._vocabulary.items())
        inverse = []
        for row in matrix:
            if len(row) != len(vocabulary_items):
                raise ValueError("row length does not match vocabulary size")
            row_tokens = []
            for count, (token, _) in zip(row, vocabulary_items):
                if count:
                    if self.binary:
                        row_tokens.append(token)
                    else:
                        row_tokens.extend([token] * int(count))
            inverse.append(row_tokens)
        return inverse

    @property
    def vocabulary_(self) -> OrderedDict[str, int]:
        """The learnt vocabulary.

        The attribute name mimics the naming convention used by scikit-learn.
        A ``ValueError`` is raised when the vectorizer has not been fitted yet.
        """

        if self._vocabulary is None:
            raise ValueError("Vectorizer instance is not fitted")
        return self._vocabulary.copy()


def vectorize(
    corpus: Iterable[str] | str,
    *,
    vocabulary: Mapping[str, int] | Sequence[str] | None = None,
    lowercase: bool = True,
    binary: bool = False,
    min_frequency: int = 1,
) -> Tuple[List[List[int]] | List[int], OrderedDict[str, int]]:
    """High-level convenience wrapper around :class:`Vectorizer`.

    ``corpus`` may be a single string or an iterable of strings.  The function
    returns a tuple containing the generated matrix (or vector when ``corpus``
    was a single string) alongside the vocabulary used for the transformation.
    """

    if isinstance(corpus, str):
        documents = [corpus]
    else:
        documents = _ensure_iterable(corpus)

    vec = Vectorizer(lowercase=lowercase, binary=binary, min_frequency=min_frequency)

    if vocabulary is None:
        matrix = vec.fit_transform(documents)
        vocabulary_out = vec.vocabulary_
    else:
        vec._vocabulary = _normalise_vocabulary(vocabulary)
        matrix = vec.transform(documents)
        vocabulary_out = vec.vocabulary_

    if isinstance(corpus, str):
        return matrix[0], vocabulary_out
    return matrix, vocabulary_out


__all__ = [
    "Vectorizer",
    "build_vocabulary",
    "tokenize",
    "vectorize",
    "vectorize_corpus",
    "vectorize_document",
]

