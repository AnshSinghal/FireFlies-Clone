#!/usr/bin/env python3
"""Fail when `design.md` states a colour the token layer does not produce.

CLAUDE.md makes design.md authoritative: "every colour, size, radius and
duration comes from here." Nothing enforced that, and on 2026-07-28 two of its
colours were fiction — the accent still read `#2A6EF4` blue eight weeks after
ADR-011 sampled the reference and moved it to `#6A39EF` violet, and
`--ff-text-muted` still read `#8992A2` after the shipped value became `#667085`.

Both drifts survived a full test suite, and the reason is worth stating because
it explains why this script has to exist at all. Layout tokens are pinned by
exact assertions — `08-notebook.spec.ts` asserts `toBe(72)` for the row height,
so moving it fails a test the same afternoon. Colour tokens are only ever
property-tested: `tokens.test.ts` has eleven `toBeGreaterThanOrEqual` contrast
assertions and not one assertion on a specific hex. A property test protects
the property and abandons the value. Both drifts IMPROVED their property — the
accent matched the reference, the muted grey went from 3.14:1 to 4.97:1 — so
every test went greener while the document describing them became wrong.

This closes that gap in the only way that does not fight the token layer: it
does not pin hexes in tests, it checks that the prose agrees with the code.

Resolution mirrors the cascade rather than guessing at it. `tokens.css` is two
layers — primitives hold hexes, semantics hold `var(--primitive)` — so a
semantic name is followed until it reaches a literal, exactly as the browser
would. Dark is a separate scope that re-points primitives, so the two tables are
compared against their own scopes; comparing design.md's dark table against the
light block is how the first draft of this check reported thirteen mismatches
where only two were real.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HEX = r"#[0-9a-fA-F]{3,8}"
DARK_SELECTOR = "[data-theme='dark']"


def _decls(block: str) -> tuple[dict[str, str], dict[str, str]]:
    """(literal hexes, aliases) declared in one CSS scope."""
    literals = dict(re.findall(rf"(--ff-[a-z0-9-]+):\s*({HEX});", block))
    aliases = dict(re.findall(r"(--ff-[a-z0-9-]+):\s*var\((--ff-[a-z0-9-]+)\);", block))
    return literals, aliases


def _resolve(name: str, scope: tuple[dict[str, str], dict[str, str]], depth: int = 0) -> str | None:
    literals, aliases = scope
    if depth > 8:  # a var() cycle; report as unresolvable rather than hanging
        return None
    if name in literals:
        return literals[name].lower()
    if name in aliases:
        return _resolve(aliases[name], scope, depth + 1)
    return None


def main(root: Path) -> int:
    css = (root / "frontend/src/styles/tokens.css").read_text(encoding="utf-8")
    design = (root / "design.md").read_text(encoding="utf-8")

    if DARK_SELECTOR not in css:
        print(f"check-design-tokens: {DARK_SELECTOR} not found in tokens.css", file=sys.stderr)
        return 2

    light_block, dark_block = css.split(DARK_SELECTOR, 1)
    light = _decls(light_block)
    # Dark overrides primitives only; semantic aliases still come from :root.
    dark_lit, dark_alias = _decls(dark_block)
    dark = ({**light[0], **dark_lit}, {**light[1], **dark_alias})

    # design.md's dark palette follows its own heading; everything before it is light.
    split = design.find("### 3.3")
    if split == -1:
        split = len(design)
    tables = (("light", design[:split], light), ("dark", design[split:], dark))

    failures: list[str] = []
    checked = 0
    for label, text, scope in tables:
        for token, stated in re.findall(rf"\|\s*`(--ff-[a-z0-9-]+)`\s*\|\s*`({HEX})`", text):
            actual = _resolve(token, scope)
            if actual is None:
                continue  # documented but not a token yet — not this check's business
            checked += 1
            if actual != stated.lower():
                failures.append(
                    f"  {label:5} {token:26} design.md says {stated.lower()}, "
                    f"tokens.css resolves {actual}"
                )

    if failures:
        print(f"design.md disagrees with tokens.css on {len(failures)} token(s):\n", file=sys.stderr)
        print("\n".join(failures), file=sys.stderr)
        print(
            "\nFix whichever is wrong. If the token changed deliberately, design.md is the "
            "authority per CLAUDE.md and has to say so — a spec nobody updates is worse than "
            "no spec, because it is quoted with confidence.",
            file=sys.stderr,
        )
        return 1

    print(f"design tokens: design.md agrees with tokens.css ({checked} values)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1] if len(sys.argv) > 1 else ".")))
