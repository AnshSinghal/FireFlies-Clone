#!/usr/bin/env python3
"""Fail when `docs/ui-audit.md`'s ratio table disagrees with the screenshots.

The audit's headline table is the T-46.1 result: nine proportions of this clone
beside the same proportions of `docs/reference/fireflies/`. It is the document an
evaluator reads to learn how close the two are, and every number in it is a
measurement that stops being true the moment a token moves.

Which it did. ADR-149 tuned two gap tokens as a *fraction of card height* and
stored them as absolute pixels; ADR-150 then raised the card from 72px to 82px
and the gaps did not move, so `group ÷ card` silently fell from 0.930 to 0.815
against a reference of 0.94. Nothing caught it — the tests assert `toBe(82)`
and were right, the visual baselines were regenerated so the wrong spacing
BECAME the expected spacing, and CI was green. It surfaced only because the
published numbers were re-derived by hand.

Two more followed from the same change: the gap's internal distribution, and a
row that turned out to be measuring nothing (a horizontal inset normalised by a
vertical card height, which looked like a 7% match by coincidence and re-read as
a 17% miss when only the denominator moved).

So this script exists for the same reason `check_design_tokens.py` does, one
layer up: that one checks the spec against the code, this one checks the audit
against the pixels.

**It does not police the design.** A ratio drifting from the reference is a
product decision. It fails only when the audit's number stops describing the
screenshot beside it — a documentation check, not a fidelity gate.

Tolerance is 5% relative. Border-counting ambiguity (is a 56px topbar 54, 55 or
56 pixels of rule-to-rule?) moves these by ~2%; the regressions above moved them
by 12-17%. 5% separates the two without inviting a re-measure over noise.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

TOLERANCE = 0.05
TOPBAR_PX = 56  # design.md §3.7, and asserted by the e2e shell spec
GLYPH_PX = 14  # row-title cap-to-descender band at 15px/600
TILE_PX = 40  # the reserved leading box (T-12.6, ADR-036)


def _load(path: Path):
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        print(
            "check-reference-ratios: needs pillow and numpy.\n"
            "  uv run --with pillow --with numpy python3 scripts/check_reference_ratios.py",
            file=sys.stderr,
        )
        # Skip rather than fail a lint run that cannot satisfy the dependency.
        # `from None` because the ImportError is the expected path here, not an
        # error worth chaining into the traceback.
        raise SystemExit(0) from None
    return np, np.asarray(Image.open(path).convert("L"), dtype=float)


def _hrules(np, img, x0: int, x1: int, frac: float = 0.75, delta: int = 4) -> list[int]:
    """Rows where most of the column changes — a full-width rule, not text."""
    band = img[:, x0:x1]
    hit = (abs(np.diff(band, axis=0)) > delta).mean(axis=1)
    out: list[int] = []
    prev = -10
    for i in np.where(hit > frac)[0]:
        if i - prev > 3:
            out.append(int(i))
        prev = i
    return out


def _first_glyph_col(np, img, y0: int, y1: int, x0: int, x1: int, cut: int = 140) -> int | None:
    cols = np.where((img[y0:y1, x0:x1] < cut).sum(axis=0) > 0)[0]
    return int(cols.min()) + x0 if len(cols) else None


def measure(root: Path) -> dict[str, float]:
    np, notebook = _load(root / "docs/screenshots/02-meetings-list.png")
    rules = _hrules(np, notebook, 270, 1410)
    gaps = [rules[i + 1] - rules[i] for i in range(len(rules) - 1)]

    card = Counter(g for g in gaps if g > 40).most_common(1)[0][0]
    intra = Counter(g for g in gaps if 15 <= g <= 30).most_common(1)[0][0]
    group = Counter(g for g in gaps if 55 <= g <= 95 and g != card).most_common(1)[0][0]

    title_x = _first_glyph_col(np, notebook, 300, 320, 320, 900)
    tile_end = 275 + TILE_PX  # card's left inset plus the reserved box

    _, settings = _load(root / "docs/screenshots/07-settings-recording.png")
    band = settings[200:320, 500:1440]
    hit = (abs(np.diff(band, axis=1)) > 4).mean(axis=0)
    edges: list[int] = []
    prev = -10
    for i in np.where(hit > 0.5)[0]:
        if i - prev > 3:
            edges.append(int(i) + 500)
        prev = i

    # Settings has TWO measures since the group well landed, and conflating them
    # is what made this check fire. `edges` reads [well-left, card-left,
    # card-right, well-right] — the outer pair is the tinted container, the
    # inner pair the cards inside its 16px padding.
    #
    # The audit's long-standing 57.6% describes the reference's CARDS (their
    # 927px), not the well behind them (972px). While our cards sat directly on
    # the page those were one number here, so `edges[-1] - edges[0]` was right
    # by coincidence and became wrong the moment a container appeared.
    return {
        "Row title type ÷ topbar": GLYPH_PX / TOPBAR_PX,
        "Card height ÷ topbar": card / TOPBAR_PX,
        "Card height ÷ title glyph": card / GLYPH_PX,
        "Gap between cards in a group ÷ card": intra / card,
        "Gap across a date heading ÷ card": group / card,
        "Tile→title gap ÷ tile width": (title_x - tile_end) / TILE_PX,
        "Leading tile ÷ card height": TILE_PX / card,
        "Settings block ÷ content column": (edges[-2] - edges[1]) / 953,
        "Settings well ÷ content column": (edges[-1] - edges[0]) / 953,
    }


def published(root: Path) -> dict[str, float]:
    """The `Ours` column of the audit's headline table."""
    rows = re.findall(
        r"^\|\s*([^|]+?)\s*\|\s*[\d.]+%?\s*\|\s*\*{0,2}([\d.]+)%?\*{0,2}\s*\|$",
        (root / "docs/ui-audit.md").read_text(encoding="utf-8"),
        re.M,
    )
    out = {}
    for label, value in rows:
        v = float(value)
        out[label] = v / 100 if v > 20 else v  # the settings row is a percentage
    return out


def unaccounted(root: Path) -> list[str]:
    """Reference screens the audit never mentions.

    Reference 01 — Fireflies' Home hub — was the only screen in the set with no
    entry in "Differences we are keeping, and why", and it went unnoticed until
    2026-07-28 precisely because absence is what nothing looks for. Every other
    non-match had been written up; the largest one had not, and slot `01` had
    quietly been repurposed to hold the channel-scoped notebook on top of that.

    So this asserts coverage rather than correctness. It cannot tell whether an
    entry is any good — only that no reference screen is silently missing from
    the document whose entire job is to account for all of them.
    """
    audit = (root / "docs/ui-audit.md").read_text(encoding="utf-8")
    missing = []
    for png in sorted((root / "docs/reference/fireflies").glob("*.png")):
        n = png.stem
        # "reference 03", "references 07, 08", or a direct `03.png` citation.
        if not re.search(rf"references?\s+(?:\d\d,\s*)*{n}\b|`?{n}\.png`?", audit):
            missing.append(f"  reference {n} is in docs/reference/fireflies/ but never cited")
    return missing


def main(root: Path) -> int:
    claimed, actual = published(root), measure(root)
    checked, failures = 0, []

    for label, measured in actual.items():
        if label not in claimed:
            failures.append(f"  {label}: not found in the audit's table")
            continue
        checked += 1
        want = claimed[label]
        if want and abs(measured - want) / want > TOLERANCE:
            failures.append(
                f"  {label}: audit says {want:.3f}, screenshots measure {measured:.3f} "
                f"({abs(measured - want) / want * 100:.0f}% apart)"
            )

    uncited = unaccounted(root)
    failures += uncited

    if failures:
        print("docs/ui-audit.md disagrees with docs/screenshots/:\n", file=sys.stderr)
        print("\n".join(failures), file=sys.stderr)
        if uncited:
            print(
                "\nA reference screen with no entry is not evidence it matches — it is "
                "evidence nobody looked. Add it to 'Differences we are keeping, and why', "
                "or to 'Verified equivalent' if it genuinely matches.",
                file=sys.stderr,
            )
        else:
            print(
                "\nEither the screenshots are stale (re-run the capture) or a token moved and "
                "the audit was not re-derived. Check which before editing either — the last "
                "three times this fired, a token had moved and the number was right when written.",
                file=sys.stderr,
            )
        return 1

    n_ref = len(list((root / "docs/reference/fireflies").glob("*.png")))
    print(
        f"reference ratios: docs/ui-audit.md agrees with the screenshots "
        f"({checked} ratios, {n_ref} reference screens all cited)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1] if len(sys.argv) > 1 else ".")))
