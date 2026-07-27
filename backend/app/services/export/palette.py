"""The app palette, resolved for document renderers (T-34.5).

These hex values are COPIED from `frontend/src/styles/tokens.css` — the single
source of truth for every colour in the product. A PDF or DOCX cannot read CSS
custom properties, so the light-theme values the exports need are embedded
here, named after the semantic token they mirror. This is the one sanctioned
exception to "hex codes exist in tokens.css and nowhere else", recorded in
docs/decisions.md; if a token changes there, it changes here.
"""

from __future__ import annotations

#: --ff-accent (--ff-violet-600) — the brand violet.
ACCENT = "#6A39EF"
#: --ff-text-primary (--ff-grey-900) — headings and body ink.
INK = "#0B1424"
#: --ff-text-secondary (--ff-grey-700) — labels, metadata.
SECONDARY = "#616B81"
#: --ff-text-muted (--ff-grey-500) — timestamps.
MUTED = "#8992A2"
#: --ff-border-subtle (--ff-grey-200) — rules and table lines.
BORDER = "#ECEDF1"
#: --ff-brand-mark (--ff-magenta-500) — the drawn logo mark's first shape.
BRAND_MARK = "#C43990"
#: --ff-brand-amber (--ff-amber-600) — the drawn logo mark's second shape.
BRAND_AMBER = "#F79009"

#: The product name the drawn mark sits next to (see Topbar). Never the
#: trademarked Fireflies asset — the mark itself is our own two rectangles.
APP_NAME = "Fireflies"
