"""The search box's query syntax (T-35.3).

`"pricing model" -churn speaker:Sarah after:2026-07-01` is one string with
three different kinds of instruction in it: text to match, text to refuse, and
filters that are not text matching at all. This module splits them apart —
the FTS engine gets a MATCH expression, and the SQL layer gets filters.

Parsing is deliberately forgiving. A search box is not a compiler: an unclosed
quote is treated as if it were closed at the end, an unknown `field:` is
searched literally, and a malformed date falls back to being a word. The one
thing a query must never do is raise.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

#: `speaker:Sarah`, `before:2026-07-01`, `after:2026-07-01`. Anything else with
#: a colon is just text — people search for `re: budget` and mean it.
_FIELDS = ("speaker", "before", "after")

#: Tokens: an optionally negated, optionally fielded phrase or bare word.
_TOKEN = re.compile(
    r"""
    (?P<neg>-)?                      # optional exclusion
    (?:(?P<field>\w+):)?             # optional field prefix
    (?:
        "(?P<phrase>[^"]*)"?         # a quoted phrase, tolerant of no close
        |
        (?P<word>[^\s"]+)            # or a bare word
    )
    """,
    re.VERBOSE,
)

#: Matches what the FTS tokeniser keeps, so an excluded term is the same term
#: the index would have matched.
_WORD = re.compile(r"[\w']+")


@dataclass(slots=True)
class Term:
    text: str
    #: A quoted phrase keeps its word order and never gets a prefix `*`.
    is_phrase: bool


@dataclass(slots=True)
class ParsedQuery:
    """What the search box's string actually asked for."""

    include: list[Term] = field(default_factory=list)
    exclude: list[Term] = field(default_factory=list)
    #: Case-insensitive substring of the speaker's name.
    speaker: str | None = None
    before: date | None = None
    after: date | None = None

    @property
    def has_text(self) -> bool:
        return bool(self.include)

    def to_fts(self) -> str:
        """The MATCH expression, or `""` when there is nothing to match.

        Every term is quoted so FTS5 treats it as literal text — `a.*b` is
        characters, not syntax. The LAST bare word gets a `*` so results narrow
        as the user types. Exclusions chain with `NOT`, which FTS5 applies
        left-associatively: `a NOT b NOT c` is "a, minus b, minus c" — exactly
        what a reader expects `-b -c` to mean.
        """
        last = len(self.include) - 1
        quoted = [
            _quote(term, prefix=(index == last and not term.is_phrase))
            for index, term in enumerate(self.include)
        ]
        parts = [q for q in quoted if q]
        if not parts:
            return ""

        expression = " ".join(parts)
        for term in self.exclude:
            negated = _quote(term, prefix=False)
            if negated:
                expression = f"({expression}) NOT {negated}"

        return expression


def _quote(term: Term, *, prefix: bool) -> str:
    """One FTS phrase, or `""` when nothing tokenisable survives."""
    words = _WORD.findall(term.text)
    if not words:
        return ""

    phrase = " ".join(words).replace('"', '""')
    if prefix and len(words) == 1:
        return f'"{phrase}"*'
    return f'"{phrase}"'


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def parse_query(raw: str) -> ParsedQuery:
    parsed = ParsedQuery()

    for match in _TOKEN.finditer(raw):
        negated = bool(match.group("neg"))
        field_name = (match.group("field") or "").lower()
        phrase = match.group("phrase")
        word = match.group("word")
        value = phrase if phrase is not None else (word or "")

        if field_name in _FIELDS and not negated:
            if field_name == "speaker" and value:
                parsed.speaker = value
                continue
            if field_name in ("before", "after"):
                when = _parse_date(value)
                if when is not None:
                    if field_name == "before":
                        parsed.before = when
                    else:
                        parsed.after = when
                    continue
                # A malformed date falls back to being text: `after:lunch` is
                # a phrase somebody actually said.
                value = f"{field_name}:{value}"
        elif field_name:
            # An unknown field, or a negated one: the colon was punctuation.
            value = f"{field_name}:{value}"

        if not value.strip():
            continue

        term = Term(text=value, is_phrase=phrase is not None)
        (parsed.exclude if negated else parsed.include).append(term)

    return parsed
