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
        from PIL import Image  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
    except ImportError:
        print(
            "check-reference-ratios: needs pillow and numpy.\n"
            "  uv run --with pillow --with numpy python3 scripts/check_reference_ratios.py",
            file=sys.stderr,
        )
        raise SystemExit(0)  # skip rather than fail a lint run that cannot satisfy it
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

    return {
        "Row title type ÷ topbar": GLYPH_PX / TOPBAR_PX,
        "Card height ÷ topbar": card / TOPBAR_PX,
        "Card height ÷ title glyph": card / GLYPH_PX,
        "Gap between cards in a group ÷ card": intra / card,
        "Gap across a date heading ÷ card": group / card,
        "Tile→title gap ÷ tile width": (title_x - tile_end) / TILE_PX,
        "Leading tile ÷ card height": TILE_PX / card,
        "Settings block ÷ content column": (edges[-1] - edges[0]) / 953,
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

    if failures:
        print("docs/ui-audit.md disagrees with docs/screenshots/:\n", file=sys.stderr)
        print("\n".join(failures), file=sys.stderr)
        print(
            "\nEither the screenshots are stale (re-run the capture) or a token moved and "
            "the audit was not re-derived. Check which before editing either — the last "
            "three times this fired, a token had moved and the number was right when written.",
            file=sys.stderr,
        )
        return 1

    print(f"reference ratios: docs/ui-audit.md agrees with the screenshots ({checked} ratios)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1] if len(sys.argv) > 1 else ".")))
