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
Rows (h=72):   ☐ | ▶thumb  Title bold 15px   | Jul 24, 2026 | 42:18 | ●●●+3 | 4 open |  [⋯]
                        ↳ 13px muted preview of overview, 1 line, ellipsis
Bulk bar:      appears bottom-centre when ≥1 checked — "3 selected · Move · Delete · Clear"
Pagination:    "Showing 1–20 of 47"  [‹] [1][2][3] [›]
```

**Column widths:** `checkbox 48` · `title flex-1 min-0` · `date 120` · `duration 80 right-aligned
tnum` · `participants 140` · `action items 100` · `kebab 48`.

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

### 3.0 Calibration — do this first (T-02.1)

The hexes below are a **researched starting palette, not sampled from a live screenshot**. Before
building anything, open the Fireflies reference screenshots in a colour picker and sample these
eight surfaces, overwriting the tokens they map to. Record before/after in `docs/decisions.md`.

| # | Sample this surface | Overwrites token |
|---|---|---|
| 1 | Primary button fill | `--ff-accent` |
| 2 | Active nav item background | `--ff-accent-subtle` |
| 3 | App background | `--ff-surface-1` |
| 4 | Left rail background | `--ff-surface-1` (same token — verify they match) |
| 5 | Meeting title text | `--ff-text-primary` |
| 6 | A timestamp | `--ff-text-muted` |
| 7 | Table header background | `--ff-surface-2` |
| 8 | Active transcript line background | `--ff-accent-subtle` (same as #2 — verify) |

Plus `--ff-brand-amber` from the firefly mark. Everything else in the plan references tokens *by
name*, so this one-file correction propagates everywhere.

### 3.1 Two-layer architecture (T-02.3)

```
Primitive layer   --ff-blue-600: #2A6EF4;
       ↓
Semantic layer    --ff-accent: var(--ff-blue-600);
       ↓
Components        consume ONLY the semantic layer
```

Dark mode then re-points semantics at different primitives instead of redefining 40 values.
**A component that needs a bespoke dark-mode override is a token-layer bug — fix it here, not
with an override.**

### 3.2 Colour — light theme (default)

| Token | Value | Usage |
|---|---|---|
| `--ff-accent` | `#2A6EF4` | Primary blue: buttons, active nav, links, focus ring |
| `--ff-accent-hover` | `#1F5BD4` | Button hover |
| `--ff-accent-pressed` | `#1848AC` | Button active |
| `--ff-accent-subtle` | `#EAF1FE` | Active-nav bg, active transcript line bg, selected row |
| `--ff-accent-border` | `#BBD3FB` | Border on accent-subtle surfaces |
| `--ff-brand-amber` | `#F5B301` | Firefly mark, "AI generated" badges, soundbite highlights |
| `--ff-surface-0` | `#FFFFFF` | Cards, topbar, panels, table rows |
| `--ff-surface-1` | `#F7F8FA` | App background, left rail |
| `--ff-surface-2` | `#EFF1F5` | Table header, chip default, code blocks |
| `--ff-surface-hover` | `#F2F4F7` | Row / nav-item hover |
| `--ff-border-subtle` | `#E4E7EC` | 1px dividers, card borders, input borders |
| `--ff-border-strong` | `#CFD4DC` | Input hover border, table outer border |
| `--ff-text-primary` | `#101828` | Headings, meeting titles, transcript body |
| `--ff-text-secondary` | `#475467` | Body copy, summary paragraphs |
| `--ff-text-muted` | `#98A2B3` | Timestamps, column headers, placeholders, metadata |
| `--ff-text-inverse` | `#FFFFFF` | Text on accent |
| `--ff-success` | `#12B76A` | Completed action items, positive sentiment |
| `--ff-success-subtle` | `#ECFDF3` | Completed action item row bg |
| `--ff-warning` | `#F79009` | Due-soon badge, neutral sentiment |
| `--ff-danger` | `#F04438` | Delete, overdue, destructive confirm |
| `--ff-danger-subtle` | `#FEF3F2` | Destructive hover bg |
| `--ff-highlight` | `#FFE9A8` | Search match highlight background |
| `--ff-highlight-active` | `#FFC933` | *Current* search match (of N) |

### 3.3 Colour — dark theme (T-38)

Applied at `[data-theme="dark"]`. In dark mode **elevation is conveyed by lighter surfaces, not by
shadows** — modals and popovers use `--ff-surface-2` and shadows drop to near-invisible. Copying
light-mode shadows into dark is the classic tell of a rushed dark theme.

| Token | Value |
|---|---|
| `--ff-surface-0` | `#161A22` |
| `--ff-surface-1` | `#0F1218` |
| `--ff-surface-2` | `#1F242E` |
| `--ff-surface-hover` | `#232935` |
| `--ff-border-subtle` | `#2A313D` |
| `--ff-border-strong` | `#3A4351` |
| `--ff-text-primary` | `#F2F4F7` |
| `--ff-text-secondary` | `#B4BCC9` |
| `--ff-text-muted` | `#79839A` |
| `--ff-accent` | `#5B8DEF` |
| `--ff-accent-subtle` | `#18243C` |
| `--ff-highlight` | `#6B5714` |

The light accent `#2A6EF4` fails contrast on dark backgrounds — hence the lifted `#5B8DEF`.
Speaker colours need a dark variant set (lift lightness ~15%, drop saturation ~10%).

### 3.4 Speaker palette

Eight colours, cycled by index:

```
#2A6EF4   #12B76A   #F5B301   #9E77ED   #F04438   #06AED4   #EE46BC   #F79009
```

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
topbar             56        detail icon rail   56        meeting row      72
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
