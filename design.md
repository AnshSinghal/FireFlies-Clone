# Design Reference — Fireflies.ai Clone

Derived from **PLAN.md Part A**. This is the single source of truth for the design layer.
Everything in `PLAN.md` Part C (tasks T-01 → T-46) implements against this document.

> **Read this before writing a single feature component.** The evaluator compares your screen
> against a real Fireflies screenshot side by side. Pixel proximity on *spacing, type scale and
> colour* buys more marks than extra features.

**Rule:** every colour, size, duration and radius in the app resolves to a token defined here.
Hex codes exist in exactly one file — `frontend/src/styles/tokens.css`. Nowhere else.

---

## 1. Route map

Fireflies is a **left-rail app shell** with two hero surfaces: the *Notebook* (meetings library)
and the *Notepad* (meeting detail). Everything else is secondary.

| Route | Fireflies equivalent | Build status |
|---|---|---|
| `/` | Home / Welcome | **Build** — redirects to `/notebook` (document in README) |
| `/notebook` | Notebook — meetings library | **Build (core)** |
| `/notebook?channel=my-meetings` | "My Meetings" channel | **Build** |
| `/notebook?channel=all-meetings` | "All Meetings" channel | **Build** |
| `/notebook?channel=<slug>` | Custom channels (`#` public / 🔒 private) | **Build (bonus — tags, T-36)** |
| `/meeting/[id]` | Notepad — meeting detail | **Build (core)** |
| `/meeting/[id]?t=<seconds>` | Deep-link to a transcript timestamp | **Build (core)** |
| `/search` | Global cross-meeting search | **Build (bonus, T-35)** |
| `/upload` | Upload / paste transcript | **Build (core)** |
| `/settings/*` | Settings hub | **Build shell + 2 real tabs**, rest placeholder |
| `/apps` | AI Skills / AI Apps | **Placeholder** — "Coming Soon" |
| `/integrations` | Zoom / Meet / CRM integrations | **Placeholder** |
| `/team` | Team & sharing | **Placeholder** |
| `/analytics` | Conversation intelligence | **Placeholder** |

> ⚠️ **Known inconsistency:** the sidebar lists `Home → /` with exact-match active logic (T-07.5),
> but `/` redirects to `/notebook` — so Home can never render active. Either make `/` a real
> welcome screen or drop Home from the nav. Decide at T-07.

---

## 2. Layout anatomy

### 2.1 Global shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR  h=56px  bg=surface-0  border-bottom 1px border-subtle                 │
│ [☰] [LOGO 24px + wordmark]   [ 🔍 global search — max-w 560px, centred ]      │
│                                   [+ Upload] [🔔] [? ] [avatar 32px ▾]       │
├────────────┬─────────────────────────────────────────────────────────────────┤
│ LEFT RAIL  │                                                                  │
│ w=240px    │                      MAIN CONTENT                                │
│ collapsed  │                      max-w 1440px, px-24                         │
│ w=64px     │                                                                  │
│ bg=        │                                                                  │
│ surface-1  │                                                                  │
│            │                                                                  │
│ Home       │                                                                  │
│ Meetings   │                                                                  │
│ Uploads    │                                                                  │
│ AI Apps    │                                                                  │
│ Analytics  │                                                                  │
│ ─────────  │                                                                  │
│ CHANNELS   │                                                                  │
│  My Mtgs   │                                                                  │
│  All Mtgs  │                                                                  │
│  # design  │                                                                  │
│  🔒 exec   │                                                                  │
│ ─────────  │                                                                  │
│ Settings   │                                                                  │
│ Help       │                                                                  │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

Implement as CSS Grid (`grid-template-columns: var(--rail-w) 1fr`), **not** absolute positioning —
grid makes the collapse animation trivial and keeps scroll containers sane.

### 2.2 Notebook (library) — `/notebook`

```
Page header:   H1 "Meetings"  (28px/700)   ·  subtitle "N meetings"  (13px/muted)
Toolbar row:   [🔍 Search meetings…            ]  [Filters ▾ (n)]  [Sort: Recent ▾]  [⊞|☰ view]
Chip row:      [Hosted by me] [Shared with me] [Has action items]   ← toggle chips, pill radius
Table header:  ☐ | TITLE | DATE | DURATION | PARTICIPANTS | ACTION ITEMS |   (sticky, text-label)
Rows (h=82):   ☐ | ▶thumb  Title bold 15px   | Jul 24, 2026 | 42:18 | ●●●+3 | 4 open |  [⋯]
                        ↳ 13px muted preview of overview, 1 line, ellipsis
Bulk bar:      appears bottom-centre when ≥1 checked — "3 selected · Move · Delete · Clear"
Pagination:    "Showing 1–20 of 47"  [‹] [1][2][3] [›]
```

**Column widths:** `checkbox 48` · `title flex-1 min-0` · `date 120` · `duration 80 right-aligned
tnum` · `participants 140` · `action items 100` · `kebab 48`.

> ⚠️ **The reference screenshots contradict this layout — resolve at T-12.**
> `docs/reference/fireflies/02.png` shows the real Notebook as **date-grouped cards**, not a table:
> a `Sat, Jul 25` heading, then bordered cards each carrying a 40px squircle avatar, the title with
> a `›` affordance, and one metadata line (`Jul 25 · 9:00 AM · 30 min · Goyal`). There are no
> column headers, no per-column alignment, and no separate duration or participants column.
>
> The table spec above comes from PLAN.md A2.1 and may describe an older Fireflies build. Since the
> grading is a side-by-side screenshot comparison, **the screenshot wins** — but the plan's row
> anatomy, hover behaviour and `data-testid` names are still the contract T-12's tests are written
> against. Decide deliberately at T-12 and record it.

**Row hover behaviour — this is a graded detail:**
- Row background → `--ff-surface-hover`
- Checkbox fades in (opacity 0 → 1, 120ms) **replacing** the play thumbnail — reserve the same
  40×40 box so nothing shifts
- `[Details]` ghost button and `[⋯]` kebab fade in on the right
- Cursor `pointer` on the whole row; clicking anywhere except checkbox/kebab navigates to
  `/meeting/[id]`

### 2.3 Notepad (detail) — `/meeting/[id]`

```
┌─ Meeting header bar (h=64, sticky) ────────────────────────────────────────────┐
│ [←]  Q3 Roadmap Sync ✏      Jul 24, 2026 · 10:00 AM · 42:18 · 5 participants  │
│                     [🔗 Copy link] [⬆ Share] [⋯ menu]                          │
├──────┬──────────────────────────────────┬──────────────────────────────────────┤
│ ICON │  LEFT PANEL — Summary            │  RIGHT PANEL — Transcript            │
│ RAIL │  (default 50%, resizable 30–70%) │                                      │
│ 56px │                                  │  ┌ Player card ──────────────────┐   │
│      │  ┌ Summary header ────────────┐  │  │ ▶ ──●─────────── 12:04/42:18 │   │
│  🔍  │  │ General Summary ▾  [📋][⋯] │  │  │ 1x ▾   🔊 ──── ⛶             │   │
│  📑  │  └────────────────────────────┘  │  └───────────────────────────────┘   │
│  🎙  │                                  │                                      │
│  💬  │  KEYWORDS                        │  [🔍 Find in transcript] [✏ Edit]    │
│  🔖  │  [pricing][Q3][churn][API]…      │   ‹ 3 of 11 ›                        │
│      │                                  │                                      │
│      │  MEETING OVERVIEW                │  ● SC  Sarah Chen        00:00       │
│      │  paragraph…                      │     Good morning everyone, let's…    │
│      │                                  │                                      │
│      │  MEETING OUTLINE                 │  ● MP  Marcus Patel      00:14       │
│      │  00:00 Intro & agenda            │     Sure — I pulled the Q3 numbers…  │
│      │  04:32 Pricing discussion        │                                      │
│      │                                  │  ← ACTIVE LINE: left border 3px      │
│      │  BULLET-POINT NOTES              │     accent + bg accent-subtle        │
│      │  • …                             │                                      │
│      │                                  │                                      │
│      │  ACTION ITEMS                    │                                      │
│      │  ☐ Marcus — send pricing deck    │                                      │
│      │     due Jul 30  [🗑]              │                                      │
│      │  ☑ Sarah — book follow-up        │                                      │
└──────┴──────────────────────────────────┴──────────────────────────────────────┘
```

**Independent scroll containers.** Summary and transcript each scroll internally; the *page* must
not scroll. `height: calc(100vh - 120px)` + `overflow-y: auto` on each. Page-level scroll here is
instantly noticeable against the real app.

**Icon rail (left, 56px)** — vertical, icon-only, tooltip on hover to the right:
`🔍 Smart Search` · `📑 Index` · `🎙 Soundbites` · `💬 Comments` · `🔖 Bookmarks`.
Active item: accent-tinted rounded-square background, accent icon colour. Only one flyout open at
a time; each flyout is 320px over the summary panel.

### 2.4 The five canonical summary sections

Fireflies' default summary template has exactly these, in this order. **Do not rename or reorder —
reproduce them verbatim.** Getting these right is free marks.

1. **Keywords** — 6 most important terms, rendered as pills
2. **Meeting Overview** — one paragraph, 3–5 sentences
3. **Meeting Outline** — timestamped chapter list, each timestamp clickable → seeks player
4. **Bullet-Point Notes** — grouped by outline chapter, nested bullets
5. **Action Items** — grouped by assignee, each with a checkbox

---

## 3. Design tokens

### 3.0 Calibration — done (T-02.1)

**Status: complete.** Sampled from eight real screenshots in `docs/reference/fireflies/` across four
passes (flat fills by modal colour, text by modal-dark-pixel, dividers by edge scan). Every value
below is either `[S]` sampled or `[D]` derived, and `tokens.css` carries the same markers.

**The researched palette in PLAN.md A3.1 was wrong in three material ways:**

| | PLAN.md guessed | Reality | Consequence |
|---|---|---|---|
| Accent | `#2A6EF4` blue | **`#6A39EF` violet** | Every accented surface in the app |
| App background | `#F7F8FA` grey | **`#FFFFFF`** | Fireflies is white-on-white |
| Rail vs content | Different surfaces | **Both white**, split by a 1px `#ECEDF1` border | Separation is borders, not fills |

The surface hierarchy is real but *far* subtler than assumed — `#FFFFFF` → `#FCFCFD` → `#F9FAFB`.
Do not "improve" the contrast between them; that flatness is the look.

**Not observable from the reference set**, so still derived and unverified: the entire notepad
(active transcript line, speaker colours, player), search-highlight colours, all hover states, and
dark mode. Re-calibrate if a transcript screenshot becomes available.

### 3.1 Two-layer architecture (T-02.3)

```
Primitive layer   --ff-violet-600: #6A39EF;
       ↓
Semantic layer    --ff-accent: var(--ff-violet-600);
       ↓
Components        consume ONLY the semantic layer
```

Dark mode then re-points semantics at different primitives instead of redefining 40 values.
**A component that needs a bespoke dark-mode override is a token-layer bug — fix it here, not
with an override.**

### 3.2 Colour — light theme (default)

`[S]` sampled from the reference screenshots · `[D]` derived.

| Token | Value | | Usage |
|---|---|---|---|
| `--ff-accent` | `#6A39EF` | [S] | Primary violet: buttons, active nav, links, focus ring |
| `--ff-accent-hover` | `#5A27E0` | [D] | Button hover |
| `--ff-accent-pressed` | `#3E1C96` | [S] | Button active |
| `--ff-accent-strong` | `#541DDC` | [S] | Active nav **label text** (darker than the fill) |
| `--ff-accent-subtle` | `#F4F3FF` | [S] | Active-nav bg, active transcript line bg, selected row |
| `--ff-accent-border` | `#D5CCFB` | [D] | Border on accent-subtle surfaces |
| `--ff-brand-mark` | `#C43990` | [S] | The fireflies.ai logo glyph — magenta, **not** amber |
| `--ff-brand-amber` | `#F79009` | [D] | "AI generated" badges, soundbite highlights |
| `--ff-surface-0` | `#FFFFFF` | [S] | Topbar, cards, panels, rows, **and the left rail** |
| `--ff-surface-1` | `#FCFCFD` | [S] | Secondary panels (e.g. the channels column) |
| `--ff-surface-2` | `#F9FAFB` | [S] | Search input, chips, status pills, table header |
| `--ff-surface-hover` | `#F4F5F7` | [D] | Row / nav-item hover |
| `--ff-border-subtle` | `#ECEDF1` | [S] | 1px dividers, card borders, input borders |
| `--ff-border-strong` | `#DDE0E7` | [D] | Input hover border, table outer border |
| `--ff-text-primary` | `#0B1424` | [S] | Headings, meeting titles, transcript body |
| `--ff-text-secondary` | `#616B81` | [S] | Nav labels, list metadata, summary paragraphs |
| `--ff-text-muted` | `#667085` | [D]* | Timestamps, column headers, placeholders |
| `--ff-text-inverse` | `#FFFFFF` | [S] | Text on accent |
| `--ff-success` | `#0E9F6E` | [D] | Completed action items, positive sentiment |
| `--ff-success-subtle` | `#D7FBE3` | [S] | Completed action item row bg (the Upgrade button fill) |
| `--ff-success-strong` | `#036C60` | [S] | Text on a success tint |
| `--ff-warning` | `#F79009` | [D] | Due-soon badge |
| `--ff-warning-subtle` | `#FFFAEC` | [S] | Notice banner bg |
| `--ff-danger` | `#D92D20` | [D] | Delete, overdue, destructive confirm |
| `--ff-danger-subtle` | `#FEF3F2` | [D] | Destructive hover bg |
| `--ff-highlight` | `#FFE9A8` | [D] | Search match highlight background |
| `--ff-highlight-active` | `#FFC933` | [D] | *Current* search match (of N) |

\* **`--ff-text-muted` is deliberately not the sampled value.** Fireflies' own muted grey is
`#97A1B3`, which scores **2.60:1** on white — below every WCAG threshold, including the 3:1 non-text
floor.

ADR-012 decided to darken it only ~9%, to `#8992A2` (3.14:1) — a shift invisible in a side-by-side —
and to accept one known axe exception rather than depart visibly from the reference.

**That is not what shipped.** The implementation carries `#667085` at **4.97:1**, which is full AA,
and dark carries `#8B93A5` at 5.66:1. Accessibility won the conflict outright. This table said
`#8992A2` until 2026-07-28, when a token-by-token diff of this file against `tokens.css` caught it —
`design.md` had been specifying a colour the app does not use, on a token that appears on every
timestamp and every metadata line in the product.

The fidelity cost is real and is the one worth stating: our metadata text is visibly darker than
Fireflies', which is a deliberate trade of side-by-side likeness for legibility. It is the one place
this clone knowingly does **not** match the reference on colour.

No large danger surface appears in the reference set, so red is derived — the only red pixels are a
16px "not allowed" glyph, too antialiased to trust.

### 3.3 Colour — dark theme (T-38)

Applied at `[data-theme="dark"]`. In dark mode **elevation is conveyed by lighter surfaces, not by
shadows** — modals and popovers use `--ff-surface-2` and shadows drop to near-invisible. Copying
light-mode shadows into dark is the classic tell of a rushed dark theme.

| Token | Value |
|---|---|
| `--ff-surface-0` | `#14141D` |
| `--ff-surface-1` | `#0E0E15` |
| `--ff-surface-2` | `#1C1C28` |
| `--ff-surface-hover` | `#23232F` |
| `--ff-border-subtle` | `#2C2C3A` |
| `--ff-border-strong` | `#3B3B4C` |
| `--ff-text-primary` | `#F2F4F7` |
| `--ff-text-secondary` | `#A8B0BE` |
| `--ff-text-muted` | `#8B93A5` |
| `--ff-accent` | `#9B7BFF` |
| `--ff-accent-subtle` | `#1D1638` |
| `--ff-highlight` | `#6B5714` |

The light accent `#6A39EF` fails contrast on dark backgrounds — hence the lifted `#9B7BFF`.

> **The whole dark table above was stale until 2026-07-28.** Eight of its ten rows still carried the
> blue-grey scale this document specified before T-02.1 re-hued the palette to violet — `#161A22`
> against the shipped `#14141D`, `#232935` against `#23232F`, and so on. `tokens.css` was re-hued;
> this table was not. Caught by `scripts/check_design_tokens.py`, which resolves every hex here
> through the token cascade and fails when the two disagree.

> These three values were `#2A6EF4` / `#5B8DEF` / `#18243C` until 2026-07-28 — the blue this
> document specified before T-02.1 sampled the reference screenshots and found violet
> (**ADR-011**). §3.2 and §3.4 were corrected then; the two-layer example above, this line, and the
> dark table were not, so the file that CLAUDE.md calls the token authority spent two days teaching
> a colour the app does not use. `#5B8DEF` appears nowhere in `tokens.css`. Dark resolves through
> the same semantic name: the `--ff-violet-600` primitive is re-pointed to `#9B7BFF` under
> `[data-theme='dark']`, which is the whole point of the two-layer split.
Speaker colours need a dark variant set (lift lightness ~15%, drop saturation ~10%).

### 3.4 Speaker palette

Eight colours, cycled by index. Re-hued to lead with the brand violet — no transcript view exists in
the reference set, so these are `[D]` derived and chosen to stay distinguishable at 24px:

```
#6A39EF   #0E9F6E   #F79009   #C43990   #D92D20   #06AED4   #8869FA   #7A5AF5
```

Implemented in `lib/utils/speaker-color.ts` (`getSpeakerColor`), which returns
`var(--ff-speaker-N)` rather than a hex — so the dark palette re-points these for free.

Assign by **stable hash of speaker name → index** (FNV-1a of the lowercased, trimmed name, mod 8),
not by array position — so a speaker keeps their colour across the transcript, the outline, the
participant avatars and the talk-time bars.

> ⚠️ **Open decision:** the DB also stores `speakers.color_index` (T-03). Pick one authority — the
> recommendation is DB-authoritative with the hash as fallback for unpersisted speakers — or the
> two will silently diverge. Log it in `docs/decisions.md`.

### 3.5 Typography

| Token | Value |
|---|---|
| Font family | `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` (self-host via `next/font`) |
| `--ff-text-display` | 28px / 36px / 700 / -0.02em — page H1 |
| `--ff-text-h2` | 20px / 28px / 600 — panel titles, modal titles |
| `--ff-text-h3` | 16px / 24px / 600 — summary section headings |
| `--ff-text-body` | 14px / 22px / 400 — default |
| `--ff-text-body-strong` | 14px / 22px / 500 |
| `--ff-text-title-row` | 15px / 22px / 600 — meeting title in a list row |
| `--ff-text-transcript` | 15px / 26px / 400 — transcript body (looser leading, **this matters**) |
| `--ff-text-sm` | 13px / 18px / 400 — metadata, previews |
| `--ff-text-xs` | 12px / 16px / 500 — badges, chips, timestamps |
| `--ff-text-label` | 12px / 16px / 600 / 0.04em / uppercase — table column headers, section labels |

Each maps to one Tailwind `fontSize` entry carrying `lineHeight`, `fontWeight` and `letterSpacing`
together, so `text-transcript` is **one class, not four**.

`font-feature-settings: 'cv11','ss01'` for the more readable Inter variant.
**`font-variant-numeric: tabular-nums` on every timestamp and duration** — via a `.tnum` utility.

**Density check:** Fireflies runs a **14px body / 15px title** scale, tighter than Tailwind
defaults. If your text looks bigger than the reference at the same zoom, your base is wrong.

### 3.6 Spacing, radius, elevation, motion

```
--ff-space: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64      (4px base)

--ff-radius-sm:   6px     (chips, badges, inputs)
--ff-radius-md:   8px     (buttons, dropdown items)
--ff-radius-lg:   12px    (cards, panels, modals)
--ff-radius-full: 999px   (pills, avatars, toggle chips)

--ff-shadow-xs:    0 1px 2px rgba(16,24,40,.05)
--ff-shadow-sm:    0 1px 3px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06)
--ff-shadow-md:    0 4px 8px -2px rgba(16,24,40,.10), 0 2px 4px -2px rgba(16,24,40,.06)
--ff-shadow-lg:    0 12px 16px -4px rgba(16,24,40,.08), 0 4px 6px -2px rgba(16,24,40,.03)
--ff-shadow-focus: 0 0 0 4px rgba(42,110,244,.24)

--ff-dur-fast: 120ms      --ff-ease: cubic-bezier(.4,0,.2,1)
--ff-dur-base: 200ms
--ff-dur-slow: 320ms
```

Wire these into Tailwind so `rounded-lg` **is** 12px and `shadow-md` **is** the exact value above.

**`prefers-reduced-motion`:** a global rule collapsing all transitions to `0.01ms`. Do this at
T-02, not later — retrofitting is miserable.

**Focus-visible:** one global `:focus-visible` rule → `--ff-shadow-focus`. No `outline: none`
anywhere without a replacement. Every interactive element must be keyboard-visible.

**Scrollbars:** thin (8px), `--ff-border-strong` thumb, transparent track, rounded. Fireflies'
panels do not show chunky default scrollbars.

### 3.7 Fixed sizes — memorise these, they drive every layout test

```
topbar             56        detail icon rail   56        meeting row      82
left rail         240        collapsed rail     64
button md          36        button sm          32        input            40
avatar sm          24        avatar md          32        avatar lg        40
modal sm          440        modal md          560        modal lg        720
toast             380
```

### 3.8 Iconography

`lucide-react` only. Stroke width **1.75**. Size **20** in nav / **16** inline / **18** in buttons.

- Never mix icon libraries.
- Never use emoji as a production icon. *(The emoji throughout this document are shorthand for the
  reader, not literal glyphs.)*
- Every icon-only control needs **both** `aria-label` and a tooltip. No exceptions.

---

## 4. Component inventory

Build once in `components/ui/`, reuse everywhere. These have **zero domain knowledge** — no
concept of a meeting, transcript or speaker.

| # | Component | Used by |
|---|---|---|
| 1 | `Button` (primary/secondary/ghost/danger/link · sm/md/lg · loading · icon-only) | everywhere |
| 2 | `IconButton` + `Tooltip` | topbar, rails, rows |
| 3 | `Input` / `Textarea` / `Select` / `DatePicker` | forms, filters |
| 4 | `SearchInput` (leading icon, clear ✕, ⌘K hint, debounce) | topbar, notebook, transcript |
| 5 | `Chip` (toggle · removable · static) | filters, keywords, tags |
| 6 | `Badge` (neutral/success/warning/danger/accent) | action item counts, statuses |
| 7 | `Avatar` + `AvatarGroup` (overflow `+N`) | rows, participants, transcript |
| 8 | `Dropdown` / `Menu` (keyboard nav, esc, click-outside) | kebabs, sort, summary template |
| 9 | `Modal` (focus trap, esc, backdrop, 3 sizes) | create/edit/delete |
| 10 | `Toast` + `ToastProvider` (success/error/info/undo) | all mutations |
| 11 | `Tabs` (underline indicator, animated) | settings, detail panels on mobile |
| 12 | `Checkbox` / `Switch` / `Radio` | bulk select, action items, settings |
| 13 | `Skeleton` (row/card/text variants) | all loading states |
| 14 | `EmptyState` (illustration + title + body + CTA) | no meetings, no results |
| 15 | `Pagination` | notebook |
| 16 | `ResizablePanels` (drag handle, min/max, persisted) | detail view |
| 17 | `Popover` | filters panel, share |
| 18 | `ProgressBar` / `Seekbar` | player, upload |
| 19 | `Highlighter` (safe mark-wrapping, **no** `dangerouslySetInnerHTML`) | transcript + global search |
| 20 | `ConfirmDialog` (typed confirmation for destructive) | delete meeting |

Build `/dev/tokens` and `/dev/components` gallery pages (dev-only, excluded from the prod build).
They are the visual-regression baseline and the fastest debugging surface in the project — a wrong
hex takes 2 seconds to spot instead of 20 minutes.

---

## 5. Anti-patterns — what "wrong" looks like

Checked against the reference screenshot, these are the tells:

**Colour & type**
- Default Tailwind blue `#3B82F6` anywhere
- Pure `#000` text on pure `#FFF` — the neutrals must have a faint cool cast
- `#808080`-family greys (dead, warmth-less)
- 16px body text, making the app feel like a blog instead of a dense productivity tool

**Shell**
- A dark-navy sidebar — that's Notion/Linear, not Fireflies
- Active nav shown by a left border bar only, or a full-width highlight touching both edges
  (it must be inset 8px)
- A search input stretching the full window width; a topbar taller than 64px

**Notebook**
- A card grid as the default view — Fireflies' primary view is the list
- Rows over 90px; title and date at the same weight
- Duration as `2538 seconds` or `00:42:18` instead of `42:18`
- Participants as a comma-separated name string instead of an avatar group
- The checkbox permanently visible instead of swapping in on hover

**Notepad**
- The whole page scrolling so the header disappears
- A `<pre>` block transcript; a chat-bubble layout (that's Otter)
- Speaker name repeated on every line of the same turn; all speakers the same colour
- Timestamps as `00:00:14.500`
- The browser's default `<audio controls>` widget — an instant fail on the UI criterion
- Summary as one giant text blob, or sections renamed ("TL;DR", "Highlights") or reordered

**Everywhere**
- `window.alert` / `confirm` / `prompt`
- Hardcoded hex outside `tokens.css`
- Three different button heights on one screen
- A native `<select>` sitting next to custom inputs
- Content jumping sideways when a modal opens (compensate the scrollbar width)
- Third-party trademarked logo files (Zoom, Salesforce, or Fireflies' own mark)
