"""Versioned prompt loading (T-29.4).

Prompts are Markdown files in `app/ai/prompts/`, each with a front-matter
`version:` header — never 40-line f-strings inside a function body. Files
because prompts are content, not code: they get reviewed in diffs, edited
without touching logic, and their version bumps deliberately.

The version does real work: it is part of the response-cache key (T-29.10),
so editing a prompt automatically invalidates every cached response produced
by the old wording. Forgetting to bump the header means stale cache hits —
which is why `load_prompt` refuses files without one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

_PROMPT_DIR = Path(__file__).resolve().parent

_FRONT_MATTER_RE = re.compile(r"\A---\s*\nversion:\s*(\d+)\s*\n---\s*\n", re.DOTALL)

#: The five prompts T-29 ships. `load_prompt` only accepts these, so a typo'd
#: name fails loudly at the call site instead of 404ing against the filesystem.
PROMPT_NAMES = ("summary", "action_items", "keywords", "outline", "qa")


@dataclass(frozen=True)
class Prompt:
    name: str
    version: int
    body: str


@cache
def load_prompt(name: str) -> Prompt:
    """Read and parse one prompt file. Cached — files don't change at runtime."""
    if name not in PROMPT_NAMES:
        raise KeyError(f"Unknown prompt {name!r}; expected one of {PROMPT_NAMES}")

    raw = (_PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")
    match = _FRONT_MATTER_RE.match(raw)
    if match is None:
        raise ValueError(
            f"Prompt {name!r} is missing its `version:` front-matter header — "
            "the version keys the response cache, so it is not optional."
        )
    return Prompt(name=name, version=int(match.group(1)), body=raw[match.end() :].strip())


def prompts_fingerprint() -> str:
    """Every prompt's version, in one stable string — a response-cache key part."""
    return "|".join(f"{name}:{load_prompt(name).version}" for name in PROMPT_NAMES)
