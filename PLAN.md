# Fireflies.ai Clone — Master Implementation Plan
### SDE Fullstack Assignment · Next.js (TS) + FastAPI + SQLite + Playwright

**Version:** 1.0
**Target effort:** ~24 focused hours
**Stack decision:** Next.js 15 (App Router, TypeScript) · FastAPI + SQLAlchemy 2.0 + Alembic · SQLite · Playwright + pytest
**AI layer decision:** Pluggable provider — `MockProvider` (deterministic, offline, default) + `LLMProvider` (OpenAI/Anthropic, behind env var)

---

## 0. How to read this document

| Symbol | Meaning |
|---|---|
| `T-NN` | Task ID. Use as the git branch name prefix: `feat/T-12-meetings-library` |
| `T-NN.n` | Subtask. Each is a single commit-sized unit of work. |
| **AC** | Acceptance Criteria — objective pass/fail conditions |
| **✅ Should look like** | Positive visual/behavioural assertion |
| **❌ Should NOT look like** | Negative assertion — the common wrong implementation to avoid |
| **PW** | Playwright test case ID, e.g. `PW-12-03`. Maps 1:1 to a `test()` block. |
| `data-testid` | Every interactive element gets one. Naming: `<domain>-<element>-<qualifier>` |

**Golden rule for this assignment:** the evaluator is comparing your screen against a real Fireflies screenshot side by side. Pixel proximity on *spacing, type scale, and colour* buys more marks than extra features. Build Part A (the token layer) properly before writing a single feature component.

**Ordering discipline.** Phases 0→3 are the graded core; do not start Phase 6 (Bonus) until Phase 3 is fully green in Playwright. A half-finished AskFred costs more marks than a missing one.

---

# PART A — Platform Analysis & UI Reference Spec

Everything in Part A is *reference material*, not work. It is the single source of truth that Tasks T-01 → T-46 implement against. Read it once, fully, before starting T-01.

## A1. Route map (what you are cloning)

Fireflies is a **left-rail app shell** with two hero surfaces: the *Notebook* (meetings library) and the *Notepad* (meeting detail). Everything else is secondary.

| Route | Fireflies equivalent | Build status |
|---|---|---|
| `/` | Home / Welcome screen | **Build** — redirects to `/notebook` in our clone (documented in README) |
| `/notebook` | Fireflies Notebook — meetings library | **Build (core)** |
| `/notebook?channel=my-meetings` | "My Meetings" channel | **Build** |
| `/notebook?channel=all-meetings` | "All Meetings" channel | **Build** |
| `/notebook?channel=<slug>` | Custom channels (# public / 🔒 private) | **Build (bonus, tags task)** |
| `/meeting/[id]` | Fireflies Notepad — meeting detail | **Build (core)** |
| `/meeting/[id]?t=<seconds>` | Deep-link to a transcript timestamp | **Build (core)** |
| `/search` | Global cross-meeting search | **Build (bonus)** |
| `/upload` | Upload / paste transcript | **Build (core)** |
| `/settings/*` | Settings hub | **Build shell + 2 real tabs, rest placeholder** |
| `/apps` | AI Skills / AI Apps | **Placeholder** — "Coming Soon" |
| `/integrations` | Zoom / Meet / CRM integrations | **Placeholder** |
| `/team` | Team & sharing | **Placeholder** |
| `/analytics` | Conversation intelligence | **Placeholder** |

## A2. Global layout anatomy

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

### A2.1 Notebook (library) anatomy — `/notebook`

```
Page header:   H1 "Meetings"  (28px/700)   ·  subtitle "N meetings"  (13px/muted)
Toolbar row:   [🔍 Search meetings…            ]  [Filters ▾ (n)]  [Sort: Recent ▾]  [⊞|☰ view]
Chip row:      [Hosted by me] [Shared with me] [Has action items]   ← toggle chips, pill radius
Table header:  ☐ | TITLE | DATE | DURATION | PARTICIPANTS | ACTION ITEMS |        (sticky, 12px/600/uppercase/muted, tracking .04em)
Rows (h=72):   ☐ | ▶thumb  Title bold 15px            | Jul 24, 2026 | 42:18 | ●●●+3 | 4 open |  [⋯]
                        ↳ 13px muted preview of overview, 1 line, ellipsis
Bulk bar:      appears bottom-centre when ≥1 checked — "3 selected · Move · Delete · Clear"
Pagination:    "Showing 1–20 of 47"  [‹] [1][2][3] [›]
```

**Row hover behaviour (this is a graded detail):**
- Row background → `surface-hover`
- Checkbox fades in (opacity 0 → 1, 120ms) replacing the play thumbnail
- `[Details]` ghost button and `[⋯]` kebab fade in on the right
- Cursor `pointer` on the whole row; clicking anywhere except checkbox/kebab navigates to `/meeting/[id]`

### A2.2 Notepad (detail) anatomy — `/meeting/[id]`

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

**Icon rail (left, 56px)** — vertical, icon-only, tooltip on hover to the right:
`🔍 Smart Search` · `📑 Index` · `🎙 Soundbites` · `💬 Comments` · `🔖 Bookmarks`
Active item: accent-tinted rounded square background, accent icon colour.

### A2.3 The five canonical summary sections (do not rename these)

Fireflies' default summary template has exactly these, in this order:

1. **Keywords** — 6 most important terms, rendered as pills
2. **Meeting Overview** — one paragraph, 3–5 sentences
3. **Meeting Outline** — timestamped chapter list, each timestamp clickable → seeks player
4. **Bullet-Point Notes** — grouped by outline chapter, nested bullets
5. **Action Items** — grouped by assignee, each with a checkbox

> Getting these five names and this order exactly right is free marks. Reproduce them verbatim.

## A3. Design tokens

> ⚠️ **Calibration step (do this in T-02.1).** The hexes below are a researched starting palette, not sampled from a live screenshot. Open your Fireflies reference screenshots in a colour picker, sample the 8 values marked `[SAMPLE]`, and overwrite them. Everything else in the plan references tokens by *name*, so a one-file correction propagates everywhere.

### A3.1 Colour — light theme (default)

| Token | Value | Usage |
|---|---|---|
| `--ff-accent` `[SAMPLE]` | `#2A6EF4` | Primary blue: buttons, active nav, links, focus ring |
| `--ff-accent-hover` | `#1F5BD4` | Button hover |
| `--ff-accent-pressed` | `#1848AC` | Button active |
| `--ff-accent-subtle` | `#EAF1FE` | Active-nav bg, active transcript line bg, selected row |
| `--ff-accent-border` | `#BBD3FB` | Border on accent-subtle surfaces |
| `--ff-brand-amber` `[SAMPLE]` | `#F5B301` | Firefly mark, "AI generated" badges, soundbite highlights |
| `--ff-surface-0` | `#FFFFFF` | Cards, topbar, panels, table rows |
| `--ff-surface-1` `[SAMPLE]` | `#F7F8FA` | App background, left rail |
| `--ff-surface-2` | `#EFF1F5` | Table header, chip default, code blocks |
| `--ff-surface-hover` | `#F2F4F7` | Row / nav-item hover |
| `--ff-border-subtle` | `#E4E7EC` | 1px dividers, card borders, input borders |
| `--ff-border-strong` | `#CFD4DC` | Input hover border, table outer border |
| `--ff-text-primary` `[SAMPLE]` | `#101828` | Headings, meeting titles, transcript body |
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

### A3.2 Colour — dark theme (bonus T-38)

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

### A3.3 Speaker palette (deterministic, 8 colours, cycle by index)

`#2A6EF4` `#12B76A` `#F5B301` `#9E77ED` `#F04438` `#06AED4` `#EE46BC` `#F79009`

Assign by **stable hash of speaker name → index**, not by array position, so a speaker keeps their colour across the transcript, the outline, and the participant avatars.

### A3.4 Typography

| Token | Value |
|---|---|
| Font family | `Inter, -apple-system, "Segoe UI", Roboto, sans-serif` (self-host via `next/font`) |
| `--ff-text-display` | 28px / 36px / 700 / -0.02em — page H1 |
| `--ff-text-h2` | 20px / 28px / 600 — panel titles, modal titles |
| `--ff-text-h3` | 16px / 24px / 600 — summary section headings |
| `--ff-text-body` | 14px / 22px / 400 — default |
| `--ff-text-body-strong` | 14px / 22px / 500 |
| `--ff-text-title-row` | 15px / 22px / 600 — meeting title in a list row |
| `--ff-text-transcript` | 15px / 26px / 400 — transcript body (looser leading, this matters) |
| `--ff-text-sm` | 13px / 18px / 400 — metadata, previews |
| `--ff-text-xs` | 12px / 16px / 500 — badges, chips, timestamps |
| `--ff-text-label` | 12px / 16px / 600 / 0.04em / uppercase — table column headers, section labels |
| Tabular numerals | `font-variant-numeric: tabular-nums` on **all** timestamps and durations |

### A3.5 Spacing, radius, elevation, motion

```
--ff-space: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64      (4px base)
--ff-radius-sm: 6px    (chips, badges, inputs)
--ff-radius-md: 8px    (buttons, dropdown items)
--ff-radius-lg: 12px   (cards, panels, modals)
--ff-radius-full: 999px (pills, avatars, toggle chips)

--ff-shadow-xs: 0 1px 2px rgba(16,24,40,.05)
--ff-shadow-sm: 0 1px 3px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06)
--ff-shadow-md: 0 4px 8px -2px rgba(16,24,40,.10), 0 2px 4px -2px rgba(16,24,40,.06)
--ff-shadow-lg: 0 12px 16px -4px rgba(16,24,40,.08), 0 4px 6px -2px rgba(16,24,40,.03)
--ff-shadow-focus: 0 0 0 4px rgba(42,110,244,.24)

--ff-dur-fast: 120ms      --ff-ease: cubic-bezier(.4,0,.2,1)
--ff-dur-base: 200ms
--ff-dur-slow: 320ms
```

**Fixed sizes (memorise these — they drive every layout test):**
`topbar 56` · `left rail 240 / collapsed 64` · `detail icon rail 56` · `meeting row 72` ·
`button md 36` · `button sm 32` · `input 40` · `avatar sm 24 / md 32 / lg 40` ·
`modal sm 440 / md 560 / lg 720` · `toast 380`

### A3.6 Iconography

`lucide-react`, stroke width **1.75**, size **20** in nav / **16** inline / **18** in buttons.
Never mix icon libraries. Never use emoji as a production icon (the emoji in this document are shorthand for the reader, not literal glyphs).

## A4. Component inventory (build once, reuse everywhere)

| # | Component | Used by |
|---|---|---|
| 1 | `Button` (primary/secondary/ghost/danger · sm/md · loading · icon-only) | everywhere |
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
| 19 | `Highlighter` (safe mark-wrapping, no dangerouslySetInnerHTML) | transcript + global search |
| 20 | `ConfirmDialog` (typed confirmation for destructive) | delete meeting |

---

# PART B — Milestones & time budget

| Phase | Tasks | Hours | Exit gate |
|---|---|---|---|
| **0 · Foundations** | T-01 → T-06 | 4.0 | `docker compose up` serves both apps; `/api/health` 200; seed DB has 8 meetings; token file complete |
| **1 · App chrome** | T-07 → T-10 | 2.5 | Sidebar + topbar pixel-match reference; toast + modal primitives demoable |
| **2 · Notebook** | T-11 → T-16 | 4.0 | Library lists, searches, filters, sorts, paginates, bulk-deletes |
| **3 · Notepad** | T-17 → T-25 | 6.0 | Transcript ↔ player sync both directions; all 5 summary sections; action items CRUD |
| **4 · CRUD & AI** | T-26 → T-29 | 2.5 | Upload `.txt/.vtt/.srt/.json`, edit, delete, summary regeneration |
| **5 · Placeholders** | T-30 | 0.5 | All secondary routes render branded "Coming Soon" |
| **6 · Bonus** | T-31 → T-38 | 3.0 | Ship in priority order; stop when the clock says stop |
| **7 · QA** | T-39 → T-43 | 1.5 | `npx playwright test` green; `pytest` green |
| **8 · Ship** | T-44 → T-46 | 1.0 | Public repo, live URL, README complete |
| | | **25.0** | Buffer comes out of Phase 6 |

**Bonus priority order** (build top-down, cut from the bottom):
`T-38 Dark mode` → `T-35 Global search` → `T-34 Export` → `T-36 Tags` → `T-31 Comments` → `T-33 Soundbites` → `T-32 Highlights` → `T-37 AskFred`

**Commit discipline.** One commit per subtask, message format `T-12.4: sticky table header with tabular-nums`. A clean, granular history is direct evidence for the "Code Understanding" criterion during the interview.

---

# PART C — TASKS

# PHASE 0 · FOUNDATIONS

---

## T-01 · Repository, tooling & project scaffolding

**Goal:** a monorepo that a stranger can run in two commands.
**Branch:** `chore/T-01-scaffold` · **Est:** 60 min

### Subtasks

**T-01.1 — Create the repo skeleton.**
```
fireflies-clone/
├─ frontend/            # Next.js 15, App Router, TypeScript strict
├─ backend/             # FastAPI
├─ e2e/                 # Playwright (owns its own package.json)
├─ docs/                # schema.png, api.md, decisions.md
├─ .github/workflows/ci.yml
├─ docker-compose.yml
├─ .gitignore           # *.db, .env, __pycache__, .next, node_modules, test-results
├─ .env.example
└─ README.md
```
Public GitHub repo, `main` branch protected in spirit (you'll self-merge, but use PRs — the history reads better).

**T-01.2 — Bootstrap Next.js.**
`npx create-next-app@latest frontend --ts --app --tailwind --eslint --src-dir --import-alias "@/*"`.
Immediately set `"strict": true` and `"noUncheckedIndexedAccess": true` in `tsconfig.json`.

**T-01.3 — Frontend folder convention** (enforced by lint rule in T-01.7):
```
src/
├─ app/                 # routes ONLY — no business logic in page.tsx
├─ components/ui/       # the 20 primitives from A4 — zero domain knowledge
├─ components/layout/   # Sidebar, Topbar, AppShell
├─ features/notebook/   # MeetingRow, FiltersPanel, useMeetings…
├─ features/notepad/    # TranscriptPanel, SummaryPanel, Player…
├─ features/actions/    # ActionItemList…
├─ lib/api/             # generated client + typed fetch wrapper
├─ lib/hooks/           # useDebounce, useMediaQuery, useLocalStorage
├─ lib/utils/           # formatDuration, formatDate, hashToIndex
├─ styles/tokens.css    # the ONLY place hex codes exist
└─ types/               # shared TS types (generated from OpenAPI where possible)
```

**T-01.4 — Bootstrap FastAPI.**
`backend/` with `uv` or `poetry`. Deps: `fastapi uvicorn[standard] sqlalchemy alembic pydantic-settings python-multipart webvtt-py httpx`. Dev: `pytest pytest-asyncio ruff mypy`.

**T-01.5 — Backend folder convention (layered, this is graded):**
```
app/
├─ main.py              # app factory, CORS, exception handlers, router mounting
├─ core/config.py       # pydantic-settings, reads .env
├─ core/deps.py         # get_db, get_ai_provider
├─ db/base.py session.py
├─ models/              # SQLAlchemy ORM — meeting.py, transcript.py, …
├─ schemas/             # Pydantic request/response — NEVER return ORM objects
├─ api/v1/routers/      # thin: parse → call service → return schema
├─ services/            # ALL business logic lives here
├─ ai/                  # provider.py, mock.py, llm.py, prompts/
├─ parsers/             # txt.py vtt.py srt.py json_.py
└─ seed/                # seed.py + data/*.json
```
> Routers must contain **no** `db.query(...)`. A router that talks to the ORM directly is the single most common way to lose "Backend / API Design" marks.

**T-01.6 — Configure Tailwind against tokens, not hexes.**
`tailwind.config.ts` maps `colors.accent.DEFAULT` → `var(--ff-accent)` etc. Delete Tailwind's default palette so `bg-blue-500` becomes a *compile error*. This mechanically prevents off-palette colour.

**T-01.7 — Lint & format gates.** ESLint (`@typescript-eslint`, `eslint-plugin-import` with a `no-restricted-imports` rule blocking `features/*` → `features/*` cross-imports), Prettier, `ruff` + `mypy --strict` for backend. Husky pre-commit running `lint-staged`.

**T-01.8 — `.env.example`** with every var documented:
`DATABASE_URL`, `CORS_ORIGINS`, `AI_PROVIDER=mock|openai|anthropic`, `AI_API_KEY`, `MEDIA_DIR`, `MAX_UPLOAD_MB=10`, `NEXT_PUBLIC_API_URL`.

**T-01.9 — `docker-compose.yml`** with `backend` (uvicorn --reload) + `frontend` (next dev) + a shared volume for the SQLite file. Also add a root `Makefile`: `make dev`, `make seed`, `make test`, `make e2e`.

**T-01.10 — GitHub Actions CI** (`ci.yml`): job matrix — `lint-frontend`, `typecheck-frontend`, `lint-backend`, `pytest`, `playwright` (with `actions/upload-artifact` for the HTML report). Runs on every PR.

**T-01.11 — Seed the README skeleton now** with the 8 required headings (Overview, Tech Stack, Architecture, Database Schema, API Overview, Setup, Assumptions, Screenshots). Fill through the build, not at the end at 3am.

**T-01.12 — Add `docs/decisions.md`** and log one ADR per non-obvious choice as you make it (why SQLite FTS5 over LIKE, why polymorphic comments, why virtualised transcript). This is your interview script.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T01-A | Manual | Fresh clone → `cp .env.example .env && make dev` | Both servers up, no manual steps |
| T01-B | Manual | `make seed` twice | Idempotent — no duplicate meetings, no crash |
| T01-C | CI | `bg-blue-500` used in any component | **Build fails** (palette removed) |
| T01-D | CI | Router file containing `db.query` | ESLint/ruff custom check fails |
| T01-E | CI | Open PR | All 5 CI jobs run and pass |

**✅ Should look like:** two commands from clone to running app.
**❌ Should NOT look like:** a README that says "install dependencies and run the server" with no commands; a single flat `main.py` with 900 lines; `frontend/` and `backend/` in separate repos.

---

## T-02 · Design token layer & theme foundation

**Goal:** every colour, size and duration in the app comes from one file.
**Branch:** `feat/T-02-tokens` · **Est:** 60 min

### Subtasks

**T-02.1 — Calibrate the palette against reference screenshots.** Open each Fireflies screenshot, use a colour picker on: the primary button, the active nav item background, the app background, the left rail background, the meeting title text, a timestamp, the table header background, and the active transcript line. Overwrite the 8 `[SAMPLE]` tokens in A3.1. Record the before/after in `docs/decisions.md`.

**T-02.2 — Write `styles/tokens.css`** with all of A3.1 under `:root` and A3.2 under `[data-theme="dark"]`. Semantic names only — no `--blue-500`.

**T-02.3 — Two-layer token architecture.** Primitive layer (`--ff-blue-600: #2A6EF4`) → semantic layer (`--ff-accent: var(--ff-blue-600)`). Components *only* consume semantic. Dark mode then re-points semantics at different primitives instead of redefining 40 values.

**T-02.4 — Typography scale** as CSS custom properties + matching Tailwind `fontSize` entries carrying `lineHeight`, `fontWeight` and `letterSpacing` together, so `text-transcript` is one class not four.

**T-02.5 — Self-host Inter** via `next/font/local` (or `next/font/google` with `display: swap`). Set `font-feature-settings: 'cv11','ss01'` for the more readable Inter variant. Apply `tabular-nums` via a `.tnum` utility.

**T-02.6 — Spacing / radius / shadow scale** wired into Tailwind so `rounded-lg` = 12px, `shadow-md` = the exact A3.5 value.

**T-02.7 — Motion tokens + `prefers-reduced-motion`.** A global rule that collapses all transitions to `0.01ms` when the user asks for reduced motion. Do this now; retrofitting is miserable.

**T-02.8 — Focus-visible system.** One global `:focus-visible` rule → `--ff-shadow-focus`. Remove all `outline: none` without a replacement. Every interactive element must be keyboard-visible.

**T-02.9 — Speaker colour utility.** `getSpeakerColor(name: string): string` — FNV-1a hash of the lowercased trimmed name → mod 8 → A3.3 palette. Unit-tested for stability.

**T-02.10 — Scrollbar styling.** Thin (8px), `--ff-border-strong` thumb, transparent track, rounded. Applies to the transcript panel and left rail. Fireflies' panels do not show chunky default scrollbars.

**T-02.11 — Build a `/dev/tokens` page** (dev-only, excluded from prod build) rendering every token as a swatch/specimen. This is your visual-regression baseline and it catches a wrong hex in 2 seconds instead of 20 minutes.

**T-02.12 — Density audit.** Screenshot `/dev/tokens` next to a real Fireflies screenshot at the same zoom. If your text looks bigger, your base is wrong — Fireflies runs on a **14px body / 15px title** scale, tighter than most Tailwind defaults.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T02-A | Unit | `getSpeakerColor("Sarah Chen")` × 100 calls | Identical every time |
| T02-B | Unit | `getSpeakerColor("sarah chen ")` | Same as `"Sarah Chen"` (normalised) |
| T02-C | Unit | 8 distinct names | ≥6 distinct colours (collisions tolerated, not clustering) |
| T02-D | PW-02-01 | Grep built CSS for raw hex outside `tokens.css` | Zero matches |
| T02-E | PW-02-02 | Tab through `/dev/tokens` | Every focusable shows the 4px accent ring |
| T02-F | PW-02-03 | `prefers-reduced-motion: reduce` emulated | No animation longer than 50ms |
| T02-G | A11y | Contrast: text-primary/surface-0, text-muted/surface-0, text-inverse/accent | All ≥ 4.5:1 |

**✅ Should look like:** a dense, calm, blue-accented, high-whitespace productivity UI. Neutral greys have a faint cool cast.
**❌ Should NOT look like:** default Tailwind blue `#3B82F6` everywhere; pure `#000` text on pure `#FFF`; `#808080` neutral greys (dead, warm-less); 16px body text making everything feel like a blog.

---

## T-03 · Database schema design

**Goal:** a normalised schema that survives a whiteboard interrogation. This criterion is explicitly graded.
**Branch:** `feat/T-03-schema` · **Est:** 75 min

### Schema

```sql
users(id PK, name, email UNIQUE, avatar_url, created_at)

meetings(
  id PK, title, description,
  started_at DATETIME NOT NULL, duration_seconds INT NOT NULL,
  host_id FK→users, media_url, media_type ENUM('audio','video','none'),
  language TEXT DEFAULT 'en', source ENUM('upload','manual','seed','integration'),
  visibility ENUM('private','team','public') DEFAULT 'private',
  channel_id FK→channels NULL,
  processing_status ENUM('pending','processing','ready','failed') DEFAULT 'ready',
  created_at, updated_at, deleted_at NULL          -- soft delete
)

participants(id PK, meeting_id FK, user_id FK NULL, display_name, email NULL,
             role ENUM('host','attendee','invited'), attended BOOL,
             talk_seconds INT DEFAULT 0,
             UNIQUE(meeting_id, display_name))

speakers(id PK, meeting_id FK, label, participant_id FK NULL, color_index INT,
         UNIQUE(meeting_id, label))
         -- decouples raw transcript labels ("Speaker 1") from resolved people

transcript_segments(
  id PK, meeting_id FK, speaker_id FK,
  start_ms INT NOT NULL, end_ms INT NOT NULL,
  text TEXT NOT NULL, sequence INT NOT NULL,
  confidence REAL NULL, is_edited BOOL DEFAULT 0,
  UNIQUE(meeting_id, sequence))
  INDEX ix_seg_meeting_start (meeting_id, start_ms)

summaries(id PK, meeting_id FK UNIQUE, overview TEXT, gist TEXT,
          bullet_notes JSON, model TEXT, provider TEXT,
          generated_at, is_stale BOOL DEFAULT 0)

summary_sections(id PK, summary_id FK, kind ENUM('overview','outline','notes','keywords'),
                 title, body TEXT, start_ms INT NULL, sequence INT)
                 -- powers the timestamped "Meeting Outline"

action_items(id PK, meeting_id FK, text, assignee_participant_id FK NULL,
             due_date DATE NULL, status ENUM('open','completed') DEFAULT 'open',
             completed_at NULL, source ENUM('ai','manual') DEFAULT 'ai',
             start_ms INT NULL, sequence INT)

keywords(id PK, meeting_id FK, term, weight REAL, UNIQUE(meeting_id, term))

tags(id PK, name UNIQUE, color)                       -- bonus T-36
meeting_tags(meeting_id FK, tag_id FK, PK(meeting_id, tag_id))

channels(id PK, name, slug UNIQUE, is_private BOOL, icon)   -- bonus

comments(id PK, meeting_id FK, segment_id FK NULL, parent_id FK NULL,   -- bonus T-31
         author_id FK, body, start_ms NULL, created_at, updated_at, deleted_at)

highlights(id PK, meeting_id FK, segment_id FK, start_offset INT, end_offset INT,
           color, note NULL, created_by FK)                 -- bonus T-32

soundbites(id PK, meeting_id FK, title, start_ms, end_ms, created_by FK,
           auto_generated BOOL)                             -- bonus T-33

transcript_fts  -- FTS5 virtual table (text, meeting_id UNINDEXED, segment_id UNINDEXED)
```

### Subtasks

**T-03.1 — Draw the ERD first, on paper, then in `docs/schema.md`** using Mermaid `erDiagram`. Export a PNG for the README. Do this *before* writing models — you will find two mistakes.

**T-03.2 — Write SQLAlchemy 2.0 models** using `Mapped[...]` / `mapped_column` typed style (not the legacy `Column(...)` style — the modern style signals currency).

**T-03.3 — Define relationships with explicit `back_populates`, `cascade`, and `lazy` strategies.** `Meeting.segments` → `lazy="selectin"`, `cascade="all, delete-orphan"`. Wrong lazy strategy on transcript segments is your N+1 landmine.

**T-03.4 — Justify every denormalisation in comments.** `participants.talk_seconds` and `meetings.duration_seconds` are computed-and-stored. Write *why* (read-heavy list view, avoids aggregating 400 segments per row) in a docstring. Interviewers ask exactly this.

**T-03.5 — Add the indexes and say why:** `(meeting_id, start_ms)` for the transcript window query, `(meeting_id, sequence)` unique for ordering integrity, `started_at DESC` for the default sort, `deleted_at` partial index for the soft-delete filter.

**T-03.6 — Implement soft delete properly.** `deleted_at` + a `not_deleted()` query helper + a SQLAlchemy event or base query class so you cannot forget the filter. Deleted meetings vanish from the UI but remain restorable — mention this in the README as a deliberate choice.

**T-03.7 — Set up Alembic.** `alembic init`, autogenerate the initial migration, then **read the generated file and fix it** (autogenerate misses enum constraints and index names). Commit migrations — do not rely on `create_all` in production.

**T-03.8 — Enable SQLite pragmas** on every connection via an `event.listens_for(Engine, "connect")` hook: `PRAGMA foreign_keys=ON` (off by default in SQLite — your cascades silently do nothing without it), `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`.

**T-03.9 — Create the FTS5 virtual table + triggers** (`AFTER INSERT/UPDATE/DELETE ON transcript_segments`) in a hand-written migration. This gives you real ranked search for T-35 instead of `LIKE '%x%'`.

**T-03.10 — Store durations in integers, not floats or strings.** `start_ms`/`end_ms` as `INT` milliseconds everywhere internally; format at the presentation edge only. Never store `"00:04:32"`.

**T-03.11 — Add `updated_at` auto-touch** via `onupdate=func.now()` on every mutable table, and a `created_at` server default. Timestamps stored UTC-aware, converted in the frontend.

**T-03.12 — Write a schema smoke test** (`tests/test_schema.py`): create meeting → 3 speakers → 50 segments → summary → 4 action items; assert cascade delete removes all children; assert FTS rows are removed too; assert `UNIQUE(meeting_id, sequence)` raises on duplicate.

**T-03.13 — Document the schema in the README** as a table per entity with column, type, constraint, and a one-line "why".

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T03-A | pytest | Delete a meeting hard | All segments, summary, sections, action items, keywords, FTS rows removed |
| T03-B | pytest | Insert two segments with same `(meeting_id, sequence)` | `IntegrityError` |
| T03-C | pytest | Insert segment with bogus `meeting_id` | `IntegrityError` (proves FK pragma is on) |
| T03-D | pytest | Soft-delete then `GET /meetings` | Meeting absent from list, row still in table |
| T03-E | pytest | Insert segment → query FTS for a word in it | 1 hit; after UPDATE, old word yields 0 hits |
| T03-F | pytest | Load a meeting with 400 segments | ≤ 3 SQL statements (assert via query counter) |
| T03-G | pytest | `alembic upgrade head` on empty DB then `downgrade base` | No errors both directions |

**✅ Should look like:** 3NF core, deliberate denormalisation with written justification, migrations in git, FKs enforced.
**❌ Should NOT look like:** a `meetings` table with a `transcript TEXT` blob column; participants stored as a comma-separated string; `action_items` as a JSON array on the meeting row; no migrations, just `Base.metadata.create_all()`.

---

## T-04 · Backend application skeleton & API contract

**Goal:** a clean, versioned, self-documenting API.
**Branch:** `feat/T-04-api-skeleton` · **Est:** 75 min

### API surface (final contract — freeze this before building the frontend)

```
GET    /api/health
GET    /api/v1/me                                  → default logged-in user

GET    /api/v1/meetings           ?q&host&participant&from&to&min_duration&max_duration
                                  &tags&channel&has_action_items&sort=-started_at
                                  &page=1&page_size=20
POST   /api/v1/meetings                            → create (form / paste / upload)
GET    /api/v1/meetings/{id}                       → full detail (segments paginated)
PATCH  /api/v1/meetings/{id}                       → title, participants, tags, visibility
DELETE /api/v1/meetings/{id}                       → soft delete
POST   /api/v1/meetings/bulk-delete
POST   /api/v1/meetings/{id}/restore

GET    /api/v1/meetings/{id}/transcript            ?cursor&limit=200&q
PATCH  /api/v1/meetings/{id}/segments/{segId}      → edit text / reassign speaker
PATCH  /api/v1/meetings/{id}/speakers/{spkId}      → rename speaker globally

GET    /api/v1/meetings/{id}/summary
POST   /api/v1/meetings/{id}/summary/regenerate

GET    /api/v1/meetings/{id}/action-items
POST   /api/v1/meetings/{id}/action-items
PATCH  /api/v1/action-items/{id}                   → text, assignee, due, status
DELETE /api/v1/action-items/{id}

GET    /api/v1/search              ?q&limit                → global, FTS-ranked
GET    /api/v1/tags  POST /api/v1/tags                     (bonus)
GET/POST/PATCH/DELETE /api/v1/meetings/{id}/comments       (bonus)
GET/POST/DELETE       /api/v1/meetings/{id}/soundbites     (bonus)
GET    /api/v1/meetings/{id}/export?format=pdf|md|txt      (bonus)
POST   /api/v1/meetings/{id}/ask                           (bonus, AskFred)
```

### Subtasks

**T-04.1 — App factory pattern.** `create_app()` in `main.py` returning a configured `FastAPI`. Enables clean test fixtures with an override DB.

**T-04.2 — Settings via `pydantic-settings`** with a cached `get_settings()`. No `os.environ` reads scattered through the code.

**T-04.3 — Mount routers under `/api/v1`** with `tags=` and `summary=` on every operation so `/docs` is genuinely readable. Screenshot `/docs` for the README.

**T-04.4 — Pydantic v2 schemas, split by direction:** `MeetingCreate`, `MeetingUpdate`, `MeetingListItem` (light — no segments), `MeetingDetail` (heavy). Returning the heavy schema from the list endpoint is a classic API-design deduction.

**T-04.5 — Generic pagination envelope:**
```json
{ "items": [...], "page": 1, "page_size": 20, "total": 47, "total_pages": 3, "has_next": true }
```
Use it consistently on *every* list endpoint. Consistency reads as design.

**T-04.6 — Uniform error envelope + exception handlers.**
```json
{ "error": { "code": "MEETING_NOT_FOUND", "message": "…", "details": {...} } }
```
Handlers for `AppException` (your base), `RequestValidationError` → 422 with field paths, and a catch-all 500 that logs the traceback but never leaks it.

**T-04.7 — Service layer + custom exceptions.** `MeetingService.get(id)` raises `NotFoundError`; the router never writes `raise HTTPException`. One place decides HTTP semantics.

**T-04.8 — Dependency injection.** `get_db` (yields a session, closes in `finally`), `get_current_user` (returns the seeded default user — the assignment says assume logged in; make it a *dependency* so real auth is a one-line swap, and say so in the README).

**T-04.9 — CORS, GZip, and a request-ID middleware** that stamps `X-Request-ID` and logs `method path status duration_ms request_id` as structured JSON.

**T-04.10 — Rate-limit the AI endpoints** (`slowapi`, 10/min). Cheap, and it shows production thinking on the endpoint that costs money.

**T-04.11 — Health endpoint that actually checks the DB** (`SELECT 1`), returning `{status, db, version, ai_provider}`. Point your host's health check at it.

**T-04.12 — Generate the TypeScript client from OpenAPI.** `openapi-typescript` → `frontend/src/types/api.d.ts`, wired into a `make types` target. Now a backend field rename becomes a frontend type error instead of a runtime `undefined`.

**T-04.13 — Write `docs/api.md`** — endpoint table with method, path, params, status codes, and one example request/response for the three most important endpoints.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T04-A | pytest | `GET /api/v1/meetings/99999` | 404, body matches error envelope, `code=MEETING_NOT_FOUND` |
| T04-B | pytest | `POST /meetings` with empty title | 422, `details.title` present |
| T04-C | pytest | `GET /meetings?page_size=500` | Clamped to max 100, no 500 |
| T04-D | pytest | `GET /meetings` response | Items contain **no** `segments` key |
| T04-E | pytest | Any list endpoint | Envelope has all 6 pagination keys |
| T04-F | pytest | Unhandled service exception | 500 with generic message, traceback in logs only |
| T04-G | pytest | `GET /openapi.json` | Valid; every path has `summary` and `tags` |
| T04-H | pytest | 11 rapid calls to `/summary/regenerate` | 11th returns 429 |
| T04-I | pytest | `GET /health` with DB file deleted | 503, `db: "down"` |

**✅ Should look like:** `/docs` that a stranger could integrate against without asking you anything.
**❌ Should NOT look like:** endpoints at `/getMeetings` and `/deleteMeeting` (verbs in paths); 200 responses carrying `{"error": "..."}`; every error being a bare `{"detail": "..."}`; business logic inside route functions.

---

## T-05 · Seed data engine

**Goal:** the app is impressive within 3 seconds of the evaluator opening the demo link. Seeding is the highest-leverage hour in this project.
**Branch:** `feat/T-05-seed` · **Est:** 75 min

### Subtasks

**T-05.1 — Author 8 realistic meetings** as JSON in `backend/seed/data/`. Deliberately varied so filters and edge cases are demoable:

| # | Title | Duration | Speakers | Participants | Notes |
|---|---|---|---|---|---|
| 1 | Q3 Product Roadmap Sync | 42:18 | 4 | 6 | Hero meeting — richest transcript, use for screenshots |
| 2 | Acme Corp — Discovery Call | 31:05 | 3 | 3 | Sales flavour, objections, next steps |
| 3 | Weekly Engineering Standup | 14:47 | 5 | 7 | Short, many speakers, rapid turns |
| 4 | Design Review — Mobile Onboarding | 55:32 | 3 | 4 | **Longest** — proves virtualisation |
| 5 | 1:1 — Sarah & Marcus | 26:10 | 2 | 2 | Two-speaker rhythm |
| 6 | Customer Success QBR — Northwind | 48:03 | 4 | 5 | Many action items (7) |
| 7 | All-Hands: Q2 Results | 38:55 | 2 | 24 | **Tests the `+N` avatar overflow** |
| 8 | Bug Triage — Payments Incident | 19:22 | 4 | 4 | Urgent tone, overdue action items |

**T-05.2 — Write genuinely plausible transcripts.** 60–220 segments each, 8–35 words per segment, natural interruptions, filler words, realistic turn-taking. Use an LLM to draft them, then read every one. A transcript that says "Lorem ipsum" or "Speaker 1: This is a test" destroys the illusion the entire assignment is graded on.

**T-05.3 — Spread `started_at` across meaningful buckets:** 2 today, 1 yesterday, 2 in the last 7 days, 2 in the last 30 days, 1 at ~75 days ago. This makes every date-range filter demonstrably work.

**T-05.4 — Realistic timing.** `start_ms`/`end_ms` derived from word count at ~150 wpm, with 200–600ms inter-speaker gaps. Segments must be strictly ordered and non-overlapping. Assert this in the seeder.

**T-05.5 — A consistent cast of 12 people** with names, emails, and generated avatars (`dicebear` initials style, saved as static SVGs — do not hotlink an external avatar service on your demo, it will be slow or blocked).

**T-05.6 — Hand-write the summaries** for all 8: overview paragraph, 4–8 outline chapters with real timestamps that land on real segments, 5–12 bullet notes grouped by chapter, 6 keywords. These are what the evaluator reads first.

**T-05.7 — Seed 30–40 action items** across meetings with a deliberate status mix: open, completed, with assignee, unassigned, due future, due today, **overdue**, no due date. Every badge state in the UI needs a seeded example.

**T-05.8 — Provide real media.** One short CC0/royalty-free audio file (2–3 min) committed under `backend/media/`, referenced by meetings 1 and 4 so the player is genuinely scrubbable. Others use `media_type='none'` → player renders a waveform placeholder that still emits timeupdate from a virtual clock. **Document this** — a fake player that visibly fakes it is fine; a broken player is not.

**T-05.9 — Idempotency.** `--reset` flag drops and recreates; default mode upserts on a stable `seed_key`. Running it twice must never duplicate.

**T-05.10 — Derive, don't hardcode, computed fields.** The seeder computes `duration_seconds` from the last segment's `end_ms` and `participants.talk_seconds` by summing segment durations per speaker. This proves the aggregation logic and keeps data self-consistent.

**T-05.11 — Seed tags and channels** (bonus-ready): tags `#sales`, `#engineering`, `#product`, `#customer`, `#urgent`; channels `My Meetings`, `All Meetings`, `# design-team`, `🔒 leadership`.

**T-05.12 — Rebuild the FTS index** at the end of seeding and assert a known phrase returns the expected meeting.

**T-05.13 — Add a `make seed-demo` target** that resets + seeds + prints a summary table to stdout (`8 meetings · 1,204 segments · 38 action items · 12 users`). Nice touch during a live demo.

**T-05.14 — Seed validation script** run in CI: every meeting has ≥1 speaker, ≥20 segments, exactly 1 summary, ≥1 keyword; no orphan rows; no overlapping segments; every outline `start_ms` maps to a real segment.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T05-A | pytest | Run seeder twice | 8 meetings, not 16 |
| T05-B | pytest | Every meeting | `duration_seconds` == last segment `end_ms`/1000 ±1 |
| T05-C | pytest | Every meeting's segments | Strictly increasing `start_ms`, no overlaps |
| T05-D | pytest | Every outline section | `start_ms` falls inside some segment's range |
| T05-E | pytest | Action items | ≥1 overdue, ≥1 completed, ≥1 unassigned exist |
| T05-F | pytest | Meeting 7 | ≥20 participants (avatar overflow case) |
| T05-G | pytest | FTS search "pricing" | Returns ≥2 distinct meetings |
| T05-H | PW-05-01 | Load `/notebook` on a fresh seed | 8 rows, all with non-empty title/date/duration/participants |

**✅ Should look like:** an app that has clearly been *used* — varied titles, real conversation, meetings from today and from two months ago.
**❌ Should NOT look like:** "Meeting 1 / Meeting 2 / Meeting 3"; every meeting 30:00 long; every meeting dated today; transcripts of repeated filler text; zero completed action items.

---

## T-06 · Frontend app shell & data layer

**Goal:** routing, layout, fetching and state settled before any feature is written.
**Branch:** `feat/T-06-shell` · **Est:** 60 min

### Subtasks

**T-06.1 — Root layout** (`app/layout.tsx`): html lang, font variable, `data-theme`, `ToastProvider`, `QueryProvider`, `ThemeProvider`. Metadata: title template `%s · Fireflies`, favicon, OG image.

**T-06.2 — `AppShell` component** — the fixed topbar + left rail + `<main>` grid from A2. CSS Grid: `grid-template-columns: var(--rail-w) 1fr` with `--rail-w` toggling `240px`/`64px`. Do not use absolute positioning; grid makes the collapse animation trivial and keeps scroll containers sane.

**T-06.3 — Install TanStack Query v5** with sensible defaults: `staleTime 30s`, `retry 1`, `refetchOnWindowFocus false` (a demo that refetches on every alt-tab looks janky).

**T-06.4 — Typed fetch wrapper** `lib/api/client.ts`: base URL from env, JSON handling, non-2xx → typed `ApiError` carrying the error envelope, `AbortSignal` support, 15s timeout.

**T-06.5 — Query key factory.** `qk.meetings.list(filters)`, `qk.meetings.detail(id)`, `qk.transcript(id)`, `qk.actionItems(id)`. Never inline string arrays — cache invalidation becomes guesswork.

**T-06.6 — Optimistic mutation helper.** A `useOptimisticMutation` wrapper doing cancel → snapshot → patch → rollback-on-error → invalidate-on-settle. Used by action items, title edit, delete, comments.

**T-06.7 — URL as state.** Filters, search, sort, page, and the detail-view `?t=` timestamp all live in the query string via `nuqs` or a hand-rolled `useQueryParams`. Requirement: **every view must be shareable by copying the URL**, and browser back must undo a filter change. Evaluators test this.

**T-06.8 — Global loading & error boundaries.** `app/loading.tsx` (skeleton shell, not a spinner), `app/error.tsx` (branded, with Retry), `app/not-found.tsx` (branded 404 with "Back to meetings").

**T-06.9 — Route-level skeletons** matching final layout geometry so there is no content jump. A skeleton row must be exactly 72px tall.

**T-06.10 — Responsive breakpoints.** `<768` mobile (rail → bottom sheet drawer, detail panels → tabs), `768–1279` tablet (rail auto-collapses to 64px), `≥1280` desktop (full). Fireflies is desktop-first; mobile just must not be broken.

**T-06.11 — Command palette scaffold** (`⌘K` / `Ctrl+K`) — empty shell now, wired to global search in T-35. Register the shortcut early so it doesn't conflict with the transcript find shortcut.

**T-06.12 — `formatDuration(ms)` / `formatTimestamp(ms)` / `formatRelativeDate(iso)` utils.** Rules: durations `42:18` and `1:05:32` (no leading zero on the largest unit); transcript timestamps always `MM:SS` under an hour; dates `Today · 10:00 AM`, `Yesterday · 3:15 PM`, `Jul 24` (this year), `Jul 24, 2025` (prior years). Unit-test all branches — off-by-one on the hour boundary is the classic bug.

**T-06.13 — Analytics-free, telemetry-free.** No third-party scripts. A demo that hangs on a blocked tracker is an avoidable disaster.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T06-A | Unit | `formatDuration(2538000)` | `"42:18"` |
| T06-B | Unit | `formatDuration(3932000)` | `"1:05:32"` |
| T06-C | Unit | `formatDuration(0)` / `(999)` | `"0:00"` |
| T06-D | Unit | `formatDuration(3600000)` | `"1:00:00"` not `"60:00"` |
| T06-E | Unit | Date today / yesterday / this-year / last-year | Four distinct correct formats |
| T06-F | PW-06-01 | Apply filter → copy URL → open in new tab | Identical filtered view |
| T06-G | PW-06-02 | Apply filter → browser Back | Filter removed, list restored |
| T06-H | PW-06-03 | Visit `/meeting/does-not-exist` | Branded 404, not a stack trace |
| T06-I | PW-06-04 | Throttle API to 3s, load `/notebook` | Skeleton rows visible; no layout shift when data lands (CLS < 0.1) |
| T06-J | PW-06-05 | Resize 1440 → 900 → 600 | Rail collapses at 1280, drawer at 768, no horizontal scrollbar at any width |

**✅ Should look like:** instant-feeling navigation, shareable URLs, skeletons that match final geometry.
**❌ Should NOT look like:** a full-page spinner on every navigation; filters stored only in React state (lost on refresh); horizontal scrollbars at 1280px; a raw Next.js error overlay in the deployed demo.

---

# PHASE 1 · APP CHROME

---

## T-07 · Left rail sidebar

**Goal:** the first thing the evaluator's eye lands on. Get it exact.
**Branch:** `feat/T-07-sidebar` · **Est:** 75 min

### Exact specification

| Property | Value |
|---|---|
| Width expanded / collapsed | `240px` / `64px` |
| Background | `--ff-surface-1` |
| Right border | `1px solid --ff-border-subtle` |
| Item height | `36px` |
| Item horizontal padding | `12px` (expanded) / centred (collapsed) |
| Item gap (icon → label) | `12px` |
| Item radius | `--ff-radius-md` (8px) |
| Item margin | `2px 8px` |
| Icon size / stroke | `20px` / `1.75` |
| Label type | `14px / 500` |
| Section label type | `--ff-text-label` (12/600/uppercase/.04em), colour `--ff-text-muted`, padding `16px 20px 8px` |

**Item states:**

| State | Background | Icon | Label | Extra |
|---|---|---|---|---|
| Default | transparent | `--ff-text-muted` | `--ff-text-secondary` | — |
| Hover | `--ff-surface-hover` | `--ff-text-secondary` | `--ff-text-primary` | 120ms transition |
| **Active** | `--ff-accent-subtle` | `--ff-accent` | `--ff-accent`, weight **600** | — |
| Focus-visible | — | — | — | `--ff-shadow-focus` ring |
| Disabled (placeholder routes) | transparent | 40% opacity | 40% opacity | `Soon` badge on the right |

### Subtasks

**T-07.1 — Build the nav data model** in `lib/nav.ts`: `{ id, label, icon, href, badge?, section, disabled?, matchPrefix? }`. Rendering is a `.map()` — never 9 hand-written JSX blocks.

**T-07.2 — Primary section** (no section label): `Home → /`, `Meetings → /notebook`, `Uploads → /upload`, `AI Apps → /apps` (badge `Soon`), `Analytics → /analytics` (badge `Soon`).

**T-07.3 — `CHANNELS` section** with label header: `My Meetings` (users icon), `All Meetings` (globe icon), then seeded custom channels — public prefixed `#`, private with a `Lock` icon. Each shows a right-aligned muted count badge.

**T-07.4 — Footer section**, pinned to the bottom with `margin-top: auto`: `Settings → /settings`, `Help & Support → /help` (badge `Soon`). Above it, a thin `1px` divider.

**T-07.5 — Active-state logic.** `usePathname()` + prefix matching so `/meeting/abc` keeps **Meetings** active (a detail page must not orphan the nav) and `/settings/recording` keeps **Settings** active. Exact-match only for `/`.

**T-07.6 — Collapse toggle.** The `☰` button in the topbar toggles a `sidebarCollapsed` boolean persisted to `localStorage`. Width animates `200ms cubic-bezier(.4,0,.2,1)`. Labels fade out over `120ms` and are `display:none` at the end so they never wrap mid-animation.

**T-07.7 — Tooltips when collapsed.** Radix Tooltip, side `right`, `sideOffset 8`, `delayDuration 300`. Content = the label. Tooltips must be **suppressed when expanded** — a tooltip repeating visible text is a bug.

**T-07.8 — Keyboard accessibility.** `<nav aria-label="Main">`, list semantics, `aria-current="page"` on the active item. Tab order top→bottom. `Enter`/`Space` activate.

**T-07.9 — Channel counts** from `GET /api/v1/channels` (or derived client-side from the meetings query). Render as a `Badge` variant `neutral`, `12px/500`, `--ff-text-muted`, right-aligned.

**T-07.10 — Overflow behaviour.** The channels list gets `max-height` and `overflow-y: auto` with the thin scrollbar from T-02.10. Primary and footer sections never scroll.

**T-07.11 — Mobile.** Below 768px the rail becomes an off-canvas drawer: slides in from the left over a `rgba(16,24,40,.4)` backdrop, closes on backdrop click, on `Escape`, and on route change. Focus is trapped while open and returned to the toggle on close.

**T-07.12 — Placeholder-route affordance.** Items with `disabled: true` are still clickable (they navigate to the "Coming Soon" page from T-30) but render with the `Soon` badge. Do **not** make them `pointer-events: none` — the evaluator will click them to check, and a dead click looks broken.

**T-07.13 — Add `data-testid`s:** `sidebar`, `sidebar-toggle`, `sidebar-item-meetings`, `sidebar-item-<id>`, `sidebar-section-channels`, `sidebar-channel-<slug>`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T07-A | PW-07-01 | Load `/notebook` | `sidebar-item-meetings` has `aria-current="page"`; computed bg = `--ff-accent-subtle`; colour = `--ff-accent`; weight 600 |
| T07-B | PW-07-02 | Load `/meeting/{id}` | **Meetings still active** (prefix match) |
| T07-C | PW-07-03 | Load `/settings/recording` | Settings active, Meetings not |
| T07-D | PW-07-04 | Hover a non-active item | bg = `--ff-surface-hover`; active item unchanged |
| T07-E | PW-07-05 | Click toggle | Sidebar width 240 → 64; labels hidden; `localStorage.sidebarCollapsed === "true"` |
| T07-F | PW-07-06 | Reload while collapsed | Still 64px, no flash of expanded state |
| T07-G | PW-07-07 | Hover item while collapsed | Tooltip appears right after 300ms with correct text |
| T07-H | PW-07-08 | Hover item while expanded | **No tooltip** |
| T07-I | PW-07-09 | Click `AI Apps` | Navigates to `/apps`, shows Coming Soon, AI Apps becomes active |
| T07-J | PW-07-10 | Viewport 600px | Rail hidden; toggle opens drawer; Escape closes; focus returns to toggle |
| T07-K | PW-07-11 | Keyboard Tab from topbar | Reaches sidebar items in visual order with visible focus ring |
| T07-L | PW-07-12 | Visual | `sidebar.png` snapshot, `maxDiffPixelRatio 0.01` |

**✅ Should look like:** 240px, `#F7F8FA`-ish rail; exactly one item with a soft blue rounded-8 pill background and blue 600-weight text; uppercase `CHANNELS` micro-label; Settings pinned to the bottom.
**❌ Should NOT look like:** a dark-navy sidebar (that's Notion/Linear, not Fireflies); active state indicated by a left border bar only; full-width active highlight touching both edges (it must be inset 8px); icons at different sizes; Settings floating mid-list; hover and active looking the same.

---

## T-08 · Topbar & global search

**Branch:** `feat/T-08-topbar` · **Est:** 60 min

### Exact specification

| Property | Value |
|---|---|
| Height | `56px`, `position: sticky; top: 0; z-index: 40` |
| Background | `--ff-surface-0` |
| Bottom border | `1px solid --ff-border-subtle` |
| Padding | `0 16px` |
| Layout | `grid-template-columns: auto 1fr auto` |
| Search input | `max-width 560px`, height `36px`, radius `--ff-radius-md`, bg `--ff-surface-2`, **no border at rest** |
| Search focused | bg `--ff-surface-0`, `1px solid --ff-accent`, `--ff-shadow-focus` |

### Subtasks

**T-08.1 — Left cluster:** hamburger `IconButton` (32×32, ghost) → logo mark 24px + wordmark "Fireflies" at `16px/700/-0.01em`. Logo is a link to `/`. Draw your **own** firefly-inspired SVG mark — do not ship Fireflies' actual trademarked logo file.

**T-08.2 — Centre: `SearchInput`.** Leading `Search` icon 16px muted, placeholder `Search meetings, transcripts, and more…`, trailing `⌘K` kbd hint (`11px/500`, `--ff-surface-0` bg, 1px border, radius 4, `--ff-text-muted`). Hint hides once the input has focus or a value; a `✕` clear button takes its place.

**T-08.3 — Search dropdown.** On focus with empty input: "Recent searches" (from localStorage, max 5) + "Quick actions". On ≥2 chars: debounced 250ms request to `/api/v1/search?limit=5`, showing grouped results — `MEETINGS` (title matches) and `TRANSCRIPTS` (segment matches with a 100-char snippet and the match bolded). Footer row: `See all results for "x"` → `/search?q=x`.

**T-08.4 — Keyboard.** `⌘K`/`Ctrl+K` focuses and opens; `↑`/`↓` move an `aria-activedescendant` highlight; `Enter` opens the highlighted result; `Escape` closes and blurs. Prevent the browser's default `⌘K` where applicable.

**T-08.5 — Right cluster (in order):** `[+ New]` primary button with a dropdown (`Upload transcript`, `Paste transcript`, `Create manually`) → `Bell` icon button with a notification dot → `HelpCircle` icon button → avatar 32px with chevron.

**T-08.6 — Avatar menu.** Header block showing name + email of the seeded default user, then `Profile` (Soon), `Settings` → `/settings`, `Theme` submenu (Light / Dark / System — wires up in T-38), divider, `Sign out` (Soon, shows an info toast "Authentication is out of scope for this build").

**T-08.7 — Notification popover** with 3 seeded mock notifications, each with icon, title, relative time, and unread dot; a `Mark all as read` action that clears the dot. Purely client-side; state in localStorage.

**T-08.8 — Loading and empty states in the dropdown.** 3 skeleton rows while fetching; `No results for "xyz"` with a `Search all meetings` CTA when empty. Never show a blank floating box.

**T-08.9 — Click-outside and route-change dismissal** for all three popovers, implemented once in a `usePopover` hook rather than three times.

**T-08.10 — Search result highlighting** uses the `Highlighter` primitive (T-10.9) — split on match, wrap in `<mark>`. **Never** `dangerouslySetInnerHTML` with user text.

**T-08.11 — Responsive.** <1024px the search input collapses to an icon that expands to a full-width overlay on tap. <768px the `+ New` button becomes icon-only.

**T-08.12 — `data-testid`s:** `topbar`, `topbar-search`, `topbar-search-results`, `topbar-search-result-<i>`, `topbar-new-button`, `topbar-notifications`, `topbar-avatar`, `topbar-avatar-menu`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T08-A | PW-08-01 | Press `⌘K` from anywhere | Search focused, dropdown open |
| T08-B | PW-08-02 | Type `road` | ≤600ms later, dropdown shows grouped results; `Q3 Product Roadmap Sync` present with `road` in a `<mark>` |
| T08-C | PW-08-03 | Type `zzzqqq` | Empty state with the exact query echoed |
| T08-D | PW-08-04 | Type 5 chars rapidly | **≤2** network requests (debounce proof, assert via `page.route` counter) |
| T08-E | PW-08-05 | `↓ ↓ Enter` | Navigates to the 2nd result's meeting page |
| T08-F | PW-08-06 | `Escape` | Dropdown closed, input blurred, value retained |
| T08-G | PW-08-07 | Click outside | Dropdown closed |
| T08-H | PW-08-08 | Focus search | Border becomes accent, bg becomes surface-0, `⌘K` hint hidden |
| T08-I | PW-08-09 | Click `+ New` → `Upload transcript` | Upload modal opens |
| T08-J | PW-08-10 | Click avatar → `Sign out` | Info toast; **no** navigation |
| T08-K | PW-08-11 | Scroll notebook 2000px | Topbar still visible at `y=0` |
| T08-L | PW-08-12 | Viewport 800px | Search is an icon; tapping expands full-width overlay |

**✅ Should look like:** a 56px white bar, a soft grey pill search centred and capped at 560px, a compact right cluster with generous gaps.
**❌ Should NOT look like:** a search input stretching the full window width; a topbar taller than 64px; the search dropdown appearing under the page content (`z-index` bug); results updating on every keystroke without debounce; the real Fireflies logo asset.

---

## T-09 · Toast / notification system

**Branch:** `feat/T-09-toasts` · **Est:** 40 min
The assignment explicitly lists "Notifications / toasts" as a Fireflies-experience requirement. Do not skip it.

### Exact specification

| Property | Value |
|---|---|
| Position | bottom-right, `24px` from each edge (bottom-centre on mobile) |
| Width | `380px` (`calc(100vw - 32px)` on mobile) |
| Padding / radius / shadow | `12px 16px` / `--ff-radius-lg` / `--ff-shadow-lg` |
| Background / border | `--ff-surface-0` / `1px solid --ff-border-subtle` |
| Accent | `4px` left border in the variant colour |
| Enter / exit | slide-up + fade `200ms` / fade + scale-to-.95 `150ms` |
| Auto-dismiss | success 4s · info 5s · error **never** (manual only) |
| Max visible | 3, oldest evicted; a `+N more` counter above the stack |

Variants: `success` (`CheckCircle`, `--ff-success`) · `error` (`AlertCircle`, `--ff-danger`) · `info` (`Info`, `--ff-accent`) · `loading` (spinner, `--ff-text-muted`).

### Subtasks

**T-09.1 — `ToastProvider` + `useToast()`** exposing `toast.success/error/info/loading/promise/dismiss`. Mounted once in the root layout.

**T-09.2 — `toast.promise(p, {loading, success, error})`** which mutates a single toast in place through the lifecycle. Use it for every async mutation so the user never sees two stacked toasts for one action.

**T-09.3 — Action slot** — an optional right-aligned text button. `Undo` for deletes, `View` for creates (navigates to the new meeting), `Retry` for failures.

**T-09.4 — Undo semantics for delete.** Soft-delete immediately, toast with `Undo` for 6 seconds; `Undo` calls `POST /meetings/{id}/restore` and re-invalidates the list. This is a genuinely nice touch that takes 20 minutes.

**T-09.5 — Deduplication.** Identical `(variant, message)` within 1s increments a `×2` counter instead of stacking. Prevents the double-click toast avalanche.

**T-09.6 — Hover pauses the auto-dismiss timer**, resumes on leave, with the remaining time reflected in a hairline progress bar along the bottom edge.

**T-09.7 — Accessibility.** Container `role="region" aria-label="Notifications"`; success/info toasts `aria-live="polite"`, errors `role="alert" aria-live="assertive"`. Dismiss button has `aria-label="Dismiss notification"`.

**T-09.8 — Keyboard.** `Escape` dismisses the top toast when the toast region has focus; toasts are reachable by Tab but do **not** steal focus on appear.

**T-09.9 — Reduced motion.** With `prefers-reduced-motion`, toasts fade only — no translate.

**T-09.10 — Wire the standard message copy** (write these once, in a constants file, so wording is consistent):
- `Meeting deleted` + Undo · `Meeting created` + View · `Changes saved` · `Action item added` · `Summary regenerated` · `Link copied to clipboard` · `Couldn't save changes. Please try again.` + Retry · `File must be .txt, .vtt, .srt or .json` · `Coming soon — this feature isn't part of this build`

**T-09.11 — Global mutation error hook.** Wire TanStack Query's `MutationCache.onError` to fire an error toast by default, so no mutation can ever fail silently.

**T-09.12 — `data-testid`s:** `toast-container`, `toast`, `toast-<variant>`, `toast-action`, `toast-dismiss`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T09-A | PW-09-01 | Delete a meeting | Success toast within 500ms, text `Meeting deleted`, `Undo` visible |
| T09-B | PW-09-02 | Click `Undo` | Toast dismisses, meeting reappears in the list, second toast `Meeting restored` |
| T09-C | PW-09-03 | Wait 4.5s after a success toast | Auto-dismissed |
| T09-D | PW-09-04 | Force a 500, trigger a save | Error toast persists ≥10s, has `Retry` |
| T09-E | PW-09-05 | Hover a toast for 6s | Still visible; dismisses ~4s after mouse leaves |
| T09-F | PW-09-06 | Fire 5 toasts | Exactly 3 rendered + `+2 more` |
| T09-G | PW-09-07 | Double-click delete | One toast with `×2`, not two toasts |
| T09-H | PW-09-08 | Axe scan with an error toast present | `role="alert"` present, zero violations |
| T09-I | PW-09-09 | Toast appears while typing in search | Focus **stays** in the search input |
| T09-J | PW-09-10 | Click a "Soon" feature | Info toast with the exact coming-soon copy |

**✅ Should look like:** a compact white card bottom-right with a coloured left edge, an icon, one line of text, and an optional text action.
**❌ Should NOT look like:** `window.alert()`; a full-width banner pinned to the top; toasts that never dismiss; error toasts that vanish before they can be read; a toast that steals keyboard focus.

---

## T-10 · Core UI primitives

**Branch:** `feat/T-10-primitives` · **Est:** 90 min
Build all 20 from A4. Every hour spent here is repaid three times in Phases 2–3.

### Subtasks

**T-10.1 — `Button`.** Variants `primary` (accent bg, inverse text), `secondary` (surface-0 bg, `border-strong` border, text-primary), `ghost` (transparent, text-secondary), `danger` (danger bg, inverse text), `link`. Sizes `sm 32` / `md 36` / `lg 40`. Props: `loading` (spinner replaces the leading icon, width **must not** change — reserve it), `disabled` (50% opacity, `cursor: not-allowed`), `leftIcon`, `rightIcon`, `iconOnly`, `fullWidth`. All states: hover, active (`transform: translateY(0.5px)`), focus-visible ring, disabled.

**T-10.2 — `IconButton` + `Tooltip`.** 32×32 (sm 28), radius 8, ghost by default. Every icon-only control **must** have both `aria-label` and a tooltip. No exceptions — this is a recurring a11y deduction.

**T-10.3 — `Input` / `Textarea`.** Height 40 (textarea auto-grow, min 80 max 320), radius 8, `1px --ff-border-subtle`, hover → `border-strong`, focus → accent border + focus ring, error → danger border + a 13px danger helper text below, disabled → `surface-2` bg. Supports label, helper text, char counter, leading/trailing adornments.

**T-10.4 — `Select` and `DatePicker`.** Custom `Select` (Radix) styled to match `Input` exactly — a native `<select>` next to a custom input is visually obvious and looks unfinished. `DatePicker` = a calendar popover with preset shortcuts (`Today`, `Yesterday`, `Last 7 days`, `Last 30 days`, `This month`, `Custom range`).

**T-10.5 — `SearchInput`.** Composed: leading `Search` icon, debounced `onChange` (configurable, default 250ms), trailing `✕` clear that also refocuses the input, optional `kbd` hint slot, optional inline `loading` spinner.

**T-10.6 — `Chip`.** Modes `static` (keywords), `toggle` (filters — off: `surface-2` bg / `text-secondary`; on: `accent-subtle` bg / `accent-border` border / `accent` text), `removable` (trailing ✕ with its own hover state and `aria-label="Remove <label>"`). Height 28, padding `0 10px`, radius full, `--ff-text-xs`.

**T-10.7 — `Badge`.** 5 colour variants × `dot` / `count` / `text` shapes. Height 20, radius full or 6, `12px/500`.

**T-10.8 — `Avatar` + `AvatarGroup`.** Sizes 24/32/40. Falls back to initials (max 2 chars, uppercase) on a deterministic speaker colour when there's no image. `AvatarGroup` overlaps by `-8px` with a `2px --ff-surface-0` ring, shows max 3 then a `+N` circle using `surface-2` bg / `text-secondary`. Hovering `+N` shows a tooltip listing the remaining names.

**T-10.9 — `Highlighter`.** `<Highlighter text={s} query={q} />` → array of strings and `<mark>` elements. Must handle: case-insensitive matching, regex-special characters in the query (escape them), multiple matches per string, an `activeIndex` prop that renders one match with `--ff-highlight-active`. Never touches `innerHTML`.

**T-10.10 — `Modal`.** Radix Dialog. Sizes 440/560/720. Focus trap, `Escape` to close (suppressible for dirty forms), backdrop `rgba(16,24,40,.4)` with a `2px` blur, scroll lock without layout shift (compensate scrollbar width), enter `200ms` fade+scale from .96. Slots: title, description, body, footer (actions right-aligned, primary rightmost).

**T-10.11 — `ConfirmDialog`.** Built on `Modal`. Destructive variant: danger icon in a `danger-subtle` circle, the object's name **bolded in the body text**, `Cancel` (secondary) + `Delete` (danger). Delete button shows a loading state and cannot be double-fired.

**T-10.12 — `Dropdown` / `Menu`.** Radix. Items with optional leading icon, trailing shortcut hint, separators, section labels, `danger` item variant, disabled items with tooltips. Full keyboard nav including typeahead. Aligns to the trigger, flips when near a viewport edge.

**T-10.13 — `Skeleton`.** `text` / `circle` / `rect` / `row` variants, shimmer via a CSS gradient animation, respects reduced-motion (falls back to a static pulse-free block). A `MeetingRowSkeleton` must be exactly 72px tall.

**T-10.14 — `EmptyState`.** Slots: illustration (inline SVG, muted line-art — do not use a stock 3D illustration, it clashes with the productivity aesthetic), title `16/600`, body `14/400 secondary` max 2 lines, primary CTA, optional secondary link.

**T-10.15 — `ResizablePanels`.** Horizontal split with a `4px` drag handle that widens to `8px` and turns `--ff-accent` on hover, `col-resize` cursor, min/max clamps (30%/70%), double-click to reset to 50%, ratio persisted to localStorage, keyboard-resizable with arrow keys when the handle is focused (`role="separator"` + `aria-valuenow`).

**T-10.16 — `Tabs`, `Checkbox`, `Switch`, `Radio`, `Pagination`, `ProgressBar`, `Popover`** — round out the set from A4, all token-driven.

**T-10.17 — Build `/dev/components`**, a gallery page rendering every primitive in every state. This is your visual-regression suite and your fastest debugging surface.

**T-10.18 — Ban raw HTML elements in feature code** via an ESLint `no-restricted-syntax` rule for `<button>` and `<input>` outside `components/ui/`. Mechanically enforces reuse, which is exactly what "Code Modularity" is graded on.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T10-A | PW-10-01 | Button `loading` toggled | Width identical before/after (±1px) |
| T10-B | PW-10-02 | Tab to every control on `/dev/components` | All show the focus ring; none show `outline: none` |
| T10-C | PW-10-03 | Open modal | Focus moves inside; Tab cycles within; Escape closes; focus returns to the trigger |
| T10-D | PW-10-04 | Open modal on a scrolled page | Body scroll locked; **no** horizontal shift from scrollbar removal |
| T10-E | PW-10-05 | `Highlighter` with query `a.*b` | Treated literally, no crash, no regex explosion |
| T10-F | PW-10-06 | `Highlighter` with query `<script>` | Rendered as text, not executed |
| T10-G | PW-10-07 | `AvatarGroup` with 24 participants | 3 avatars + `+21`; tooltip lists names |
| T10-H | PW-10-08 | Drag panel handle to 20% | Clamps at 30% |
| T10-I | PW-10-09 | Double-click panel handle | Returns to 50% |
| T10-J | PW-10-10 | ConfirmDialog delete double-clicked | Exactly **one** DELETE request |
| T10-K | PW-10-11 | Dropdown near the right viewport edge | Flips to stay on screen |
| T10-L | PW-10-12 | Axe scan on `/dev/components` | Zero serious/critical violations |
| T10-M | PW-10-13 | Visual | `components-gallery.png` snapshot |

**✅ Should look like:** one coherent system — every radius, every focus ring, every disabled state identical across the app.
**❌ Should NOT look like:** three different button heights on one screen; native `<select>` next to custom inputs; a modal whose backdrop doesn't lock scroll; content jumping 15px sideways when a modal opens; `alert()`/`confirm()` anywhere.

---

# PHASE 2 · THE NOTEBOOK (Meetings Library)

---

## T-11 · Meetings list API

**Branch:** `feat/T-11-meetings-api` · **Est:** 60 min

### Subtasks

**T-11.1 — `GET /api/v1/meetings`** accepting: `q`, `host`, `participant`, `from`, `to`, `min_duration`, `max_duration`, `tags[]`, `channel`, `has_action_items`, `source`, `sort`, `page`, `page_size`.

**T-11.2 — `MeetingListItem` response schema** — deliberately light:
`id, title, overview_preview (160 chars), started_at, duration_seconds, host {id,name,avatar_url}, participants[{id,display_name,avatar_url}] (max 5) , participant_count, action_item_counts {open, completed}, keywords[] (max 3), tags[], has_media, thumbnail_url`.
No transcript. No full summary.

**T-11.3 — Search implementation.** `q` matches title (weighted highest), overview, participant names, and — via FTS5 — transcript content. Return a `match_context` field when the hit came from the transcript so the row can show *why* it matched.

**T-11.4 — Filters as composable query builders.** Each filter is a function `(stmt, value) -> stmt`; the service folds the active ones. Adding a filter must not mean editing a 60-line `if` chain.

**T-11.5 — Sorting.** Whitelist `-started_at` (default), `started_at`, `-duration_seconds`, `duration_seconds`, `title`, `-created_at`. Any other value → 400 with `INVALID_SORT`. **Never** interpolate the sort string into SQL.

**T-11.6 — Pagination** with the T-04.5 envelope. `page_size` default 20, max 100, clamped not rejected.

**T-11.7 — Kill the N+1.** Participant lists and action-item counts must come from `selectinload` + a grouped subquery, not a per-row query. Assert the statement count in a test.

**T-11.8 — `GET /api/v1/meetings/facets`** returning available hosts, participants, tags, channels, and the min/max duration bounds — so the filter panel is populated from real data rather than hardcoded options.

**T-11.9 — Date filtering semantics.** `from`/`to` are inclusive dates interpreted in **UTC**; `to` covers the entire day (`< to + 1 day`). Document this — off-by-one on the end date is the most common filter bug.

**T-11.10 — Soft-delete filter** applied at the query-helper level so it can never be forgotten.

**T-11.11 — `ETag` / `Cache-Control: no-cache` handling** so repeated identical list requests are cheap but never stale.

**T-11.12 — `POST /api/v1/meetings/bulk-delete`** taking `{ids: []}`, returning `{deleted: n, failed: []}`, wrapped in one transaction.

**T-11.13 — pytest coverage** for every filter individually, then three combinations, then the empty-result case.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T11-A | pytest | No params | 8 items, newest first, envelope correct |
| T11-B | pytest | `?q=roadmap` | Only the roadmap meeting |
| T11-C | pytest | `?q=ROADMAP` | Same result (case-insensitive) |
| T11-D | pytest | `?q=` a word only in a transcript | Meeting returned **with** `match_context` |
| T11-E | pytest | `?from=<today>&to=<today>` | Exactly the 2 meetings seeded today |
| T11-F | pytest | `?to=<a meeting's own date>` | That meeting **is** included (inclusive end) |
| T11-G | pytest | `?participant=<name>&has_action_items=true` | Correct intersection |
| T11-H | pytest | `?sort=title` then `?sort=-title` | Exactly reversed |
| T11-I | pytest | `?sort=DROP TABLE` | 400 `INVALID_SORT`, table intact |
| T11-J | pytest | `?page=2&page_size=3` | Items 4–6, `has_next` correct |
| T11-K | pytest | `?page=99` | Empty `items`, 200 not 404 |
| T11-L | pytest | Query counter on a 20-item page | ≤ 4 statements |
| T11-M | pytest | Response body | No `segments` / `transcript` key anywhere |

---

## T-12 · Notebook page & meeting rows

**Branch:** `feat/T-12-notebook` · **Est:** 90 min
**This is the screen the evaluator sees first. Budget accordingly.**

### Exact row specification

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 16px ┊ [☐/▶ 40×40] 12px  Title (15/600/text-primary)          ┊  Jul 24  ┊ 42:18 │
│      ┊                    Overview preview (13/400/muted, 1 line, ellipsis)      │
│      ┊                    [#sales] [#urgent]                  ┊  ●●●+3   ┊ 4 open│
└─────────────────────────────────────────────────────────────────────────────────┘
height 72px · border-bottom 1px border-subtle · last row no border
```

Column widths: `checkbox 48` · `title flex-1 min-0` · `date 120` · `duration 80 right-aligned tnum` · `participants 140` · `action items 100` · `kebab 48`.

### Subtasks

**T-12.1 — Page header.** H1 `Meetings` (`--ff-text-display`), and to its right a muted `47 meetings` count that updates live with filters. Below, a `24px` gap to the toolbar.

**T-12.2 — Toolbar row.** `SearchInput` (flex-1, max 400px) · `Filters` secondary button with a `Filter` icon and an accent count badge when filters are active · `Sort` dropdown · a `List | Grid` segmented toggle.

**T-12.3 — Quick-filter chip row.** `Hosted by me`, `Shared with me`, `Has action items`, `This week`. Toggle chips, state in the URL, multi-selectable, `AND` semantics.

**T-12.4 — Sticky table header.** `position: sticky; top: 56px` (below the topbar), `--ff-surface-2` bg, `--ff-text-label` type, `1px` bottom border. Includes the select-all checkbox. Must not overlap or z-fight with the topbar.

**T-12.5 — `MeetingRow` component.** The whole row is a `<Link>` for correct middle-click/Cmd-click behaviour; the checkbox and kebab call `e.preventDefault(); e.stopPropagation()`. Title truncates with `text-overflow: ellipsis` and shows a title-attribute tooltip when truncated.

**T-12.6 — Leading cell swap.** At rest: a 40×40 rounded-8 thumbnail with a play triangle overlay (or a `surface-2` block with a `FileAudio` icon when `has_media` is false). On row hover **or** when any row is selected: cross-fades to a checkbox. Reserve the exact same 40×40 box so nothing shifts.

**T-12.7 — Date cell.** `formatRelativeDate` — `Today`, `Yesterday`, `Jul 24`, `Jul 24, 2025`. A tooltip on hover gives the full `Thursday, July 24, 2026 at 10:00 AM`.

**T-12.8 — Duration cell.** Right-aligned, `tabular-nums`, `--ff-text-sm`, muted. `42:18` never `2538s` and never `00:42:18`.

**T-12.9 — Participants cell.** `AvatarGroup` size 24, max 3 + `+N`. Hovering the group shows a tooltip with all names. Host's avatar is first and carries a subtle accent ring.

**T-12.10 — Action-items cell.** `4 open` as an accent `Badge` when >0; `All done` as a success badge when all complete; `—` muted when none. Not a bare number.

**T-12.11 — Kebab menu** (fades in on hover, always present for keyboard users): `Open`, `Copy link`, `Rename`, `Edit details`, `Export ▸`, `Move to channel ▸`, divider, `Delete` (danger).

**T-12.12 — Row states.** Hover `--ff-surface-hover`. Selected `--ff-accent-subtle` + a `2px` accent left border. Focus-visible: inset ring. Keyboard: `↑`/`↓` move a roving-tabindex focus, `Enter` opens, `Space` toggles the checkbox, `x` toggles selection (power-user touch).

**T-12.13 — Grid view.** Cards `320×220`: thumbnail band, title (2-line clamp), date · duration, avatar group, action-item badge. Grid is `repeat(auto-fill, minmax(300px, 1fr))` with a 16px gap. View preference persisted.

**T-12.14 — Loading state.** 8 `MeetingRowSkeleton`s at exactly 72px so the layout never jumps.

**T-12.15 — `data-testid`s:** `notebook-page`, `notebook-toolbar`, `meeting-list`, `meeting-row-<id>`, `meeting-row-title`, `meeting-row-date`, `meeting-row-duration`, `meeting-row-participants`, `meeting-row-actions`, `meeting-row-kebab`, `meeting-row-checkbox`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T12-A | PW-12-01 | Load `/notebook` | 8 rows; each has non-empty title, date, duration, ≥1 avatar |
| T12-B | PW-12-02 | Measure a row | `height === 72` |
| T12-C | PW-12-03 | Hover a row | bg = `--ff-surface-hover`; checkbox opacity 1; kebab visible |
| T12-D | PW-12-04 | Un-hover | Thumbnail returns; **no** layout shift (bounding box of the title unchanged) |
| T12-E | PW-12-05 | Click row body | Navigates to `/meeting/<id>` |
| T12-F | PW-12-06 | Click checkbox | Row selected, **no** navigation |
| T12-G | PW-12-07 | Click kebab | Menu opens, **no** navigation |
| T12-H | PW-12-08 | Cmd-click row | Opens in a new tab (proves it's a real anchor) |
| T12-I | PW-12-09 | Scroll to bottom | Table header still visible at `y=56` |
| T12-J | PW-12-10 | Meeting 7 (24 participants) | 3 avatars + `+21` |
| T12-K | PW-12-11 | Duration cell text | Matches `/^\d{1,2}:\d{2}$|^\d:\d{2}:\d{2}$/` |
| T12-L | PW-12-12 | Row seeded today | Date cell reads `Today` |
| T12-M | PW-12-13 | Very long title (250 chars, seeded) | Ellipsis, row still 72px, no wrap |
| T12-N | PW-12-14 | Keyboard `↓ ↓ Enter` | Opens the 3rd meeting |
| T12-O | PW-12-15 | Toggle to Grid | Cards render, preference survives reload |
| T12-P | PW-12-16 | Visual | `notebook-list.png`, `maxDiffPixelRatio 0.015` |

**✅ Should look like:** a dense, scannable 72px-row table; one bold title line with a muted preview beneath; right-aligned tabular durations; overlapping ringed avatars; a soft blue count badge.
**❌ Should NOT look like:** a card grid by default (Fireflies' primary view is the list); rows over 90px tall; the title and date at the same weight; duration as `2538 seconds` or `00:42:18`; avatars as a comma-separated name string; the checkbox permanently visible; the row not clickable except on the title link.

---

## T-13 · Search & filters

**Branch:** `feat/T-13-filters` · **Est:** 75 min

### Filter panel specification

Popover anchored to the `Filters` button, `380px` wide, `--ff-shadow-lg`, `--ff-radius-lg`, max-height `min(560px, 70vh)` with an internal scroll, a sticky footer holding `Clear all` (ghost) and `Apply` (primary).

Sections, in order:
1. **Host** — searchable multi-select of users, avatar + name per option
2. **Participants** — same, multi-select, `AND` semantics ("all of these attended")
3. **Date range** — preset radio list (`Any time`, `Today`, `Yesterday`, `Last 7 days`, `Last 30 days`, `This month`, `Custom`) → `Custom` reveals two date inputs
4. **Duration** — presets (`Any`, `< 15 min`, `15–30 min`, `30–60 min`, `> 60 min`) plus a custom range slider
5. **Tags** — chip cloud, click to toggle
6. **Channel** — single-select dropdown
7. **Has action items** — switch

### Subtasks

**T-13.1 — Debounced search input** (250ms) writing to `?q=`. Shows an inline spinner while the query is in flight and a `✕` clear when it has a value.

**T-13.2 — Search scope toggle** inside the input's dropdown: `Titles only` vs `Titles + transcripts` (default). When transcript-scoped hits occur, the row renders a second muted line: `"…matched: …the pricing model we discussed…"` with the term highlighted.

**T-13.3 — Build the `FiltersPanel`** exactly as specified above, each section collapsible with the open/closed state remembered.

**T-13.4 — Populate options from `/meetings/facets`**, never hardcoded. Options with zero matches under the current filter set render at 40% opacity with a `(0)` suffix rather than disappearing — disappearing options feel broken.

**T-13.5 — Draft vs applied state.** Changes inside the panel are *draft*; `Apply` commits them to the URL. `Escape` or clicking outside discards the draft and shows an info toast `Filters not applied`. (Alternative: live-apply with no Apply button — pick one, be consistent, and note the choice in `decisions.md`.)

**T-13.6 — Active-filter count badge** on the `Filters` button — an accent pill with the number of *active filter groups* (not values).

**T-13.7 — Active-filter chip row** rendered above the table when any filter is on: `Host: Sarah Chen ✕`, `Last 7 days ✕`, `#urgent ✕`, plus a trailing `Clear all` text button. Removing a chip removes exactly that filter.

**T-13.8 — Full URL round-tripping.** Every filter serialises to the query string; loading that URL cold reconstructs the exact panel state. Arrays as repeated params (`?tag=sales&tag=urgent`), not JSON blobs.

**T-13.9 — Reset pagination to page 1** whenever any filter or the query changes. Forgetting this is why users see "no results" on a filter that has 3 matches.

**T-13.10 — Two distinct empty states.** No meetings at all → `No meetings yet` + `Upload your first transcript` CTA. Filters active but no matches → `No meetings match your filters` + `Clear all filters` CTA + an echo of the active filters. These are different screens; do not reuse one.

**T-13.11 — Keyboard.** `/` focuses the notebook search (unless already in an input). `Escape` in the search clears it. The panel is fully keyboard-navigable and traps focus while open.

**T-13.12 — Sort dropdown:** `Most recent` (default), `Oldest first`, `Longest`, `Shortest`, `Title A–Z`, `Title Z–A`. Selected item shows a check. Persists in the URL.

**T-13.13 — `data-testid`s:** `filters-button`, `filters-panel`, `filter-section-<name>`, `filter-option-<value>`, `filters-apply`, `filters-clear`, `active-filter-chip-<key>`, `sort-dropdown`, `sort-option-<value>`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T13-A | PW-13-01 | Type `roadmap` in notebook search | List narrows to 1; count subtitle updates; URL has `?q=roadmap` |
| T13-B | PW-13-02 | Type 6 chars fast | ≤2 API calls |
| T13-C | PW-13-03 | Clear search | Full list returns; `q` removed from URL |
| T13-D | PW-13-04 | Filter host = Sarah | Only Sarah-hosted meetings; chip `Host: Sarah Chen` shown |
| T13-E | PW-13-05 | Date = Last 7 days | Only meetings within 7 days; assert against seeded dates |
| T13-F | PW-13-06 | Duration `> 60 min` | Zero results → correct filtered-empty state with `Clear all filters` |
| T13-G | PW-13-07 | Host + date + has-action-items together | Correct intersection; badge reads `3` |
| T13-H | PW-13-08 | Remove one chip | Only that filter drops; others persist |
| T13-I | PW-13-09 | `Clear all` | All chips gone, full list, clean URL |
| T13-J | PW-13-10 | Go to page 2, then apply a filter | Back on page 1 |
| T13-K | PW-13-11 | Copy a filtered URL, open in a new context | Identical results and panel state |
| T13-L | PW-13-12 | Browser Back after applying a filter | Previous state restored |
| T13-M | PW-13-13 | Sort `Longest` | Durations descending; assert programmatically |
| T13-N | PW-13-14 | Sort `Title A–Z` | Alphabetical, case-insensitive |
| T13-O | PW-13-15 | Search a transcript-only word | Row shows the `matched:` context line with the term marked |
| T13-P | PW-13-16 | Press `/` | Search focused |

**✅ Should look like:** a tidy popover of grouped filters, dismissible chips above the table, an accent count on the Filters button, everything reflected in the URL.
**❌ Should NOT look like:** filters that reset on refresh; a filter panel that's a plain unstyled `<form>`; the same empty state for "no data" and "no matches"; a page-2 blank screen after filtering; a filter dropdown with hardcoded names not present in the data.

---

## T-14 · Bulk selection & pagination

**Branch:** `feat/T-14-bulk` · **Est:** 45 min

### Subtasks

**T-14.1 — Selection state** as a `Set<string>` in a `useSelection` hook, cleared on filter/page change (with the count announced in a toast if >0 were dropped).

**T-14.2 — Header select-all checkbox** with a true **indeterminate** state (`el.indeterminate = true`) when some but not all rows on the page are selected.

**T-14.3 — Shift-click range selection** between the last-clicked and current checkbox. Small effort, disproportionately impressive.

**T-14.4 — Bulk action bar** — fixed, bottom-centre, `surface-0`, `shadow-lg`, radius `full`, slides up 200ms: `3 selected` · `Move to channel` · `Export` · `Delete` (danger) · `✕ Clear`.

**T-14.5 — Bulk delete** → `ConfirmDialog` naming the count (`Delete 3 meetings?`), then one `POST /bulk-delete`, optimistic removal, success toast with `Undo`.

**T-14.6 — Partial-failure handling.** If `failed[]` is non-empty, show a warning toast `2 of 3 deleted` and restore the failed rows.

**T-14.7 — `Pagination` component.** `Showing 1–20 of 47` on the left; page buttons on the right with ellipsis compaction (`1 2 3 … 8`); prev/next disabled at bounds; a page-size select (`20 / 50 / 100`).

**T-14.8 — Scroll to top on page change**, smoothly, and move focus to the table header for screen-reader continuity.

**T-14.9 — Preserve selection across pages** but scope the bulk bar's count to *total* selected, with a `Select all 47 matching` link when the user selects everything on a page.

**T-14.10 — Empty and single-page cases.** Hide pagination entirely when `total_pages <= 1`. Do not render a lone disabled `[1]`.

**T-14.11 — Prefetch the next page** on hover of the next button (TanStack `prefetchQuery`). Cheap perceived-performance win.

**T-14.12 — `data-testid`s:** `select-all`, `bulk-bar`, `bulk-count`, `bulk-delete`, `bulk-clear`, `pagination`, `pagination-next`, `pagination-page-<n>`, `page-size-select`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T14-A | PW-14-01 | Check one row | Bulk bar slides up, reads `1 selected` |
| T14-B | PW-14-02 | Check 3 | `3 selected`; header checkbox indeterminate |
| T14-C | PW-14-03 | Click select-all | All page rows checked; header fully checked |
| T14-D | PW-14-04 | Uncheck one after select-all | Header returns to indeterminate |
| T14-E | PW-14-05 | Click row 1, shift-click row 5 | 5 selected |
| T14-F | PW-14-06 | Bulk delete 2 → confirm | Both rows gone, toast `2 meetings deleted`, count subtitle decremented |
| T14-G | PW-14-07 | Undo after bulk delete | Both restored in original order |
| T14-H | PW-14-08 | Clear | Bulk bar slides away, all unchecked |
| T14-I | PW-14-09 | Select rows then apply a filter | Selection cleared, informational toast |
| T14-J | PW-14-10 | With 8 seeded meetings, `page_size=20` | Pagination **not rendered** |
| T14-K | PW-14-11 | Seed 50, page 2 | Rows 21–40, `Showing 21–40 of 50` |
| T14-L | PW-14-12 | On last page | Next disabled; on page 1 Prev disabled |
| T14-M | PW-14-13 | Change page size to 50 | Back to page 1, 50 rows |

**✅ Should look like:** a floating pill bar at the bottom of the viewport when rows are selected; a real indeterminate dash in the header checkbox.
**❌ Should NOT look like:** a bulk bar that pushes content down (must overlay); select-all that also selects rows on other pages silently; deleting without confirmation; pagination rendered for a single page.

---

## T-15 · Meeting details side panel

**Branch:** `feat/T-15-details-panel` · **Est:** 45 min
Fireflies shows a right-hand details drawer from the list without leaving the page. Reproduce it.

### Subtasks

**T-15.1 — Trigger.** A `Details` ghost button appearing on row hover, and `Details` in the kebab menu.

**T-15.2 — Drawer shell.** Right-anchored, `420px` wide (full width below 640px), `surface-0`, `shadow-lg`, `1px` left border, slide-in `240ms`, backdrop only on mobile.

**T-15.3 — Header.** Title (2-line clamp) + `✕` close + `Open full view →` link to `/meeting/[id]`.

**T-15.4 — Metadata block.** Label/value rows: `Host`, `Date`, `Time`, `Duration`, `Language`, `Source`, `Privacy`. Labels `--ff-text-label`, values `--ff-text-body`.

**T-15.5 — Meeting summary block.** The overview paragraph, clamped to 4 lines with a `Show more` toggle.

**T-15.6 — Privacy row** with a lock icon and a select (`Private` / `Team` / `Public`). Changing it PATCHes and toasts.

**T-15.7 — Channels block** — current channel + a `Move to channel` dropdown.

**T-15.8 — `Invited` list** — all participants with avatar + name + email.

**T-15.9 — `Attended` list** — participants with `attended = true`, each with their attendance duration and a thin talk-time bar in their speaker colour. This one detail makes the drawer look genuinely Fireflies-y.

**T-15.10 — Action items preview** — first 3 with checkboxes (functional, optimistic) + `View all N →`.

**T-15.11 — Keyboard & focus.** Focus trap, `Escape` closes, focus returns to the triggering row. `←`/`→` move between meetings without closing the drawer.

**T-15.12 — URL state** `?details=<id>` so the drawer is deep-linkable and survives refresh.

**T-15.13 — `data-testid`s:** `details-drawer`, `details-close`, `details-meta-<field>`, `details-attended-list`, `details-action-item-<id>`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T15-A | PW-15-01 | Hover row → click `Details` | Drawer slides in from the right; URL gains `?details=<id>` |
| T15-B | PW-15-02 | Reload with `?details=<id>` | Drawer open with correct data |
| T15-C | PW-15-03 | Escape | Drawer closes; `?details` removed; focus back on the row |
| T15-D | PW-15-04 | Check an action item in the drawer | Strikethrough immediately; row's `N open` badge decrements |
| T15-E | PW-15-05 | Change privacy to `Team` | PATCH fired; success toast; value persists after reload |
| T15-F | PW-15-06 | Meeting 7 | Invited list shows all 24; attended list shows only attendees |
| T15-G | PW-15-07 | Click `Open full view` | Navigates to `/meeting/<id>` |
| T15-H | PW-15-08 | `→` arrow | Drawer shows the next meeting; list highlight follows |
| T15-I | PW-15-09 | Viewport 500px | Drawer is full-width with a backdrop |

**✅ Should look like:** a clean 420px right drawer with labelled metadata, an attendee list with talk-time bars, and inline-checkable action items.
**❌ Should NOT look like:** a modal in the centre of the screen; a drawer that pushes the table sideways; metadata as raw JSON; a drawer that loses its state on refresh.

---

## T-16 · States: empty, loading, error, offline

**Branch:** `feat/T-16-states` · **Est:** 30 min

### Subtasks

**T-16.1 — First-run empty state** (`/notebook`, zero meetings): line-art illustration, `No meetings yet`, `Upload a transcript or create a meeting to get started.`, primary `Upload transcript`, secondary `Create manually`.

**T-16.2 — Filtered-empty state:** `No meetings match your filters`, an echo of the active filters, `Clear all filters` primary.

**T-16.3 — Search-empty state:** `No results for "xyz"`, `Try a different search term or search transcripts too.`, secondary `Clear search`.

**T-16.4 — List loading:** 8 skeleton rows at exactly 72px, shimmering, header and toolbar fully rendered (they don't depend on data).

**T-16.5 — Error state:** `AlertTriangle` in a `danger-subtle` circle, `Couldn't load meetings`, the error code in muted mono text, `Try again` primary calling `refetch()`.

**T-16.6 — Inline refetch indicator** — a 2px accent progress bar under the topbar during background refetches, so stale-while-revalidate is visible but not disruptive.

**T-16.7 — Offline detection.** `navigator.onLine` + a query error heuristic → a persistent `You're offline` info banner under the topbar; retry automatically on reconnect.

**T-16.8 — Per-section detail-page states.** Transcript, summary, and action items each get their own skeleton and error state — one failing section must not blank the whole page.

**T-16.9 — Long-content guards.** Titles clamp at 2 lines, overview previews at 1, transcripts virtualise, participant lists overflow to `+N`. Test each with deliberately extreme seeded data.

**T-16.10 — 404 for a missing meeting:** branded page, `This meeting doesn't exist or was deleted.`, `Back to meetings` primary.

**T-16.11 — Slow-network dignity.** Throttle to Slow 3G and walk the app. Anything that shows a blank white area for >300ms needs a skeleton.

**T-16.12 — A single `<StateView>` component** driving all of these from a variant prop, so the visual language is identical everywhere.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T16-A | PW-16-01 | Empty DB | First-run empty state with both CTAs |
| T16-B | PW-16-02 | Impossible filter combo | Filtered-empty state (different copy from T16-A) |
| T16-C | PW-16-03 | Search `zzzz` | Search-empty state echoing the query |
| T16-D | PW-16-04 | Route `/meetings` to 500 | Error state with `Try again`; clicking it refetches |
| T16-E | PW-16-05 | Delay `/meetings` 3s | 8 skeleton rows visible; heights 72px |
| T16-F | PW-16-06 | Data lands after skeletons | CLS < 0.1 |
| T16-G | PW-16-07 | Route only `/summary` to 500 | Summary panel shows an error; transcript still renders |
| T16-H | PW-16-08 | `context.setOffline(true)` | Offline banner appears; disappears on reconnect |
| T16-I | PW-16-09 | `/meeting/bogus-id` | Branded 404 |
| T16-J | PW-16-10 | Visual | Snapshots of all four empty/error variants |

**✅ Should look like:** every state deliberately designed, with distinct copy and a clear next action.
**❌ Should NOT look like:** a blank white page; a raw `Error: Failed to fetch`; a centred spinner as the only loading state; the same "No data" message for four different situations.

---

# PHASE 3 · THE NOTEPAD (Meeting Detail)

---

## T-17 · Meeting detail API

**Branch:** `feat/T-17-detail-api` · **Est:** 45 min

### Subtasks

**T-17.1 — `GET /meetings/{id}`** returning `MeetingDetail`: full metadata, host, all participants with talk stats, speakers with resolved colours, summary (all sections), keywords, action items, tags, media info, and the **first 200** transcript segments plus a cursor. Do not ship 1,200 segments in the initial payload.

**T-17.2 — `GET /meetings/{id}/transcript?cursor&limit=200`** — cursor pagination on `sequence`, returning `{segments, next_cursor, total}`.

**T-17.3 — `?q=` on the transcript endpoint** returning only matching segments plus their match offsets, for server-side transcript search over long meetings.

**T-17.4 — Segment response shape:** `{id, sequence, start_ms, end_ms, speaker: {id, label, color_index}, text, is_edited}`. Speaker sent by reference, not duplicated per segment.

**T-17.5 — `PATCH /segments/{id}`** — edit `text` and/or reassign `speaker_id`. Sets `is_edited = true`, touches `updated_at`, updates the FTS index, and marks the summary `is_stale = true`.

**T-17.6 — `PATCH /speakers/{id}`** — rename a speaker across the whole meeting in one statement, optionally linking to a `participant_id`.

**T-17.7 — `GET /meetings/{id}/summary`** returning the five canonical sections in order, with outline entries carrying `start_ms`.

**T-17.8 — `POST /summary/regenerate`** — calls the AI provider, replaces sections in a transaction, clears `is_stale`, returns the new summary. Idempotent under concurrent calls (row lock or a `processing` flag).

**T-17.9 — `GET /meetings/{id}/media`** streaming the audio with **HTTP Range support** (206 responses). Without ranges, seeking in the browser player silently fails. This is the single most-missed backend detail in this assignment.

**T-17.10 — `PATCH /meetings/{id}`** for title, description, participants (add/remove), tags, visibility, channel. Partial updates only — never require the full object.

**T-17.11 — `DELETE /meetings/{id}`** soft-deletes and returns 204; `POST /restore` un-deletes and returns the meeting.

**T-17.12 — Consistent 404 vs 410.** A soft-deleted meeting returns **410 Gone** with `code=MEETING_DELETED` and a restore hint; a never-existing id returns 404. A small correctness detail that reads as care.

**T-17.13 — pytest coverage** for every endpoint including the range-request behaviour.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T17-A | pytest | `GET /meetings/{id}` on the 55-min meeting | ≤200 segments + a `next_cursor` |
| T17-B | pytest | Follow cursors to exhaustion | All segments, no duplicates, no gaps, strictly ordered |
| T17-C | pytest | `PATCH` a segment's text | Persisted, `is_edited=true`, summary `is_stale=true`, FTS updated |
| T17-D | pytest | Rename a speaker | Every segment reflects it; one UPDATE statement |
| T17-E | pytest | `GET /media` with `Range: bytes=1000-2000` | **206**, correct `Content-Range`, exactly 1001 bytes |
| T17-F | pytest | `GET /media` without Range | 200 + `Accept-Ranges: bytes` |
| T17-G | pytest | Delete then GET | 410 `MEETING_DELETED` |
| T17-H | pytest | GET a random UUID | 404 `MEETING_NOT_FOUND` |
| T17-I | pytest | `PATCH` with only `{title}` | Other fields untouched |
| T17-J | pytest | Two concurrent regenerate calls | One generation, both get a valid summary |
| T17-K | pytest | Summary response | Sections in the canonical order; every outline `start_ms` maps to a real segment |

---

## T-18 · Notepad page shell & header

**Branch:** `feat/T-18-notepad-shell` · **Est:** 60 min

### Subtasks

**T-18.1 — Layout grid.** `grid-template-columns: 56px 1fr` for icon rail + content; content is a `ResizablePanels` split (summary left, transcript right). Header is sticky at `top: 56px`, height 64.

**T-18.2 — Header left cluster.** Back `IconButton` (`ArrowLeft`, navigates to `/notebook` **preserving the previous filter query string** — store it in `sessionStorage` on navigate-away), then the title.

**T-18.3 — Inline title editing.** Click the title (or its pencil, which appears on hover) → becomes an input in place with identical typography so nothing shifts. `Enter` saves, `Escape` reverts, blur saves. Optimistic update + toast. Empty title is rejected with an inline error.

**T-18.4 — Metadata line** beneath the title: `Jul 24, 2026 · 10:00 AM · 42:18 · 5 participants · English`, `--ff-text-sm` muted, `·` separators with `8px` margins. Participant count is a button opening a participants popover.

**T-18.5 — Header right cluster:** `Copy link` icon button (copies the current URL *including* `?t=`, toasts `Link copied to clipboard`), `Share` secondary button (opens a Coming-Soon-flavoured share popover with a working "copy public link" and disabled team options), and a kebab.

**T-18.6 — Kebab menu:** `Rename`, `Edit details`, `Regenerate summary`, `Change language` (Soon), `Download ▸ (PDF / Markdown / Text)`, `Meeting info`, divider, `Delete meeting` (danger).

**T-18.7 — Icon rail** (56px, from A2.2): `Smart Search`, `Index`, `Soundbites`, `Comments`, `Bookmarks`. Each toggles a 320px flyout panel over the summary panel. Active item gets an `accent-subtle` rounded square. Only one open at a time. Tooltips on the right.

**T-18.8 — Panel resize** with persistence, clamped 30–70%, double-click to reset — all from `ResizablePanels` (T-10.15).

**T-18.9 — Responsive collapse.** Below 1024px the two panels become `Summary | Transcript` tabs with the player pinned above them. Below 768px the icon rail becomes a bottom action bar.

**T-18.10 — Independent scroll containers.** Summary and transcript each scroll internally; the page itself must not scroll. Set `height: calc(100vh - 120px)` and `overflow-y: auto` on each. Getting this wrong (page-level scroll) is instantly noticeable against the real app.

**T-18.11 — Page metadata.** `<title>{meeting.title} · Fireflies</title>`; browser-tab title updates when the title is edited.

**T-18.12 — Prefetch on the notebook.** Hovering a meeting row prefetches its detail query, so the click feels instant.

**T-18.13 — `data-testid`s:** `notepad-page`, `notepad-header`, `notepad-title`, `notepad-title-input`, `notepad-meta`, `notepad-copy-link`, `notepad-kebab`, `icon-rail`, `icon-rail-<id>`, `summary-panel`, `transcript-panel`, `panel-resize-handle`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T18-A | PW-18-01 | Open a meeting | Header, both panels, player, icon rail all present |
| T18-B | PW-18-02 | Click title, type, Enter | Title updates in header, tab title, and in the notebook list on back-navigation |
| T18-C | PW-18-03 | Edit title, Escape | Reverts; no PATCH fired |
| T18-D | PW-18-04 | Clear title, Enter | Inline error, no PATCH, title unchanged |
| T18-E | PW-18-05 | Filter notebook → open meeting → Back | Returns to `/notebook` **with the filter still applied** |
| T18-F | PW-18-06 | Click `Copy link` at `t=125` | Clipboard contains the URL with `?t=125`; toast shown |
| T18-G | PW-18-07 | Drag the resize handle | Ratio changes; survives reload |
| T18-H | PW-18-08 | Scroll the transcript panel | Header and summary panel stay fixed; `window.scrollY === 0` |
| T18-I | PW-18-09 | Viewport 900px | Panels become tabs; both reachable |
| T18-J | PW-18-10 | Click each icon-rail item | Correct flyout opens; previous one closes |
| T18-K | PW-18-11 | Visual | `notepad-full.png` |

**✅ Should look like:** a fixed-chrome, dual-pane workspace where only the panel interiors scroll.
**❌ Should NOT look like:** the whole page scrolling so the header disappears; panels of fixed non-resizable width; the title only editable via a modal; back navigation losing the user's filters.

---

## T-19 · Media player

**Branch:** `feat/T-19-player` · **Est:** 75 min

### Exact specification

```
┌────────────────────────────────────────────────────────────┐
│  ▓▓▒▒▓▓▒░▒▓▓▒▒░▓▒▓  waveform strip (h=48, optional)        │
│  ──────────●──────────────────────────────────────────      │  seekbar h=4, thumb 12
│  ⏮ ⏪10  ▶/⏸(40px accent circle)  ⏩10 ⏭    12:04 / 42:18   │
│  1x ▾                                     🔊 ────  ⛶  ⋯     │
└────────────────────────────────────────────────────────────┘
card: surface-0, border-subtle, radius-lg, padding 16, shadow-xs
```

Seekbar: track `--ff-surface-2`, buffered `--ff-border-strong`, played `--ff-accent`, thumb `12px` accent circle with a white ring, scaling to 16px on hover. Track expands `4px → 6px` on hover.

### Subtasks

**T-19.1 — `usePlayer` hook** owning the single source of truth: `{currentMs, duration, isPlaying, rate, volume, muted, buffered, seek(), play(), pause(), toggle()}`. Backed by a real `<audio>`/`<video>` element when media exists, and by a `requestAnimationFrame` virtual clock when it does not. **Every consumer uses the same interface**, so the transcript sync code is identical in both modes.

**T-19.2 — Transport controls.** Play/pause as a 40px accent circle with white icon (the visual anchor of the card); skip ±10s; previous/next **segment** (not ±30s — jumping to speaker turns is the Fireflies-appropriate behaviour).

**T-19.3 — Seekbar.** Click to seek, drag to scrub (with `pointer` events so it works on touch), keyboard `←`/`→` = ±5s and `Home`/`End` = start/end when focused. `role="slider"` with `aria-valuenow`/`aria-valuetext` in `MM:SS`.

**T-19.4 — Hover preview.** A tooltip above the seekbar showing the hovered timestamp **and the speaker who is talking at that moment** — a small detail that reads as polished.

**T-19.5 — Time display.** `12:04 / 42:18`, `tabular-nums`, so the layout doesn't twitch every second. Clicking it toggles to a remaining-time display (`-30:14`).

**T-19.6 — Playback rate menu:** `0.5×, 0.75×, 1×, 1.25×, 1.5×, 1.75×, 2×`. Persisted to localStorage across meetings. Label shows the current rate.

**T-19.7 — Volume.** Mute toggle + a horizontal slider that expands on hover. Persisted. Icon reflects level (`Volume2` / `Volume1` / `VolumeX`).

**T-19.8 — Chapter markers on the seekbar.** Thin 2px accent-amber ticks at each outline `start_ms`; hovering a tick shows the chapter title; clicking seeks to it. This directly ties the summary and the player together and is very visible in a demo.

**T-19.9 — Waveform.** If real media: decode with the Web Audio API once, downsample to ~400 peaks, cache in `sessionStorage`, render to a `<canvas>` with played/unplayed portions in different colours. If no media: render a deterministic pseudo-waveform seeded from the meeting id (never `Math.random()` — it must be stable across renders and across visual-regression runs).

**T-19.10 — Buffered ranges** painted from `audio.buffered` into the seekbar.

**T-19.11 — Keyboard shortcuts** (global on the notepad page, suppressed while an input is focused): `Space` play/pause, `←`/`→` ±5s, `J`/`L` ±10s, `K` toggle, `↑`/`↓` volume, `M` mute, `F` fullscreen (video), `0–9` seek to N×10%, `Shift+/` opens a shortcuts help modal.

**T-19.12 — Deep-link `?t=`.** On mount, seek to `t` seconds and scroll the transcript to that segment. While playing, throttle-write `?t=` back to the URL with `router.replace` at most once per 5s (never `push` — it would pollute history).

**T-19.13 — Sticky player.** The player card stays pinned at the top of the transcript panel while the transcript scrolls underneath.

**T-19.14 — Error handling.** Media 404/decode failure → the card renders the virtual-clock mode with a muted `Audio unavailable — showing transcript timeline` note. Never a broken black `<video>` box or a browser error string.

**T-19.15 — `data-testid`s:** `player`, `player-play`, `player-seekbar`, `player-time`, `player-rate`, `player-volume`, `player-chapter-<i>`, `player-waveform`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T19-A | PW-19-01 | Click play | Icon → pause; time advances within 1s; `isPlaying` true |
| T19-B | PW-19-02 | Click seekbar at 50% | Time jumps to ~half of duration (±2%) |
| T19-C | PW-19-03 | Drag thumb to 75% | Time ~75%; transcript scrolls to that region |
| T19-D | PW-19-04 | Press `Space` | Toggles play/pause |
| T19-E | PW-19-05 | Press `Space` while typing in transcript search | **Types a space**, does not toggle playback |
| T19-F | PW-19-06 | Press `→` ×3 | +15s |
| T19-G | PW-19-07 | Set rate 1.5×, open another meeting | Rate still 1.5× |
| T19-H | PW-19-08 | Load `/meeting/{id}?t=300` | Player at 5:00; transcript scrolled to that segment; segment highlighted |
| T19-I | PW-19-09 | Play 6s | URL `?t=` updated **once**, via replace (history length unchanged) |
| T19-J | PW-19-10 | Click a chapter marker | Seeks to that chapter's `start_ms` |
| T19-K | PW-19-11 | Hover the seekbar mid-track | Tooltip shows a timestamp and a speaker name |
| T19-L | PW-19-12 | Meeting with `media_type='none'` | Player renders, virtual clock advances, transcript still syncs |
| T19-M | PW-19-13 | Route media to 404 | Graceful fallback message, no broken element |
| T19-N | PW-19-14 | Time display for 10s | Width does not change (tabular-nums proof) |
| T19-O | PW-19-15 | Scroll transcript 2000px | Player still visible at the top of the panel |

**✅ Should look like:** a compact card with an accent circular play button, a thin accent-filled seekbar with amber chapter ticks, and a right-aligned rate/volume cluster.
**❌ Should NOT look like:** the browser's default `<audio controls>` widget (instant fail on the UI criterion); a seekbar that can't be dragged; a time display that jitters; keyboard shortcuts firing while typing in a text field.

---

## T-20 · Transcript panel

**Branch:** `feat/T-20-transcript` · **Est:** 90 min

### Exact line specification

```
┌────────────────────────────────────────────────────────────┐
│ ●  Sarah Chen                                     00:14    │   ← speaker row
│    Good morning everyone. Let's start with the Q3          │   ← text, 15/26/400
│    numbers and then move to the roadmap.                   │
│                                                     [⋯]    │   ← hover actions
└────────────────────────────────────────────────────────────┘
padding 12px 16px · text indent aligns under the name (36px)
consecutive same-speaker segments GROUP: name shown once, subsequent
lines show only the timestamp on hover
```

| State | Styling |
|---|---|
| Default | transparent bg |
| Hover | `--ff-surface-hover` bg; timestamp and `⋯` become visible |
| **Active (currently playing)** | `--ff-accent-subtle` bg + `3px` left border `--ff-accent`; text `--ff-text-primary` |
| Search match | matched substrings wrapped in `--ff-highlight` |
| Current search match | `--ff-highlight-active` + auto-scrolled into view |
| Edited | small `Edited` badge next to the timestamp |

### Subtasks

**T-20.1 — Fetch the first page** from the detail payload, then infinite-load subsequent pages on scroll (or eagerly in the background after mount — for a ≤1,500-segment demo, eager is smoother).

**T-20.2 — Virtualise with `@tanstack/react-virtual`.** Dynamic measurement (segments have variable heights), `overscan: 10`. Required for the 55-minute meeting; also demonstrably good engineering. If you skip virtualisation, say why in `decisions.md` — an unjustified 1,200-node list is a code-quality mark lost.

**T-20.3 — Speaker grouping.** Consecutive segments from the same speaker render as one visual block with a single name header, matching Fireflies. Group boundaries also break on gaps > 30s.

**T-20.4 — Speaker avatar + name.** 24px avatar (initials on the speaker's deterministic colour) + name in `14/600` **in the speaker's colour**. Colours must match the ones used in the participants list and talk-time bars.

**T-20.5 — Timestamps.** `MM:SS`, `--ff-text-xs`, muted, `tabular-nums`, right-aligned in the speaker row. Always visible on the first line of a group; visible on hover for continuation lines. Clicking a timestamp seeks (T-21).

**T-20.6 — Text rendering.** `--ff-text-transcript` (15/26). Preserve sentence spacing. Selectable. `user-select: text` explicitly (some resets kill it).

**T-20.7 — Per-segment hover menu (`⋯`):** `Copy text`, `Copy link to this moment`, `Add comment` (T-31), `Create soundbite` (T-33), `Highlight` (T-32), `Edit`, `Reassign speaker`.

**T-20.8 — Text selection toolbar.** Selecting text inside a segment pops a small floating toolbar above the selection: `Copy`, `Highlight`, `Comment`, `Soundbite`. Very Fireflies; ~40 minutes of work.

**T-20.9 — Auto-scroll to the active segment** while playing, using `scrollToIndex` with `align: 'center'` and smooth behaviour. **Suspend auto-scroll for 5 seconds after any manual scroll**, and show a `Jump to current ↓` floating pill to re-engage. Without this suspension the panel fights the user — a very common and very visible bug.

**T-20.10 — Sticky speaker header.** The current speaker's name sticks to the top of the transcript viewport while scrolling through a long turn.

**T-20.11 — `Copy transcript` action** in the panel header — full transcript to the clipboard as `[00:14] Sarah Chen: text`, with a toast.

**T-20.12 — Empty transcript state:** `No transcript available for this meeting` + `Upload a transcript` CTA.

**T-20.13 — Performance budget.** Scrolling a 1,200-segment transcript must hold 60fps. Verify with a Playwright trace or `performance.measure`. Memoise `SegmentRow` with a comparator that ignores unchanged props.

**T-20.14 — `data-testid`s:** `transcript-panel`, `transcript-list`, `transcript-segment-<id>`, `transcript-speaker-<id>`, `transcript-timestamp-<id>`, `transcript-segment-menu`, `transcript-jump-to-current`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T20-A | PW-20-01 | Open the hero meeting | ≥40 segments rendered in DOM order matching sequence |
| T20-B | PW-20-02 | Every segment | Has a timestamp matching `/^\d{1,2}:\d{2}$/` and belongs to a named speaker |
| T20-C | PW-20-03 | Two consecutive same-speaker segments | Name rendered **once** |
| T20-D | PW-20-04 | Speaker colour | Same speaker's colour identical in transcript, participants list, and drawer talk bar |
| T20-E | PW-20-05 | The 55-min meeting (1,200 segments) | DOM node count < 150 (virtualisation proof) |
| T20-F | PW-20-06 | Scroll to the very bottom | Last segment reachable and rendered |
| T20-G | PW-20-07 | Play, wait 15s | Active segment advances; auto-scrolls; exactly one active at a time |
| T20-H | PW-20-08 | Manually scroll while playing | Auto-scroll suspends; `Jump to current` pill appears |
| T20-I | PW-20-09 | Click `Jump to current` | Scrolls back to the active segment; pill disappears |
| T20-J | PW-20-10 | Hover a segment | bg changes; `⋯` appears; timestamp appears on continuation lines |
| T20-K | PW-20-11 | Segment menu → `Copy text` | Clipboard matches the segment text exactly |
| T20-L | PW-20-12 | Select text across the segment | Floating toolbar appears above the selection |
| T20-M | PW-20-13 | `Copy transcript` | Clipboard has N lines in `[MM:SS] Speaker: text` format |
| T20-N | PW-20-14 | Scroll 5,000px | No dropped-frame budget breach; no blank regions |
| T20-O | PW-20-15 | Meeting with no segments | Empty state with CTA |
| T20-P | PW-20-16 | Visual | `transcript-panel.png` |

**✅ Should look like:** grouped speaker turns, coloured names, muted right-aligned timestamps, generous 26px line-height, one softly highlighted active line with a blue left edge.
**❌ Should NOT look like:** a `<pre>` block; the speaker name repeated on every line of the same turn; every speaker in the same colour; a chat-bubble layout (that's Otter, not Fireflies); timestamps as `00:00:14.500`; a transcript panel that scrolls the whole page.

---

## T-21 · Transcript ↔ player bidirectional sync

**Branch:** `feat/T-21-sync` · **Est:** 45 min
**This is the single most-graded interaction in the assignment.** The spec calls it out explicitly: *"Clicking a transcript line seeks the player to that timestamp (and vice versa)."*

### Subtasks

**T-21.1 — Transcript → player.** Clicking anywhere on a segment (outside its hover menu) calls `player.seek(segment.start_ms)`. If paused, it stays paused but the active highlight moves; if playing, playback continues from there.

**T-21.2 — Timestamp click** does the same and additionally starts playback — a distinct, intentional affordance (`cursor: pointer`, accent colour on hover).

**T-21.3 — Player → transcript.** A `useActiveSegment(currentMs, segments)` hook resolving the active segment via **binary search** over `start_ms` (O(log n), not `.find()` on every tick).

**T-21.4 — Throttle the tick.** `timeupdate` fires ~4×/s; resolve and set active state at most 4×/s and only commit state when the resolved id actually changes. Naively setting state on every tick re-renders 1,200 rows and tanks the frame rate.

**T-21.5 — Edge cases:** time before the first segment → no active segment; time in a gap between segments → keep the previous segment active (better UX than flickering to none); time past the last segment → last stays active.

**T-21.6 — Outline → player.** Clicking an outline entry's timestamp in the summary seeks and scrolls the transcript. Same for chapter ticks on the seekbar (T-19.8) and for action items that carry a `start_ms`.

**T-21.7 — Search result → player.** Clicking a transcript search result seeks *and* sets it as the current match.

**T-21.8 — Comment/soundbite/highlight → player** (bonus features) reuse the same `seekTo(ms)` command. Define it once in a `useNotepadCommands()` hook so there is exactly one seek path in the codebase.

**T-21.9 — Deep-link on load.** `?t=` → seek, resolve the active segment, and scroll it into view **after** virtualisation has measured (wait a frame, or use the virtualizer's `scrollToIndex` in a `useEffect` keyed on `segments.length`).

**T-21.10 — Scroll-position restoration.** Navigating away and back restores the transcript scroll offset.

**T-21.11 — Prevent feedback loops.** Programmatic scrolls must not trigger the "user scrolled, suspend auto-scroll" logic. Guard with a `isProgrammaticScroll` ref cleared on the next frame. This bug — auto-scroll disabling itself immediately — is extremely common; test for it explicitly.

**T-21.12 — Accessibility.** Active segment gets `aria-current="true"`; the transcript list is `aria-live="off"` (announcing every line would be hostile); a visually hidden live region announces the speaker on change only.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T21-A | PW-21-01 | Click segment #20 | Player time == that segment's `start_ms` (±250ms) |
| T21-B | PW-21-02 | Click a segment while paused | Stays paused; highlight moves |
| T21-C | PW-21-03 | Click a segment while playing | Keeps playing from the new position |
| T21-D | PW-21-04 | Click a timestamp | Seeks **and** starts playing |
| T21-E | PW-21-05 | Play from 0, wait 20s | Active segment changes ≥2 times; always exactly one active |
| T21-F | PW-21-06 | Seek to 90% | Active segment is near the end; transcript scrolled there |
| T21-G | PW-21-07 | Seek to 0 | First segment active |
| T21-H | PW-21-08 | Seek into a known inter-segment gap | Previous segment stays active (no flicker to none) |
| T21-I | PW-21-09 | Seek past the end | Last segment active, no crash |
| T21-J | PW-21-10 | Click an outline timestamp | Player seeks; transcript scrolls; that segment active |
| T21-K | PW-21-11 | Play 30s with a perf trace | Long-task total < 200ms (throttle proof) |
| T21-L | PW-21-12 | Play; auto-scroll fires | `Jump to current` does **not** appear (programmatic-scroll guard) |
| T21-M | PW-21-13 | Load `?t=1500` on the long meeting | Correct segment active and centred in view |
| T21-N | PW-21-14 | Back then forward to the meeting | Transcript scroll offset restored |

**✅ Should look like:** click a line, the player jumps; press play, the lines light up in time and the panel follows.
**❌ Should NOT look like:** one-way sync only; multiple lines highlighted at once; the highlight lagging seconds behind the audio; the panel scroll-fighting the user; a full re-render on every tick.

---

## T-22 · Transcript search & highlighting

**Branch:** `feat/T-22-transcript-search` · **Est:** 45 min

### Subtasks

**T-22.1 — Find bar** above the transcript: `SearchInput` with placeholder `Find in transcript`, a match counter `3 of 11`, `‹`/`›` prev/next buttons, and a `✕` close. Opens via the panel button or `⌘F`/`Ctrl+F` (with `preventDefault` to override the browser's find — and a note in the shortcuts modal that `Esc` restores native find).

**T-22.2 — Client-side matching** over loaded segments, debounced 200ms, case-insensitive, whole-word toggle, with regex characters escaped. For meetings whose segments aren't fully loaded, fall back to the server `?q=` endpoint.

**T-22.3 — Highlight all matches** with `<mark>` at `--ff-highlight` using the `Highlighter` primitive. The current match uses `--ff-highlight-active` plus a subtle 1px outline.

**T-22.4 — Navigation.** `Enter` / `›` → next match (wrapping to the first with a brief `Reached the end, wrapped to top` hint); `Shift+Enter` / `‹` → previous. Each navigation scrolls the match into view *and* updates the counter.

**T-22.5 — Cross-virtualisation scrolling.** A match may be in an unrendered row — resolve its index and use `virtualizer.scrollToIndex()` before attempting to scroll the DOM node. Naive `scrollIntoView` on an unmounted node silently does nothing; this is the trap in this task.

**T-22.6 — Seek on match navigation** (optional toggle, default on): moving to a match also seeks the player to that segment, so search doubles as navigation.

**T-22.7 — Match density map.** Thin accent ticks along the transcript scrollbar showing where matches are — a small, high-impact detail.

**T-22.8 — Zero-match state.** Counter shows `0 of 0` in muted text, the input border tints `--ff-warning`, and a hint offers `Search all meetings for "x" →` linking to `/search?q=x`.

**T-22.9 — Search within speaker filter.** A dropdown next to the find bar restricting matches to one speaker. Cheap to build on top of the same matcher, and it echoes Fireflies' "Smart Search" filters.

**T-22.10 — Smart Search flyout** (icon rail item): preset filters `Questions` (segments ending in `?`), `Tasks` (segments containing action-verb patterns), `Metrics` (segments containing numbers/currency/percentages), `Dates`. Each shows a count and lists matching segments; clicking one seeks. This is a genuine Fireflies feature and it is mostly regex.

**T-22.11 — Persist the query in the URL** as `?find=` so a search view is shareable.

**T-22.12 — `data-testid`s:** `transcript-find`, `transcript-find-input`, `transcript-find-count`, `transcript-find-next`, `transcript-find-prev`, `transcript-match-<i>`, `smart-search-panel`, `smart-search-preset-<name>`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T22-A | PW-22-01 | `⌘F` | Find bar opens and is focused; browser find does not appear |
| T22-B | PW-22-02 | Search a word present 11 times | Counter `1 of 11`; 11 `<mark>` elements exist across loaded rows |
| T22-C | PW-22-03 | Press Enter | Counter `2 of 11`; the active mark uses `--ff-highlight-active`; exactly one active |
| T22-D | PW-22-04 | Enter to the last match, then Enter again | Wraps to `1 of 11` |
| T22-E | PW-22-05 | Shift+Enter from `1 of 11` | Wraps to `11 of 11` |
| T22-F | PW-22-06 | Navigate to a match far down the transcript | Row is scrolled into view and actually rendered |
| T22-G | PW-22-07 | Search `zzzz` | `0 of 0`, warning border, cross-meeting-search hint |
| T22-H | PW-22-08 | Search `a.*b` | Treated literally; zero or literal matches; no crash |
| T22-I | PW-22-09 | Search a 1-char term | Debounced; no freeze; ≤1 recompute per 200ms |
| T22-J | PW-22-10 | Escape | Bar closes; all marks removed; `?find` cleared |
| T22-K | PW-22-11 | Search + speaker filter = Marcus | Only Marcus's segments match; counter reflects it |
| T22-L | PW-22-12 | Smart Search → `Questions` | Only `?`-ending segments listed; clicking one seeks the player |
| T22-M | PW-22-13 | Match navigation with seek enabled | Player time equals the matched segment's start |
| T22-N | PW-22-14 | Load `?find=pricing` | Bar open, pre-populated, first match active |

**✅ Should look like:** a compact find bar with `3 of 11`, yellow highlights everywhere, one stronger amber highlight scrolled into view.
**❌ Should NOT look like:** the browser's native find bar; highlights only in visible rows; a counter that doesn't update while navigating; the page freezing on a one-character query; regex characters crashing the app.

---

## T-23 · AI Summary panel

**Branch:** `feat/T-23-summary` · **Est:** 75 min
Reproduce Fireflies' five canonical sections **verbatim and in order**.

### Panel specification

```
┌ Summary header (sticky) ───────────────────────────────────┐
│ [General Summary ▾]              [📋 Copy] [⟳ Regenerate] [⋯]│
├────────────────────────────────────────────────────────────┤
│ KEYWORDS                                        (label)     │
│ [pricing] [Q3 roadmap] [churn] [API limits] [hiring] [SLA]  │
│                                                             │
│ MEETING OVERVIEW                                            │
│ The team reviewed Q3 progress, focusing on the pricing…     │
│                                                             │
│ MEETING OUTLINE                                             │
│ 00:00  Introductions and agenda                             │
│ 04:32  Q3 pricing model discussion                          │
│ 18:15  API rate-limit incident review                       │
│                                                             │
│ BULLET-POINT NOTES                                          │
│ Q3 pricing model discussion                                 │
│  • Enterprise tier moves to usage-based billing             │
│  • Legacy customers grandfathered for two quarters          │
│                                                             │
│ ACTION ITEMS                              (see T-24)        │
└────────────────────────────────────────────────────────────┘
```

Section labels: `--ff-text-label`, `--ff-text-muted`, `24px` top margin, `12px` bottom.

### Subtasks

**T-23.1 — Section shell component** `<SummarySection label icon collapsible defaultOpen>` used five times. Each is independently collapsible with state persisted per meeting.

**T-23.2 — Keywords.** Static `Chip`s, `surface-2` bg, `text-secondary`. Clicking a keyword runs a transcript search for it (opens the find bar pre-filled) — connects two features for free. Max 6, matching Fireflies.

**T-23.3 — Meeting Overview.** One paragraph, `--ff-text-body` at `--ff-text-secondary`, `max-width: 68ch` for readability. Clamped to 6 lines with `Show more` when longer.

**T-23.4 — Meeting Outline.** A list of `MM:SS` + title rows. The timestamp is an accent monospace-numeral button; the row highlights on hover; clicking seeks the player and scrolls the transcript (T-21.6). **The currently-playing chapter is highlighted** in the outline as playback progresses — a strong, visible link between panels.

**T-23.5 — Bullet-Point Notes.** Grouped under their outline chapter with the chapter as a `--ff-text-body-strong` sub-heading, then a `•` list at `--ff-text-body` / `--ff-text-secondary`, `8px` between items. Support one nesting level.

**T-23.6 — Summary template dropdown** (`General Summary ▾`): `General Summary` (active), `Sales Call`, `Interview`, `Standup`, `Custom…` — the latter four marked `Soon` and firing the coming-soon toast. Present in the UI because Fireflies has it; honest about scope.

**T-23.7 — Copy button.** Copies the whole summary as clean Markdown (`## Meeting Overview\n…`), toasts `Summary copied`. Include an option in the kebab to copy as plain text.

**T-23.8 — Regenerate.** Calls `POST /summary/regenerate`. During the call the panel shows a shimmer over the section bodies (not a full-panel spinner — keep the labels visible for stability), and the button shows a spinning icon and is disabled. On success: replace content, toast `Summary regenerated`.

**T-23.9 — Stale badge.** When `is_stale` (i.e. the transcript was edited), show an amber `Outdated` badge next to the header with a tooltip `Transcript changed since this summary was generated` and a `Regenerate` inline link.

**T-23.10 — `AI generated` attribution row** at the bottom: a small sparkle icon + `Generated by <provider> · <relative time>` in `--ff-text-xs` muted. Honest, and it looks like a real product.

**T-23.11 — Loading & error.** Section-level skeletons matching final geometry; an error state confined to the summary panel with `Try again`, leaving the transcript untouched.

**T-23.12 — Empty summary state.** `No summary yet` + `Generate summary` primary button (for meetings created by manual form entry).

**T-23.13 — `Index` flyout** (icon rail): a compact table of contents listing the five sections plus each outline chapter; clicking scrolls the summary panel to that section. Mirrors Fireflies' Index feature.

**T-23.14 — `data-testid`s:** `summary-panel`, `summary-section-keywords|overview|outline|notes|actions`, `summary-keyword-<i>`, `summary-outline-item-<i>`, `summary-regenerate`, `summary-copy`, `summary-template-select`, `summary-stale-badge`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T23-A | PW-23-01 | Open the hero meeting | All five sections present, **in the canonical order**, with the exact labels |
| T23-B | PW-23-02 | Keywords | Exactly 6 chips, all non-empty |
| T23-C | PW-23-03 | Click a keyword | Find bar opens pre-filled with that term; matches highlighted |
| T23-D | PW-23-04 | Outline | ≥4 entries; every timestamp matches `/^\d{1,2}:\d{2}$/` |
| T23-E | PW-23-05 | Click an outline timestamp | Player seeks there; transcript scrolls; that segment active |
| T23-F | PW-23-06 | Play past a chapter boundary | The outline's active chapter highlight moves |
| T23-G | PW-23-07 | Bullet notes | Grouped under chapter sub-headings, not a flat list |
| T23-H | PW-23-08 | Click `Copy` | Clipboard contains Markdown with all five section headings |
| T23-I | PW-23-09 | Click `Regenerate` | Skeletons appear; content updates; toast; button re-enabled |
| T23-J | PW-23-10 | Regenerate with the API forced to 500 | Panel error + Retry; **transcript panel unaffected** |
| T23-K | PW-23-11 | Edit a transcript segment | `Outdated` badge appears on the summary |
| T23-L | PW-23-12 | Regenerate after that | Badge clears |
| T23-M | PW-23-13 | Collapse `Bullet-Point Notes`, reload | Still collapsed |
| T23-N | PW-23-14 | Template dropdown → `Sales Call` | Coming-soon toast; template unchanged |
| T23-O | PW-23-15 | Meeting with no summary | Empty state with `Generate summary` |
| T23-P | PW-23-16 | Visual | `summary-panel.png` |

**✅ Should look like:** five clearly labelled sections in Fireflies' exact order, keyword pills, clickable accent timestamps, chapter-grouped bullets, a discreet AI attribution line.
**❌ Should NOT look like:** one giant "Summary" text blob; sections in a different order or renamed ("TL;DR", "Highlights"); outline timestamps as plain non-clickable text; a full-panel spinner on regenerate; no indication the summary is AI-generated.

---

## T-24 · Action items

**Branch:** `feat/T-24-action-items` · **Est:** 60 min

### Item specification

```
┌────────────────────────────────────────────────────────────┐
│ ☐  Send the updated pricing deck to Northwind              │
│    [MP] Marcus Patel   ·   Due Jul 30   ·   ⏱ 18:42   [⋯]  │
└────────────────────────────────────────────────────────────┘
open:      text text-primary
completed: text text-muted + line-through, row bg success-subtle, checkbox success
overdue:   due date rendered as a danger Badge
due today: due date rendered as a warning Badge
```

Grouped by assignee with an avatar + name sub-heading, matching Fireflies. Unassigned items group last under `Unassigned`.

### Subtasks

**T-24.1 — `GET /action-items`** grouped and ordered: open before completed, then by due date (nulls last), then by `start_ms`.

**T-24.2 — List rendering** with assignee grouping, a per-group count, and a header row `Action Items` + `3 of 7 completed` + an `+ Add` ghost button.

**T-24.3 — Toggle complete.** Optimistic: strikethrough + row tint applied instantly; PATCH in the background; rollback + error toast on failure. A completion animation (checkbox scale 1 → 1.15 → 1 over 200ms) sells the interaction.

**T-24.4 — Progress bar** under the section header showing `completed / total`, in `--ff-success`, animating on change.

**T-24.5 — Add item.** `+ Add` reveals an inline composer (not a modal) with a text input, an assignee select (participants only), and a due-date picker. `Enter` saves and keeps the composer open for rapid entry; `Escape` closes.

**T-24.6 — Inline edit.** Click the text → editable in place with identical typography. `Enter` saves, `Escape` reverts. Assignee and due date are editable via their own inline controls.

**T-24.7 — Delete** via the row kebab, with an `Undo` toast rather than a confirm dialog (the item is cheap to restore, and a modal for a one-line item is heavy-handed).

**T-24.8 — Timestamp link.** Items carrying `start_ms` show a `⏱ 18:42` chip that seeks the player — traceability from a task back to the moment it was said. A standout detail.

**T-24.9 — Due-date badges.** Overdue → danger with the relative text (`2 days overdue`); today → warning `Due today`; future → muted `Due Jul 30`; none → nothing rendered (not the string "No due date").

**T-24.10 — Filter/sort controls** in the section header: `All / Open / Completed` segmented control, and sort by `Due date / Assignee / Timeline`.

**T-24.11 — Keyboard.** `↑`/`↓` move between items, `Space` toggles complete, `E` edits, `Delete` deletes with undo.

**T-24.12 — Notebook + drawer sync.** Toggling an item anywhere must invalidate the meetings list query so the row's `N open` badge updates. Verify explicitly — cross-view cache invalidation is exactly the kind of thing an interviewer probes.

**T-24.13 — Empty state:** `No action items` + `Add one manually or regenerate the summary`.

**T-24.14 — `data-testid`s:** `action-items-section`, `action-item-<id>`, `action-item-checkbox-<id>`, `action-item-text-<id>`, `action-item-assignee-<id>`, `action-item-due-<id>`, `action-item-timestamp-<id>`, `action-item-add`, `action-item-composer`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T24-A | PW-24-01 | Open the QBR meeting | 7 items, grouped by assignee, open before completed |
| T24-B | PW-24-02 | Check an item | Strikethrough + tint **instantly** (<100ms, before the network settles) |
| T24-C | PW-24-03 | Reload | Still completed |
| T24-D | PW-24-04 | Force PATCH to 500, check an item | Reverts to unchecked, error toast |
| T24-E | PW-24-05 | Check an item | Progress bar and `N of M completed` both update |
| T24-F | PW-24-06 | Add an item with assignee + due date | Appears in the right group instantly; persists after reload |
| T24-G | PW-24-07 | Add with empty text | Save blocked, inline validation, no request |
| T24-H | PW-24-08 | Inline-edit text, Enter | Updated and persisted |
| T24-I | PW-24-09 | Inline-edit, Escape | Reverted, no PATCH |
| T24-J | PW-24-10 | Delete → Undo | Item returns in its original position |
| T24-K | PW-24-11 | The seeded overdue item | Danger badge with relative overdue text |
| T24-L | PW-24-12 | The seeded due-today item | Warning `Due today` |
| T24-M | PW-24-13 | Item with no due date | No due element at all |
| T24-N | PW-24-14 | Click an item's `⏱` chip | Player seeks to that timestamp |
| T24-O | PW-24-15 | Toggle an item, navigate to `/notebook` | That row's `N open` badge is decremented |
| T24-P | PW-24-16 | Filter `Completed` | Only completed shown; count unchanged |
| T24-Q | PW-24-17 | Meeting with zero items | Empty state with the add hint |

**✅ Should look like:** assignee-grouped checkable rows, muted strikethrough when done, coloured due badges, a timestamp chip that jumps to the moment.
**❌ Should NOT look like:** a flat undifferentiated list; a full page reload on toggle; a checkbox that waits for the server before showing a tick; overdue and future dates styled identically; a modal to add a one-line task.

---

## T-25 · Transcript editing & speaker management

**Branch:** `feat/T-25-transcript-edit` · **Est:** 45 min

### Subtasks

**T-25.1 — Edit-mode toggle** in the transcript panel header (`✏ Edit`). In edit mode: segments gain a subtle dashed border on hover, the mode indicator reads `Editing — changes save automatically`, and playback keeps working.

**T-25.2 — Inline segment editing.** Click a segment's text → `contentEditable`/textarea in place, preserving typography and wrapping so nothing reflows. Auto-grows with content.

**T-25.3 — Debounced autosave** (800ms after the last keystroke) PATCHing the segment. Status indicator cycles `Saving…` → `Saved` → fades. Explicit `Ctrl/⌘+S` forces an immediate save.

**T-25.4 — `Edited` badge** on modified segments, with a tooltip showing the edit time. Hovering offers `Revert to original` (store the original text in the DB on first edit).

**T-25.5 — Undo/redo stack** (`⌘Z` / `⌘⇧Z`) scoped to the edit session, depth 50, operating on segment-level snapshots.

**T-25.6 — Speaker reassignment.** A segment's `⋯` → `Reassign speaker` → a dropdown of the meeting's speakers plus `+ New speaker`. PATCHes `speaker_id`; the avatar, name, and colour update immediately, and speaker grouping recalculates.

**T-25.7 — Global speaker rename.** Clicking a speaker's name in edit mode opens a small popover: rename (applies to all their segments), link to a participant, and a preview of the affected count (`Renaming will update 84 segments`).

**T-25.8 — Speaker legend** at the top of the transcript panel: coloured dots + names + talk-time percentages. Clicking one filters the transcript to that speaker; clicking again clears. Doubles as the reassignment surface.

**T-25.9 — Mark the summary stale** on any transcript edit (T-23.9), with an inline prompt offering `Regenerate summary`.

**T-25.10 — Conflict/validation guards.** Empty segment text is rejected (revert + inline error). Very long text (>5,000 chars) is rejected with a message. Trim whitespace on save.

**T-25.11 — Exit edit mode** confirms if a save is in flight, and warns on page unload with unsaved changes (`beforeunload`).

**T-25.12 — `data-testid`s:** `transcript-edit-toggle`, `transcript-edit-status`, `segment-editor-<id>`, `speaker-legend`, `speaker-legend-<id>`, `speaker-rename-popover`, `segment-reassign-menu`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T25-A | PW-25-01 | Toggle edit mode | Indicator shown; segments become editable |
| T25-B | PW-25-02 | Edit text, wait 1s | `Saved` shown; reload confirms persistence |
| T25-C | PW-25-03 | Edit and immediately navigate away | Save completes or a warning appears — no silent data loss |
| T25-D | PW-25-04 | Edited segment | `Edited` badge present |
| T25-E | PW-25-05 | Revert to original | Original text restored, badge cleared |
| T25-F | PW-25-06 | `⌘Z` after an edit | Reverts the last change |
| T25-G | PW-25-07 | Clear a segment and blur | Rejected, inline error, original retained |
| T25-H | PW-25-08 | Reassign a segment to another speaker | Avatar, name and colour change; grouping recalculates |
| T25-I | PW-25-09 | Rename `Speaker 2` → `Priya Raman` | All that speaker's segments update; legend updates |
| T25-J | PW-25-10 | Rename popover | Shows the correct affected-segment count |
| T25-K | PW-25-11 | Click a legend entry | Transcript filters to that speaker; count shown; click again clears |
| T25-L | PW-25-12 | Any edit | Summary shows `Outdated` |
| T25-M | PW-25-13 | Search after an edit | Server-side search finds the **new** text (FTS updated) |
| T25-N | PW-25-14 | Edit mode + play | Playback and sync still work |

**✅ Should look like:** in-place editing with a quiet autosave indicator, an `Edited` badge, and a speaker legend with talk-time percentages.
**❌ Should NOT look like:** an "Edit transcript" modal containing one giant textarea of the whole conversation; a manual Save button as the only way to persist; renaming a speaker on one line only; edits that leave search results stale.

---

# PHASE 4 · MEETING MANAGEMENT & AI LAYER

---

## T-26 · Create meeting — upload, paste, manual

**Branch:** `feat/T-26-create` · **Est:** 75 min

### Subtasks

**T-26.1 — Create modal with three tabs:** `Upload file` · `Paste transcript` · `Create manually`. Modal size `lg` (720px). Opens from `+ New` in the topbar, the `/upload` route, and both empty states.

**T-26.2 — Dropzone.** Dashed `2px --ff-border-strong` border, radius `lg`, 200px tall, upload icon, `Drag and drop a transcript file` + `or browse` link + `Supports .txt, .vtt, .srt, .json · max 10 MB`. Drag-over state: accent border + `accent-subtle` bg. Also accepts paste-from-clipboard of a file.

**T-26.3 — `.vtt` parser.** WEBVTT header, cue timings `00:00:14.500 --> 00:00:18.200`, optional cue identifiers, and speaker extraction from both `<v Sarah Chen>` voice tags and the `Sarah Chen: text` convention.

**T-26.4 — `.srt` parser.** Numbered blocks, `,` millisecond separator, blank-line delimited.

**T-26.5 — `.txt` parser** with several heuristics, tried in order: `[00:14] Speaker: text`, `00:14 Speaker: text`, `Speaker: text` (no timestamps → synthesise timings at 150 wpm), and plain paragraphs (single `Speaker 1`). Report which heuristic matched in the preview.

**T-26.6 — `.json` parser** accepting a documented schema (`{title?, participants?, segments:[{speaker, start_ms, end_ms, text}]}`) plus tolerance for `start`/`end` in seconds. Document the schema in the README and provide a sample file in `docs/`.

**T-26.7 — Preview step.** After parsing, before saving: show detected title, detected speakers (with editable names), segment count, computed duration, and the first 5 segments rendered exactly as they will appear. Requires explicit `Create meeting` confirmation. This step is what makes upload feel trustworthy.

**T-26.8 — Metadata form** on every tab: title (required, prefilled from filename/first line), date-time (default now, editable), participants (a token input with autocomplete over existing users plus free entry), language select, channel select, tags.

**T-26.9 — Paste tab.** A large monospace textarea with a live parse preview updating on a 500ms debounce, a format hint panel with examples, and a `Load sample` link that fills it with a demo transcript. The `Load sample` link makes the feature demoable in 3 seconds.

**T-26.10 — Manual tab.** Metadata only, no transcript. Creates a meeting with an empty transcript and the "generate summary" empty states from T-23.12.

**T-26.11 — Upload progress + AI step.** Progress bar during upload, then a `Generating summary…` step with a shimmer, then redirect to `/meeting/{id}` with a `Meeting created` toast. Backend does this synchronously with the mock provider; if using a real LLM, set `processing_status='processing'` and poll.

**T-26.12 — Validation and errors,** each with specific copy: wrong extension, >10 MB, empty file, unparseable content (`We couldn't find any transcript lines. Check the format examples below.`), zero segments, duplicate title (warn, allow).

**T-26.13 — Server-side validation mirrors the client.** Never trust the client: re-check extension, size, MIME sniff, and segment count. Cap segments at 10,000.

**T-26.14 — `data-testid`s:** `create-modal`, `create-tab-<upload|paste|manual>`, `create-dropzone`, `create-file-input`, `create-preview`, `create-preview-segment-<i>`, `create-title`, `create-participants`, `create-submit`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T26-A | PW-26-01 | Upload a valid `.vtt` | Preview shows correct speakers/count; create → redirect to the new meeting with a full transcript |
| T26-B | PW-26-02 | Upload `.srt` | Same, timings parsed with `,` separators |
| T26-C | PW-26-03 | Upload `.txt` with `[00:14] Name:` | Timestamps honoured, not synthesised |
| T26-D | PW-26-04 | Upload `.txt` with no timestamps | Timings synthesised, strictly increasing, plausible duration |
| T26-E | PW-26-05 | Upload valid `.json` | All segments and speakers imported |
| T26-F | PW-26-06 | Upload a `.pdf` | Rejected client-side with the exact format message; no request sent |
| T26-G | PW-26-07 | Upload an 11 MB file | Rejected with the size message |
| T26-H | PW-26-08 | Upload a valid-extension file of gibberish | Parse error with the format-help panel; modal stays open |
| T26-I | PW-26-09 | Drag a file over the dropzone | Accent border + tinted bg |
| T26-J | PW-26-10 | Paste tab → `Load sample` → create | Meeting created successfully |
| T26-K | PW-26-11 | Paste tab, type as you go | Live preview updates ≤1 time per 500ms |
| T26-L | PW-26-12 | Submit with an empty title | Blocked, field-level error, no request |
| T26-M | PW-26-13 | Rename a detected speaker in the preview | New meeting uses the renamed speaker throughout |
| T26-N | PW-26-14 | Manual tab → create | Meeting exists with empty-transcript and no-summary states |
| T26-O | PW-26-15 | After creation | Notebook count incremented; new meeting is first (most recent sort) |
| T26-P | PW-26-16 | POST a `.exe` renamed to `.txt` directly to the API | Rejected server-side |

**✅ Should look like:** a three-tab modal with a real dropzone and a trustworthy parse preview before anything is written.
**❌ Should NOT look like:** a single "paste JSON here" textarea; silent acceptance of an unparsed file producing an empty meeting; no preview; client-only validation; a create flow that leaves you on the notebook with no feedback.

---

## T-27 · Edit meeting metadata

**Branch:** `feat/T-27-edit` · **Est:** 30 min

### Subtasks

**T-27.1 — `Edit details` modal** (size `md`) reachable from the notebook kebab, the details drawer, and the notepad kebab.

**T-27.2 — Fields:** title (required, max 200, live char counter past 180), description (textarea, optional), date & time, duration (read-only, derived — with a tooltip explaining why), language, visibility, channel, tags.

**T-27.3 — Participants editor.** Token input: existing tokens removable with `✕`, autocomplete over known users, free-text creates a new participant, each token shows an avatar. Removing a participant who is a mapped **speaker** warns rather than silently unlinking.

**T-27.4 — Host selector** limited to current participants; changing the host reassigns the `host_id`.

**T-27.5 — Dirty-state tracking.** `Save` disabled until something changes; closing with unsaved changes triggers a confirm (`Discard changes?`).

**T-27.6 — Partial PATCH.** Send only changed fields. Verify in a test that an unchanged description is not in the payload.

**T-27.7 — Optimistic update** across the notebook row, the drawer, and the notepad header simultaneously — all three read from the same query cache, so this should be free if T-06.5 was done properly. Test it.

**T-27.8 — Inline rename shortcut** — `Rename` in any kebab opens a minimal single-field prompt rather than the full modal.

**T-27.9 — Validation:** empty title, title > 200 chars, a date in the future (warn only — a scheduled meeting is legitimate), duplicate participant names within one meeting (block).

**T-27.10 — Error recovery.** On PATCH failure, revert every optimistic surface, keep the modal open with the user's input intact, and show an error toast with `Retry`.

**T-27.11 — `data-testid`s:** `edit-modal`, `edit-title`, `edit-description`, `edit-participants`, `edit-participant-token-<i>`, `edit-host`, `edit-tags`, `edit-save`, `edit-cancel`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T27-A | PW-27-01 | Change the title, save | Updated in modal, row, header, and tab title |
| T27-B | PW-27-02 | Open the modal, change nothing | `Save` disabled |
| T27-C | PW-27-03 | Change a field, close via `✕` | `Discard changes?` confirm appears |
| T27-D | PW-27-04 | Add a participant | Appears in the row's avatar group and the drawer |
| T27-E | PW-27-05 | Remove a participant who is a speaker | Warning shown before removal |
| T27-F | PW-27-06 | Add a duplicate participant name | Blocked with inline validation |
| T27-G | PW-27-07 | Clear the title, save | Blocked, field error |
| T27-H | PW-27-08 | 250-char title | Blocked at 200 with a counter |
| T27-I | PW-27-09 | Save with only the title changed | PATCH body contains **only** `title` |
| T27-J | PW-27-10 | Force PATCH 500 | All surfaces revert; modal open; input preserved; retry toast |
| T27-K | PW-27-11 | Change tags | Reflected in the row's tag chips and in tag filtering |

**✅ Should look like:** a focused modal that updates every view at once and refuses to save nothing.
**❌ Should NOT look like:** an edit form that requires re-entering every field; participants as a raw comma-separated text input; a page reload after saving; the notebook still showing the old title until refresh.

---

## T-28 · Delete meeting

**Branch:** `feat/T-28-delete` · **Est:** 20 min

### Subtasks

**T-28.1 — Entry points:** notebook kebab, details drawer, notepad kebab, bulk bar.

**T-28.2 — `ConfirmDialog`** with a danger icon, title `Delete meeting?`, body `"<Title>" and its transcript, summary, and action items will be deleted.` — with the title **bolded** so the user can see what they're deleting.

**T-28.3 — Buttons:** `Cancel` (secondary, autofocused) + `Delete` (danger). Autofocusing Cancel on a destructive dialog is a deliberate safety choice — mention it in `decisions.md`.

**T-28.4 — Loading state** on the Delete button; the dialog cannot be dismissed mid-request; double-clicks fire exactly one DELETE.

**T-28.5 — Soft delete + `Undo` toast** for 6 seconds calling `/restore`.

**T-28.6 — Post-delete navigation.** From the notepad → redirect to `/notebook`. From the notebook → the row animates out (height + opacity, 200ms) rather than vanishing.

**T-28.7 — Cache invalidation** of the list, facets, and any channel counts.

**T-28.8 — Deleting the currently-open meeting from another surface** (e.g. the drawer) redirects correctly rather than leaving a dead detail page.

**T-28.9 — Keyboard:** `Escape` cancels; `Enter` activates the focused button (which is Cancel, not Delete).

**T-28.10 — Error path:** on failure, the row returns, an error toast with `Retry` is shown, and the dialog stays open.

**T-28.11 — `data-testid`s:** `delete-dialog`, `delete-confirm`, `delete-cancel`, `toast-undo-delete`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T28-A | PW-28-01 | Kebab → Delete | Dialog with the exact title in bold |
| T28-B | PW-28-02 | Cancel | Nothing deleted, dialog closed |
| T28-C | PW-28-03 | Escape | Same as Cancel |
| T28-D | PW-28-04 | Confirm | Row animates out; count decrements; toast with Undo |
| T28-E | PW-28-05 | Undo | Meeting restored in its original position; `Meeting restored` toast |
| T28-F | PW-28-06 | Let the undo window lapse, reload | Meeting still gone |
| T28-G | PW-28-07 | Delete from the notepad | Redirects to `/notebook`; meeting absent |
| T28-H | PW-28-08 | Double-click Delete | Exactly one DELETE request |
| T28-I | PW-28-09 | Force DELETE 500 | Row returns; error toast with Retry |
| T28-J | PW-28-10 | Deleted meeting's URL visited directly | Branded 410/404 page |
| T28-K | PW-28-11 | Dialog opens | Focus is on **Cancel** |

**✅ Should look like:** an explicit, named confirmation, then a soft removal with a 6-second escape hatch.
**❌ Should NOT look like:** `window.confirm()`; deletion with no confirmation; the Delete button autofocused; a deleted row lingering until refresh; no way to undo.

---

## T-29 · AI provider abstraction

**Branch:** `feat/T-29-ai` · **Est:** 60 min
The assignment allows mocked summaries. Building a *provider interface* rather than hardcoding either path is what turns this from "mocked" into "architected", and it's a direct answer to the interview question "how would you plug in a real model?"

### Subtasks

**T-29.1 — Define the interface** (`app/ai/provider.py`), an ABC with:
`generate_summary(transcript) -> SummaryResult` · `extract_action_items(transcript) -> list[ActionItem]` · `extract_keywords(transcript) -> list[Keyword]` · `generate_outline(transcript) -> list[OutlineEntry]` · `answer_question(transcript, question, history) -> Answer`.

**T-29.2 — `MockProvider`** — deterministic and genuinely useful, not `return "Lorem ipsum"`:
- **Keywords:** TF-IDF over segment text against a stop-word list, top 6.
- **Outline:** segment-embedding-free topic segmentation — split on long pauses and speaker-turn density, title each chunk from its top terms.
- **Overview:** extractive — TextRank-style sentence ranking, top 4 sentences stitched together.
- **Action items:** regex/keyword patterns (`I'll`, `can you`, `we need to`, `let's`, `by Friday`, `action item`), with assignee inferred from the speaker or a named entity, and due dates from date expressions.
- **Answer:** retrieve the top-k relevant segments by term overlap and return them with timestamps.

Deterministic given the same input — which is what makes it testable *and* safe for visual regression.

**T-29.3 — `LLMProvider`** for OpenAI/Anthropic behind `AI_PROVIDER` + `AI_API_KEY`, using structured output (JSON schema / tool use) so parsing is not regex-on-prose.

**T-29.4 — Prompts as versioned files** in `app/ai/prompts/*.md`, loaded at runtime, each with a version header. Never inline a 40-line prompt in a function body.

**T-29.5 — Chunking for long transcripts.** Map-reduce: chunk to ~3,000 tokens with overlap, summarise each, then synthesise. Document the strategy in the README even if the mock path doesn't need it — it's the question you'll be asked.

**T-29.6 — Provider factory + DI.** `get_ai_provider()` as a FastAPI dependency, so tests inject a stub with one line.

**T-29.7 — Graceful degradation.** LLM failure (timeout, rate limit, bad key) → log, fall back to `MockProvider`, and mark the summary `provider='mock (llm fallback)'` so the UI can be honest about it. The demo must never hard-fail because of an API key.

**T-29.8 — Timeouts, retries, cost guards.** 30s timeout, 2 retries with exponential backoff, a token-count pre-check that refuses absurd inputs, and a per-meeting generation counter.

**T-29.9 — Store provenance.** `summaries.provider` and `summaries.model` persisted and surfaced in the T-23.10 attribution line.

**T-29.10 — Response caching.** Key on `hash(transcript_text + prompt_version)`; identical input never re-bills. Also makes the demo instant on repeat.

**T-29.11 — `AI_PROVIDER=mock` is the default** in `.env.example` and in the deployed demo. Document that switching to a real LLM is a one-variable change.

**T-29.12 — pytest for the mock provider** asserting determinism, non-empty outputs, plausible action-item extraction on a fixture transcript containing 3 known commitments, and outline timestamps that land on real segments.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T29-A | pytest | `MockProvider.generate_summary` ×5 on one input | Byte-identical results |
| T29-B | pytest | Fixture transcript with 3 explicit commitments | ≥2 extracted as action items |
| T29-C | pytest | Keyword extraction | Exactly 6, no stop words, all present in the transcript |
| T29-D | pytest | Outline | ≥3 entries; every `start_ms` inside a real segment; strictly increasing |
| T29-E | pytest | Overview | 2–6 sentences, non-empty, no placeholder text |
| T29-F | pytest | `LLMProvider` with an invalid key | Falls back to mock; provider recorded as fallback; **no 500** |
| T29-G | pytest | Same transcript regenerated twice | Second call served from cache (assert no provider invocation) |
| T29-H | pytest | Empty transcript | Returns an empty-but-valid summary, no exception |
| T29-I | pytest | 10,000-segment transcript | Completes; chunking path exercised |
| T29-J | PW-29-01 | Regenerate in the UI with the mock provider | Summary changes are visible and coherent |

**✅ Should look like:** one interface, two implementations, a factory, versioned prompts, and honest provenance in the UI.
**❌ Should NOT look like:** `if provider == "openai": ... else: return "This meeting was about stuff."`; an API key committed to the repo; a demo that 500s when the LLM is unreachable; prompts inlined as f-strings in a route handler.

---

## T-30 · Placeholder / "Coming Soon" surfaces

**Branch:** `feat/T-30-placeholders` · **Est:** 30 min
The assignment explicitly permits placeholders. Making them *branded and deliberate* rather than blank is nearly free marks — it shows you understood the product's full surface area and scoped honestly.

### Subtasks

**T-30.1 — `ComingSoon` component:** line-art icon in an `accent-subtle` circle, `H2` feature name, a 1–2 sentence description of what the real feature does, an `In the real Fireflies` explainer box, and a `Back to meetings` secondary button.

**T-30.2 — `/apps` — AI Skills.** Show a grid of 6 disabled skill cards (`Sales Call Analysis`, `Interview Scorecard`, `Meeting Prep Brief`, `Topic Tracker`, `Daily Digest`, `Custom Skill`) each with an icon, name, description, and a `Soon` badge. Far better than an empty page.

**T-30.3 — `/integrations`.** A grid of greyscale logos you draw yourself or use simple lettermarks for: Zoom, Google Meet, Teams, Slack, Notion, HubSpot, Salesforce, Google Calendar — each with a disabled `Connect` button. **Do not ship third-party trademarked logo files.**

**T-30.4 — `/team`.** A mock members table (from seeded users) with `Invite` and `Manage roles` disabled, plus a `Sharing & permissions` explainer.

**T-30.5 — `/analytics`.** Static, clearly-labelled `Sample data` charts: talk-time distribution, meetings per week, sentiment trend. Use real seeded aggregates where trivially possible (meetings per week genuinely is) and label anything fabricated.

**T-30.6 — Live-bot placeholder.** A `Capture live meeting` entry in `+ New` opening a modal with a meeting-link field and a disabled `Send Fireflies` button, explaining that the real-time bot is out of scope.

**T-30.7 — `/settings` shell with real tabs.** Left sub-nav mirroring Fireflies' settings groups. Make **two tabs genuinely functional**: `Appearance` (theme — wires to T-38) and `Preferences` (default sort, page size, autoplay, playback rate, date format). The rest render toggles that are visibly disabled with `Soon` badges. Two working tabs is what separates "placeholder" from "unfinished".

**T-30.8 — Auth placeholder.** A profile menu showing the seeded default user; `Sign out` fires the coming-soon toast. The README states clearly: *authentication is out of scope per the assignment; `get_current_user` is a DI dependency returning the seeded user and is the single swap point for real auth.*

**T-30.9 — Consistent copy.** One `COMING_SOON_COPY` constants file so every placeholder says the same kind of thing in the same voice.

**T-30.10 — All placeholder routes are reachable and never 404,** are indexed in the sidebar, and set a proper page title.

**T-30.11 — `data-testid`s:** `coming-soon-<feature>`, `settings-tab-<name>`, `settings-appearance`, `settings-preferences`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T30-A | PW-30-01 | Visit each of `/apps`, `/integrations`, `/team`, `/analytics` | Branded ComingSoon renders; no 404; correct page title |
| T30-B | PW-30-02 | `/apps` | 6 skill cards with `Soon` badges |
| T30-C | PW-30-03 | Click any disabled `Connect` | Coming-soon toast, no navigation, no error |
| T30-D | PW-30-04 | `/settings` | Sub-nav renders; `Appearance` and `Preferences` are interactive |
| T30-E | PW-30-05 | Change default sort in Preferences | Notebook opens with that sort next visit |
| T30-F | PW-30-06 | Click `Sign out` | Coming-soon toast; still signed in |
| T30-G | PW-30-07 | Analytics charts | Present and labelled `Sample data` where fabricated |
| T30-H | PW-30-08 | Every placeholder page | Has a `Back to meetings` action that works |

**✅ Should look like:** deliberately scoped surfaces that explain what would be there, in the app's own visual language.
**❌ Should NOT look like:** a blank white page; a 404; a browser `alert("coming soon")`; a settings page where literally nothing works; real Zoom/Salesforce logo files copied into the repo.

---

# PHASE 6 · BONUS FEATURES

> Build in the priority order given in Part B. Each of these is independently shippable — never leave one half-done at the deadline.

---

## T-31 · Comments & threads on transcript segments

**Branch:** `feat/T-31-comments` · **Est:** 60 min

### Subtasks

**T-31.1 — API:** `GET /meetings/{id}/comments` (threaded), `POST` (with optional `segment_id` and `start_ms`), `PATCH /comments/{id}`, `DELETE /comments/{id}` (soft). Replies via `parent_id`, one nesting level only.

**T-31.2 — Comment count gutter.** Segments with comments show a small `💬 2` chip in the right gutter, always visible (not hover-only) so threads are discoverable.

**T-31.3 — Composer.** Segment `⋯` → `Add comment`, or the selection toolbar (T-20.8). Opens an inline composer anchored below the segment: avatar + textarea + `Cancel`/`Comment`. `⌘Enter` submits.

**T-31.4 — `@mention` autocomplete** over meeting participants, rendered as an accent-tinted token in the saved comment. Mentions are parsed and stored as a `mentions[]` array, not just styled text.

**T-31.5 — Thread rendering** inline beneath the segment: avatar, name, relative time, body, and a `Reply` link. Replies indent `32px` with a `2px` left border.

**T-31.6 — Comments flyout** (icon rail): all comments for the meeting in timeline order, each showing its segment snippet and timestamp. Clicking one seeks the player and scrolls to the segment.

**T-31.7 — Edit & delete.** Own comments only (single-user build, but enforce the check server-side anyway). Edited comments show an `edited` marker. Deleting a parent with replies leaves a `Comment deleted` tombstone so the thread doesn't collapse.

**T-31.8 — Optimistic posting** with a pending opacity of 0.6, rolling back on failure.

**T-31.9 — Resolve/unresolve** a thread; resolved threads collapse to a one-line summary with a `Resolved` badge and are hidden behind a `Show resolved (3)` toggle.

**T-31.10 — Counts** surfaced on the notebook row and in the details drawer (`3 comments`).

**T-31.11 — Empty state** in the flyout: `No comments yet` + `Select transcript text to start a discussion`.

**T-31.12 — `data-testid`s:** `comment-gutter-<segmentId>`, `comment-composer`, `comment-submit`, `comment-<id>`, `comment-reply-<id>`, `comment-resolve-<id>`, `comments-flyout`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T31-A | PW-31-01 | Add a comment to a segment | Appears instantly under it; gutter chip shows `1`; persists after reload |
| T31-B | PW-31-02 | Reply | Indented under the parent; parent shows `1 reply` |
| T31-C | PW-31-03 | `@` in the composer | Autocomplete lists only meeting participants |
| T31-D | PW-31-04 | Post with a mention | Mention rendered as an accent token; stored in `mentions[]` |
| T31-E | PW-31-05 | Edit a comment | Updated with an `edited` marker |
| T31-F | PW-31-06 | Delete a parent with replies | Tombstone shown; replies preserved |
| T31-G | PW-31-07 | Force POST 500 | Optimistic comment removed; error toast; text preserved in the composer |
| T31-H | PW-31-08 | Comments flyout → click an entry | Seeks the player and scrolls to the segment |
| T31-I | PW-31-09 | Resolve a thread | Collapses with a `Resolved` badge; hidden until `Show resolved` |
| T31-J | PW-31-10 | Empty meeting | Flyout empty state with hint |
| T31-K | PW-31-11 | Post `<script>alert(1)</script>` | Rendered as literal text; no execution |

**✅ Should look like:** threaded, timestamped discussion attached to specific lines, discoverable via gutter chips.
**❌ Should NOT look like:** one flat comment box for the whole meeting; comments detached from segments; HTML injection working; a comment that disappears on refresh.

---

## T-32 · Highlights & bookmarks

**Branch:** `feat/T-32-highlights` · **Est:** 45 min

### Subtasks

**T-32.1 — API:** `POST/GET/PATCH/DELETE /meetings/{id}/highlights` storing `segment_id`, `start_offset`, `end_offset`, `color`, optional `note`.

**T-32.2 — Selection → highlight.** From the selection toolbar (T-20.8), `Highlight` applies the last-used colour instantly; a small colour swatch row lets the user pick another.

**T-32.3 — Four colours** — amber (default), green, blue, pink — each with a matching light background and a saturated underline, defined as tokens (`--ff-hl-amber` etc.).

**T-32.4 — Offset-accurate rendering.** Highlights are stored as character offsets and rendered by splitting the segment text — they must survive re-render, virtualisation, and coexist with search `<mark>`s **without nesting incorrectly**. Build a single `renderSegmentText(text, ranges[])` function that merges highlight ranges and search ranges into one non-overlapping span list. This is the hard part of the task; do it once, properly.

**T-32.5 — Highlight → note.** Clicking an existing highlight opens a popover to add/edit a note, change colour, or remove it.

**T-32.6 — Bookmarks** (distinct from highlights): a segment-level star toggled from the segment menu or by pressing `B` while a segment is focused. Bookmarked segments get a filled star in the gutter.

**T-32.7 — Bookmarks flyout** (icon rail): chronological list of bookmarked moments with timestamp, speaker, and a text snippet; click to seek.

**T-32.8 — Highlights flyout** grouped by colour, each entry showing the highlighted text, its note, and its timestamp.

**T-32.9 — Seekbar markers.** Bookmarks render as small star ticks on the player seekbar.

**T-32.10 — Export integration.** Highlights and bookmarks appear as a `Highlights` section in Markdown/PDF exports (T-34).

**T-32.11 — Edge cases:** highlighting across two segments (either split into two highlights or block it with a clear message — choose and document); highlighting a segment that is later edited (recompute or invalidate the highlight — do not render a garbled range).

**T-32.12 — `data-testid`s:** `highlight-<id>`, `highlight-toolbar`, `highlight-color-<name>`, `bookmark-toggle-<segmentId>`, `bookmarks-flyout`, `highlights-flyout`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T32-A | PW-32-01 | Select text → Highlight | Exactly the selected characters are highlighted; persists after reload |
| T32-B | PW-32-02 | Two highlights in one segment | Both render correctly, non-overlapping |
| T32-C | PW-32-03 | Highlight + active transcript search on the same segment | Both visible, no broken nesting, no lost characters |
| T32-D | PW-32-04 | Click a highlight | Popover with note/colour/remove |
| T32-E | PW-32-05 | Change colour | Updates immediately and persists |
| T32-F | PW-32-06 | Remove a highlight | Text returns to normal, no residual markup |
| T32-G | PW-32-07 | Bookmark a segment | Star filled; appears in the flyout; tick on the seekbar |
| T32-H | PW-32-08 | Click a flyout bookmark | Player seeks; transcript scrolls |
| T32-I | PW-32-09 | Highlight, then scroll far away and back (virtualisation) | Highlight still exactly correct |
| T32-J | PW-32-10 | Edit a highlighted segment's text | No garbled/overlapping render |
| T32-K | PW-32-11 | Export Markdown | Highlights section present with correct text |

**✅ Should look like:** precise character-level highlights that coexist with search marks, plus a stars-and-timestamps bookmark list.
**❌ Should NOT look like:** highlighting the whole segment when only part was selected; highlights lost on scroll; search highlighting destroying user highlights; nested broken `<mark><mark>` markup.

---

## T-33 · Soundbites

**Branch:** `feat/T-33-soundbites` · **Est:** 45 min

### Subtasks

**T-33.1 — API:** `POST/GET/DELETE /meetings/{id}/soundbites` with `title`, `start_ms`, `end_ms`, `auto_generated`.

**T-33.2 — Create from selection.** Selecting one or more segments → `Create soundbite` → a modal pre-filled with the selection's time range and the text as the suggested title.

**T-33.3 — Range trimmer** in the modal: a mini waveform of the clip region with draggable start/end handles, ±1s nudge buttons, a live `0:24` duration readout, and a `Preview` play button that loops just that range. Enforce 3s min / 3min max.

**T-33.4 — Soundbite card:** title, duration badge, speaker avatars in the clip, the transcript excerpt (3-line clamp), and a play button that plays only that range.

**T-33.5 — Soundbites flyout** (icon rail) listing all clips with an inline mini-player.

**T-33.6 — Range-constrained playback.** Playing a soundbite seeks to `start_ms` and auto-pauses at `end_ms` — implemented in `usePlayer` as an optional `playRange(start, end)`, not with a `setTimeout`. Test that seeking away mid-soundbite cleanly cancels the range constraint.

**T-33.7 — Seekbar overlay.** Soundbite regions render as translucent amber bands on the player seekbar.

**T-33.8 — Auto-generated soundbites** ("Magic Soundbites" in Fireflies): the mock AI provider proposes 3 clips per meeting from segments with the highest keyword density. These render with a `Auto` badge and a sparkle icon, and can be dismissed or saved.

**T-33.9 — Share/copy.** `Copy link` on a soundbite yields `/meeting/{id}?t=<start>&clip=<id>`, which on load opens the meeting with that soundbite selected and ready to play.

**T-33.10 — Download** (stretch): server-side ffmpeg trim to an mp3. If ffmpeg isn't available on the host, disable the button with a tooltip explaining why rather than shipping a broken download.

**T-33.11 — Empty state:** `No soundbites yet` + `Select transcript text to create your first clip`.

**T-33.12 — `data-testid`s:** `soundbite-<id>`, `soundbite-create`, `soundbite-modal`, `soundbite-trim-start`, `soundbite-trim-end`, `soundbite-preview`, `soundbites-flyout`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T33-A | PW-33-01 | Select 2 segments → Create soundbite | Modal pre-filled with the correct range and a suggested title |
| T33-B | PW-33-02 | Drag the end handle | Duration readout updates live |
| T33-C | PW-33-03 | Set range to 1s | Blocked with a min-length message |
| T33-D | PW-33-04 | Save | Card appears in the flyout; persists after reload |
| T33-E | PW-33-05 | Play a soundbite | Seeks to start; **auto-pauses at end** (±300ms) |
| T33-F | PW-33-06 | Seek elsewhere mid-soundbite | Range constraint cleared; normal playback resumes |
| T33-G | PW-33-07 | Seekbar | Amber band spanning exactly the clip range |
| T33-H | PW-33-08 | Auto soundbites | 3 proposed with `Auto` badges; dismissible |
| T33-I | PW-33-09 | Copy soundbite link → open it | Meeting opens with the clip selected at the right time |
| T33-J | PW-33-10 | Delete a soundbite | Removed from the list and the seekbar |
| T33-K | PW-33-11 | Meeting with none | Empty state with hint |

**✅ Should look like:** trimmable clip cards with a mini waveform, amber bands on the seekbar, and range-locked playback.
**❌ Should NOT look like:** a "soundbite" that just plays the whole meeting from a timestamp; a trimmer with no preview; auto-clips indistinguishable from user-made ones; a download button that produces a corrupt file.

---

## T-34 · Export (PDF / Markdown / TXT)

**Branch:** `feat/T-34-export` · **Est:** 45 min

### Subtasks

**T-34.1 — API:** `GET /meetings/{id}/export?format=pdf|md|txt|docx&include=summary,transcript,actions,comments,highlights` returning the right `Content-Type` and a `Content-Disposition` filename like `q3-roadmap-sync-2026-07-24.pdf`.

**T-34.2 — Export modal.** Format radio cards (each with an icon and a one-line description) + include-section checkboxes + a live preview of the estimated page/word count + an `Export` primary button.

**T-34.3 — Markdown generator.** `# Title`, a metadata block, then `## Meeting Overview`, `## Meeting Outline` (timestamps as `[04:32]`), `## Bullet-Point Notes`, `## Action Items` (as `- [ ]` / `- [x]` checkboxes), `## Transcript` (`**Speaker** [00:14]` + text). Must render correctly when pasted into Notion/GitHub — actually test this.

**T-34.4 — Plain-text generator.** Fixed-width-friendly, `====` underlines for headings, `[MM:SS] Speaker: text` transcript lines, hard-wrapped at 100 chars.

**T-34.5 — PDF generator** using WeasyPrint or ReportLab from an HTML template. Include: a branded header with the logo and meeting title, a metadata table, all selected sections, page numbers (`Page 2 of 7`), and a footer with the export date. Use the same type scale and accent colour as the app so it looks like the same product.

**T-34.6 — PDF page-break discipline.** `page-break-inside: avoid` on transcript turns and action items; section headings never orphaned at the bottom of a page. This is what separates a real PDF export from an HTML dump.

**T-34.7 — Streaming for large exports** (`StreamingResponse`) so a 1,200-segment PDF doesn't buffer entirely in memory.

**T-34.8 — Client-side download UX.** Loading state on the button, then a browser download, then a success toast. For slow exports, show progress; never leave the button spinning with no feedback.

**T-34.9 — Bulk export** from the bulk bar: selected meetings zipped, each as its own file.

**T-34.10 — Copy-to-clipboard alternatives** in the same modal: `Copy as Markdown`, `Copy summary only` — often what the user actually wants, and zero-cost once the generators exist.

**T-34.11 — Filename sanitisation** (strip path separators and unsafe characters, collapse whitespace, cap at 100 chars) and a test for a title containing `/`, `..`, and emoji.

**T-34.12 — `data-testid`s:** `export-modal`, `export-format-<fmt>`, `export-include-<section>`, `export-submit`, `export-copy-markdown`.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T34-A | pytest | `?format=md` | Valid Markdown with all selected headings; action items as `- [ ]`/`- [x]` |
| T34-B | pytest | `?format=txt` | Plain text, no markup, wrapped |
| T34-C | pytest | `?format=pdf` | Content-Type `application/pdf`; magic bytes `%PDF`; >1 page for the long meeting |
| T34-D | pytest | `?include=summary` only | Transcript absent from the output |
| T34-E | pytest | Title `Q3 / Roadmap ../etc` | Filename sanitised; no traversal |
| T34-F | pytest | Export a 1,200-segment meeting | Completes <5s; memory stable |
| T34-G | PW-34-01 | Export modal → Markdown → Export | File downloads; name matches the slug pattern |
| T34-H | PW-34-02 | Uncheck `Transcript` | Preview word count drops; exported file lacks it |
| T34-I | PW-34-03 | `Copy as Markdown` | Clipboard contains valid Markdown; toast shown |
| T34-J | PW-34-04 | Bulk export 3 meetings | A `.zip` with 3 files downloads |
| T34-K | Manual | Open the PDF | Branded header, page numbers, no mid-turn page breaks |

**✅ Should look like:** a branded, paginated PDF and clean Markdown that pastes perfectly into Notion.
**❌ Should NOT look like:** `window.print()`; a PDF that's a screenshot of the page; Markdown with raw HTML tags; a filename of `download` or `export.pdf`; a download that hangs with no feedback.

---

## T-35 · Global cross-meeting search

**Branch:** `feat/T-35-global-search` · **Est:** 60 min

### Subtasks

**T-35.1 — `GET /api/v1/search?q&type&host&from&to&limit&offset`** using FTS5 with `bm25()` ranking, returning grouped results: meetings (title/overview hits) and transcript segments (content hits) with `snippet()`-generated context.

**T-35.2 — Snippet generation** via SQLite's `snippet()` function with `<b>`…`</b>` delimiters converted to structured match ranges server-side — never send HTML to the client.

**T-35.3 — Query syntax support:** quoted phrases (`"pricing model"`), `-exclusion`, `speaker:Sarah`, `before:2026-07-01`, `after:`. Parse into an FTS query plus SQL filters. Document the syntax in a `?` popover next to the search box.

**T-35.4 — `/search` results page.** Header `N results for "x"` + a left filter sidebar (type, host, date range, tags) + the result list.

**T-35.5 — Result card:** meeting title (accent link), date · duration · host, then up to 3 matching transcript snippets each with a timestamp and the query terms marked. Clicking a snippet opens `/meeting/{id}?t=<sec>&find=<q>` — landing the user exactly on the matched line with the find bar primed. **This is the feature's payoff; make sure it works.**

**T-35.6 — Grouping toggle:** `Group by meeting` (default) vs `All matches` flat, ranked.

**T-35.7 — Ranking transparency.** Title matches rank above transcript matches; recency breaks ties. Show a `Best match` badge on the top result.

**T-35.8 — Infinite scroll or `Load more`** with a stable cursor, plus a total count.

**T-35.9 — Search history** in localStorage (max 10), shown in the topbar dropdown on focus, individually removable, with a `Clear history` action.

**T-35.10 — Zero-result state** with suggestions: `Check your spelling`, `Try fewer words`, `Search titles only`, plus the 5 most common seeded keywords as clickable chips.

**T-35.11 — Performance.** Sub-200ms for the seeded corpus; a test that asserts FTS is actually being used (`EXPLAIN QUERY PLAN` mentions the FTS table, not a full scan).

**T-35.12 — Command palette integration.** `⌘K` → typing runs the same search inline; `Enter` on `See all results` goes to `/search`.

**T-35.13 — `data-testid`s:** `search-page`, `search-result-<meetingId>`, `search-snippet-<i>`, `search-filter-<name>`, `search-group-toggle`, `search-load-more`.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T35-A | pytest | `?q=pricing` | ≥2 meetings; snippets contain the term; ranked |
| T35-B | pytest | `?q="pricing model"` | Only exact-phrase hits |
| T35-C | pytest | `?q=pricing -churn` | Excludes segments containing `churn` |
| T35-D | pytest | `?q=speaker:Sarah pricing` | Only Sarah's segments |
| T35-E | pytest | `EXPLAIN QUERY PLAN` | Uses the FTS index |
| T35-F | pytest | 500-segment corpus | Response <200ms |
| T35-G | PW-35-01 | Search from the topbar → `See all results` | `/search?q=…` with matching results |
| T35-H | PW-35-02 | Click a snippet | Lands on `/meeting/x?t=…&find=…`; correct segment active and highlighted |
| T35-I | PW-35-03 | Filter by host on `/search` | Results narrow correctly |
| T35-J | PW-35-04 | Search a nonsense term | Zero-state with suggestion chips; clicking one runs that search |
| T35-K | PW-35-05 | Repeat searches | History appears in the topbar dropdown; removable |
| T35-L | PW-35-06 | Toggle grouping | Layout switches; counts consistent |
| T35-M | PW-35-07 | `Load more` | Appends without duplicates |

**✅ Should look like:** ranked, grouped results with real snippets that deep-link into the exact transcript moment.
**❌ Should NOT look like:** `LIKE '%q%'` over every segment; results without context snippets; clicking a result dumping you at the top of the meeting; HTML injected from the server for highlighting.

---

## T-36 · Tags / topics & filtering

**Branch:** `feat/T-36-tags` · **Est:** 40 min

### Subtasks

**T-36.1 — API:** `GET/POST /tags`, `PATCH/DELETE /tags/{id}`, `PUT /meetings/{id}/tags` (set the full list), plus tag counts on the facets endpoint.

**T-36.2 — Tag chips** on notebook rows (max 2 + `+N`), in the details drawer, and in the notepad header. Each tag has a deterministic colour derived from its name via the same hash utility as speakers.

**T-36.3 — Tag editor popover** on a meeting: a search field over existing tags, checkbox list, and `Create "<query>"` when nothing matches. Multi-select, applied on close.

**T-36.4 — Topic auto-tagging.** The mock AI provider proposes tags from the transcript's top terms; proposals render with a dashed border and a `Suggested` label until accepted or dismissed.

**T-36.5 — Filter by tag** from the filters panel (chip cloud with counts) **and** by clicking a tag chip anywhere in the UI (which applies it as a notebook filter).

**T-36.6 — Tag management page** under `/settings/tags`: list with usage counts, rename (propagates), recolour, merge two tags, delete (with a confirm naming the affected meeting count).

**T-36.7 — Channels** as the tag system's sibling: a meeting belongs to exactly one channel but has many tags. Sidebar channels filter the notebook; `Move to channel` appears in kebabs and the bulk bar.

**T-36.8 — Multi-tag semantics.** Default `OR` within tags (`#sales OR #urgent`) with an `AND` toggle. Label it clearly in the UI — ambiguous filter semantics is a real usability bug.

**T-36.9 — Bulk tagging** from the bulk bar: `Add tags` applies to all selected meetings in one request.

**T-36.10 — Validation:** unique tag names (case-insensitive), max 24 chars, no leading `#` stored (add it only at render time), max 10 tags per meeting.

**T-36.11 — `data-testid`s:** `tag-chip-<slug>`, `tag-editor`, `tag-create`, `tag-filter-<slug>`, `tags-settings-page`, `tag-merge`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T36-A | PW-36-01 | Add a tag to a meeting | Chip appears on the row and in the drawer; persists |
| T36-B | PW-36-02 | Create a new tag from the editor | Created, applied, and available to other meetings |
| T36-C | PW-36-03 | Click a tag chip on a row | Notebook filters to that tag; chip appears in the active-filter row |
| T36-D | PW-36-04 | Select two tags (OR) | Union returned |
| T36-E | PW-36-05 | Toggle AND | Intersection returned; count changes |
| T36-F | PW-36-06 | Rename a tag in settings | Updated everywhere it appears |
| T36-G | PW-36-07 | Merge two tags | Meetings from both carry the surviving tag; no duplicates |
| T36-H | PW-36-08 | Delete a tag | Confirm names the affected count; removed from all meetings |
| T36-I | PW-36-09 | Add an 11th tag | Blocked with a message |
| T36-J | PW-36-10 | Create a duplicate name in different case | Blocked as duplicate |
| T36-K | PW-36-11 | Bulk-tag 3 meetings | All three tagged in one request |
| T36-L | PW-36-12 | Same tag on two meetings | Identical colour in both places |

**✅ Should look like:** compact coloured tag chips that are clickable filters, with a real management surface.
**❌ Should NOT look like:** free-text tags with no dedup producing `sales`, `Sales`, and `#sales`; tags that display but can't filter; a random colour per render; deleting a tag silently orphaning references.

---

## T-37 · AskFred — LLM chat about a meeting

**Branch:** `feat/T-37-askfred` · **Est:** 60 min

### Subtasks

**T-37.1 — API:** `POST /meetings/{id}/ask` with `{question, history[]}` returning `{answer, citations:[{segment_id, start_ms, snippet}], tokens_used}`. Streaming via SSE if time permits; a non-streamed response is acceptable and simpler.

**T-37.2 — Retrieval before generation.** Even with the mock provider: score segments against the question by term overlap (or TF-IDF cosine), take the top 8, and build the answer from those. **Always return citations** — they are what make the feature credible and demoable.

**T-37.3 — Chat panel** as a right-side flyout or a bottom sheet: message list, an input with a send button, and a `Fred` avatar for assistant messages.

**T-37.4 — Suggested questions** shown on open, generated from the meeting content: `What were the main decisions?`, `What did Marcus commit to?`, `Were there any objections?`, `What are the next steps?`. Clicking one sends it.

**T-37.5 — Citation chips** under each answer: `[00:14 Sarah Chen]` — clicking seeks the player, scrolls the transcript, and flashes the cited segment. This is the interaction that makes AskFred feel real.

**T-37.6 — Streaming UX** (if implemented): token-by-token render with a blinking cursor and a `Stop generating` button. If not streaming, show a three-dot thinking indicator with the elapsed time.

**T-37.7 — Conversation history** kept in component state and sent with each request (last 6 turns), with a `New chat` button to clear.

**T-37.8 — Grounding guardrail.** When retrieval finds nothing relevant, answer `I couldn't find anything about that in this meeting.` rather than hallucinating. Test this explicitly with an off-topic question — it's the most impressive thing you can demonstrate here.

**T-37.9 — Rate limiting + error states:** the 10/min limit from T-04.10 surfaces as a friendly `You're asking faster than Fred can think — try again in a moment.` Network failure → a retry affordance on the failed message.

**T-37.10 — Copy answer** button per message, and `Save as action item` on answers that look like commitments.

**T-37.11 — Provider honesty.** When running on the mock provider, the panel header shows a small `Extractive mode` badge with a tooltip explaining that answers are retrieved from the transcript rather than generated. Honest, and it pre-empts the obvious interview question.

**T-37.12 — `data-testid`s:** `askfred-panel`, `askfred-input`, `askfred-send`, `askfred-message-<i>`, `askfred-citation-<i>`, `askfred-suggested-<i>`, `askfred-new-chat`.

### Test cases
| ID | Type | Case | Expected |
|---|---|---|---|
| T37-A | pytest | Ask about a topic present in the transcript | Answer non-empty; ≥1 citation; every citation's `segment_id` exists in that meeting |
| T37-B | pytest | Ask about something absent | The explicit "couldn't find" response; zero citations |
| T37-C | pytest | 11 questions in a minute | 429 with the friendly message |
| T37-D | pytest | History of 20 turns sent | Truncated to the last 6 |
| T37-E | PW-37-01 | Open AskFred | Suggested questions rendered |
| T37-F | PW-37-02 | Click a suggestion | Sent; thinking indicator; answer renders |
| T37-G | PW-37-03 | Click a citation chip | Player seeks; transcript scrolls; segment flashes |
| T37-H | PW-37-04 | Ask two follow-ups | Context carried (assert the request body includes prior turns) |
| T37-I | PW-37-05 | `New chat` | History cleared; suggestions return |
| T37-J | PW-37-06 | Force the endpoint to 500 | Error bubble with `Retry` on that message only |
| T37-K | PW-37-07 | Mock provider active | `Extractive mode` badge visible |

**✅ Should look like:** a grounded Q&A panel where every answer points back to timestamped evidence you can click.
**❌ Should NOT look like:** a chat that answers from general knowledge with no reference to the transcript; answers with no citations; a hardcoded canned response regardless of the question; an API key shipped to the browser.

---

## T-38 · Dark mode

**Branch:** `feat/T-38-dark-mode` · **Est:** 40 min
Highest ratio of visible polish to effort — provided T-02 was done properly, this is mostly a second token block.

### Subtasks

**T-38.1 — `ThemeProvider`** with `light | dark | system`, stored in localStorage, defaulting to `system` via `prefers-color-scheme`.

**T-38.2 — No-flash script.** An inline `<script>` in `<head>` (before paint) reading localStorage and setting `data-theme` on `<html>`. Without this, every page load flashes white before going dark — extremely visible and it looks broken.

**T-38.3 — Apply the A3.2 dark tokens** at `[data-theme="dark"]`. Because components consume semantic tokens only, this should require **zero component changes**. Any component that needs a change is a T-02 violation — fix it there, not with an override.

**T-38.4 — Audit elevation.** In dark mode, elevation is conveyed by *lighter surfaces*, not by shadows. Modals and popovers use `--ff-surface-2`; shadows drop to near-invisible. Copying light-mode shadows into dark mode is the classic tell of a rushed dark theme.

**T-38.5 — Recheck every accent-on-surface pair for contrast.** The light-mode accent `#2A6EF4` fails on dark backgrounds — hence the lighter `#5B8DEF`. Run the contrast checker across all token pairs and fix failures in the token file.

**T-38.6 — Speaker palette adjustment.** The 8 speaker colours need a dark variant set (lift lightness ~15%, drop saturation ~10%) so names stay legible and the amber doesn't glare.

**T-38.7 — Highlight colours.** `--ff-highlight` becomes a dark amber (`#6B5714`) with light text. A light-yellow highlight on a dark background is unreadable.

**T-38.8 — Media & canvas surfaces.** Waveform canvas, thumbnails, chart placeholders, and the illustration SVGs in empty states all need theme-aware colours. SVGs should use `currentColor` so they follow for free.

**T-38.9 — Theme toggle** in the avatar menu (3-way segmented) and in `/settings/appearance` (with live preview cards). Also bind `⌘⇧L`.

**T-38.10 — Transition on switch.** A 200ms colour transition on `background-color` and `color` at the root only — never `transition: all`, which would animate layout properties and look terrible.

**T-38.11 — Scrollbars, selection colour, focus ring, and `color-scheme: dark`** on `<html>` so native form controls, scrollbars, and autofill styling follow.

**T-38.12 — Full visual sweep.** Screenshot every major surface in both themes and compare side by side: notebook, notepad, all modals, all flyouts, all empty states, all toasts, the filters panel, and the export modal. Something will be wrong; this is how you find it.

**T-38.13 — `data-testid`s:** `theme-toggle`, `theme-option-<mode>`.

### Test cases
| ID | Playwright | Case | Expected |
|---|---|---|---|
| T38-A | PW-38-01 | Toggle to dark | `html[data-theme="dark"]`; background matches the dark token |
| T38-B | PW-38-02 | Reload in dark | Still dark; **no white flash** (assert first-paint screenshot is dark) |
| T38-C | PW-38-03 | `colorScheme: dark` emulated, theme `system` | Dark applied |
| T38-D | PW-38-04 | Switch OS preference while on `system` | Theme follows live |
| T38-E | PW-38-05 | Axe contrast scan on `/notebook` in dark | Zero contrast violations |
| T38-F | PW-38-06 | Axe contrast scan on `/meeting/{id}` in dark | Zero contrast violations |
| T38-G | PW-38-07 | Open every modal in dark | Backgrounds are `surface-2`; text legible; no white boxes |
| T38-H | PW-38-08 | Transcript search in dark | Highlights legible (dark amber + light text) |
| T38-I | PW-38-09 | Waveform in dark | Theme-appropriate colours, not a white block |
| T38-J | PW-38-10 | Visual | Paired snapshots of 6 key screens in both themes |
| T38-K | PW-38-11 | Grep components for hardcoded `#fff`/`white` | Zero matches outside tokens |

**✅ Should look like:** a deliberately designed dark theme — near-black `#0F1218` app background, slightly lighter `#161A22` cards, a lifted accent blue, near-invisible shadows.
**❌ Should NOT look like:** a CSS `filter: invert()`; a white flash on load; light-mode shadows on dark surfaces; unreadable yellow highlights; native scrollbars and dropdowns still rendering light.

---

# PHASE 7 · QUALITY ASSURANCE

---

## T-39 · Playwright infrastructure

**Branch:** `test/T-39-playwright-infra` · **Est:** 45 min

### Subtasks

**T-39.1 — Install and configure.** `npm init playwright@latest` inside `e2e/`. `playwright.config.ts`: `baseURL` from env, `testDir: ./tests`, `fullyParallel: true`, `workers: process.env.CI ? 2 : 4`, `retries: CI ? 2 : 0`, `reporter: [['html'], ['list'], ['github']]`.

**T-39.2 — Trace, video, screenshot** all set to `on-first-retry` / `retain-on-failure`. A failing CI run must produce an artifact you can actually debug from.

**T-39.3 — Projects:** `chromium-desktop` (1440×900), `chromium-mobile` (Pixel 7), `webkit-desktop` (optional), and a separate `visual` project pinned to `deviceScaleFactor: 1` with animations disabled.

**T-39.4 — `webServer` config** starting the backend (with a **test-only** SQLite file) and the frontend, `reuseExistingServer: !process.env.CI`, `timeout: 120_000`.

**T-39.5 — Deterministic DB fixture.** A `global-setup.ts` that resets and seeds the test database over an API route or a CLI call, so every run starts identical. Non-deterministic seed data makes visual regression useless.

**T-39.6 — Time freezing.** Because seed dates are relative ("today"), pin the clock: `page.clock.install({ time: new Date('2026-07-26T09:00:00Z') })` in a fixture, and seed relative to the same anchor. Without this, `Today`/`Yesterday` assertions break every midnight.

**T-39.7 — Page Object Models** in `e2e/pages/`: `NotebookPage`, `NotepadPage`, `PlayerComponent`, `TranscriptComponent`, `SummaryComponent`, `ActionItemsComponent`, `FiltersPanel`, `CreateModal`. Tests read as prose; selectors live in one place.

**T-39.8 — Custom fixtures** (`e2e/fixtures.ts`): `seededMeeting` (returns the hero meeting's id), `emptyDb`, `apiMock` (a helper wrapping `page.route` for forcing errors/delays), `clipboard` (grants permissions and reads back).

**T-39.9 — Locator policy.** `getByTestId` first, `getByRole` where semantics matter (this doubles as an a11y check), `getByText` last. **Ban** CSS/XPath selectors via a lint rule — they are why E2E suites rot.

**T-39.10 — Custom assertions:** `expectToBeToken(locator, 'color', '--ff-accent')` resolving the CSS variable and comparing computed values, `expectPlayerTime(page, seconds, tolerance)`, `expectActiveSegment(page, index)`.

**T-39.11 — Network helpers** for the error-path tests: `failRoute(page, '**/api/v1/meetings', 500)`, `delayRoute(page, url, ms)`, `countRequests(page, url)` for the debounce assertions.

**T-39.12 — Axe integration.** `@axe-core/playwright` with a shared `checkA11y(page, {excludeRules})` helper used in every suite.

**T-39.13 — CI wiring.** Playwright job in `ci.yml` with browser caching, uploading `playwright-report/` and `test-results/` on failure.

**T-39.14 — Scripts:** `npm run e2e`, `e2e:ui`, `e2e:debug`, `e2e:visual`, `e2e:update-snapshots`.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T39-A | `npm run e2e` on a clean checkout | Servers start, DB seeds, suite runs, no manual steps |
| T39-B | Run the suite 3× | Identical results (no flakes) |
| T39-C | Force a failure | HTML report contains a trace, video, and screenshot |
| T39-D | Run with the clock fixture | `Today` assertions pass regardless of the real date |
| T39-E | Grep the test suite | Zero CSS/XPath selectors |

---

## T-40 · End-to-end test suites

**Branch:** `test/T-40-e2e` · **Est:** 90 min
All `PW-*` IDs referenced throughout Part C live here. Organise by file, not by feature-sprawl.

### Subtasks

**T-40.1 — `01-shell.spec.ts`** — sidebar, topbar, navigation, active states, collapse, responsive drawer. *(PW-07-\*, PW-08-\*)*

**T-40.2 — `02-notebook.spec.ts`** — list rendering, row anatomy, hover, click targets, grid/list toggle, empty/loading/error. *(PW-12-\*, PW-16-\*)*

**T-40.3 — `03-filters.spec.ts`** — search, every filter, combinations, chips, URL round-trip, back/forward, sort, pagination, bulk selection. *(PW-13-\*, PW-14-\*)*

**T-40.4 — `04-notepad.spec.ts`** — header, title editing, panels, resize, icon rail, scroll containment. *(PW-18-\*)*

**T-40.5 — `05-player-sync.spec.ts`** — the graded interaction. Player controls, keyboard shortcuts, seek, chapters, and **every** bidirectional sync case. *(PW-19-\*, PW-21-\*)*

**T-40.6 — `06-transcript.spec.ts`** — rendering, grouping, virtualisation, auto-scroll suspension, segment menu, selection toolbar, editing, speaker rename. *(PW-20-\*, PW-25-\*)*

**T-40.7 — `07-summary-actions.spec.ts`** — five sections, outline seeking, regenerate, stale badge, action item CRUD, optimistic toggles, cross-view badge sync. *(PW-23-\*, PW-24-\*)*

**T-40.8 — `08-crud.spec.ts`** — create via all three tabs, all four parsers, validation, edit, delete, undo, bulk delete. *(PW-26-\*, PW-27-\*, PW-28-\*)*

**T-40.9 — `09-search.spec.ts`** — transcript find, Smart Search presets, global search, deep-links from snippets. *(PW-22-\*, PW-35-\*)*

**T-40.10 — `10-bonus.spec.ts`** — comments, highlights, soundbites, export, tags, AskFred, dark mode. Guarded with `test.skip(!FEATURES.comments)` flags so an unbuilt bonus doesn't red the suite.

**T-40.11 — `11-errors.spec.ts`** — every failure path: 500s, timeouts, offline, 404, 410, malformed payloads, rollback verification.

**T-40.12 — `12-a11y.spec.ts`** — axe on 8 key surfaces in both themes, full keyboard traversal of the notebook and notepad, focus-trap verification for every modal and drawer.

**T-40.13 — A smoke suite tagged `@smoke`** (12 tests, <60s) that runs against the **deployed** URL post-deploy. Catches "works locally, broken in prod".

**T-40.14 — Coverage checklist.** Map every Core Feature bullet from the assignment brief to at least one `PW-*` ID in a table in `e2e/COVERAGE.md`. Bring this to the interview.

### Test cases (suite-level)
| ID | Case | Expected |
|---|---|---|
| T40-A | Full suite | ≥120 tests, all green |
| T40-B | Every assignment core-feature bullet | Has ≥1 mapped test in `COVERAGE.md` |
| T40-C | Run with `--repeat-each=3` | Zero flakes |
| T40-D | Mobile project | Suite passes at 393px |
| T40-E | Smoke suite against production | Green |

---

## T-41 · Visual regression

**Branch:** `test/T-41-visual` · **Est:** 30 min

### Subtasks

**T-41.1 — Baseline set,** captured after the UI is stable: `sidebar`, `topbar`, `notebook-list`, `notebook-grid`, `notebook-empty`, `notebook-filtered-empty`, `filters-panel`, `notepad-full`, `summary-panel`, `transcript-panel`, `player`, `create-modal`, `delete-dialog`, `toast-success`, `components-gallery`, `tokens-page`.

**T-41.2 — Both themes** for every baseline. 32 snapshots total.

**T-41.3 — Determinism controls:** `animations: 'disabled'`, the frozen clock, fixed viewport, `deviceScaleFactor: 1`, fonts preloaded and awaited (`document.fonts.ready`), and the pseudo-waveform seeded from the meeting id.

**T-41.4 — Mask genuinely dynamic regions** (relative timestamps that can't be frozen, the player's current time during playback) with Playwright's `mask` option rather than loosening the diff threshold globally.

**T-41.5 — Thresholds:** `maxDiffPixelRatio: 0.01` for component shots, `0.015` for full pages. Tighter than that is flaky; looser stops catching real regressions.

**T-41.6 — Component-level shots** from `/dev/components` for each primitive in each state — these localise a regression to one component instead of "the notebook changed".

**T-41.7 — Side-by-side comparison harness.** A `docs/visual-comparison.html` placing your screenshots next to the reference Fireflies screenshots at matched widths. Use it during the build, and ship it in the repo — it's direct evidence for the UI/UX criterion.

**T-41.8 — Update workflow** documented: `npm run e2e:update-snapshots`, review the diff images, commit intentionally. Never blanket-update to make CI green.

**T-41.9 — Store snapshots per platform** (`{testName}-{projectName}-{platform}.png`) and generate CI baselines in a Linux container matching CI, so font rendering differences don't cause permanent failures.

**T-41.10 — Responsive snapshots** at 1440, 1024, 768, and 393 for the two hero screens.

**T-41.11 — CI publishes the diff artifacts** so a failure is inspectable from the PR without reproducing locally.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T41-A | Run visual suite twice with no changes | Zero diffs |
| T41-B | Change a token value | Multiple snapshots fail (proves coverage) |
| T41-C | Change one component's padding | Only that component's snapshots fail (proves localisation) |
| T41-D | Run across the 4 responsive widths | All pass, no horizontal overflow |
| T41-E | Run on CI | Same results as locally |

---

## T-42 · Accessibility, performance & cross-browser

**Branch:** `test/T-42-quality` · **Est:** 45 min

### Subtasks

**T-42.1 — Axe on 8 surfaces × 2 themes.** Target: zero serious/critical. Document any knowingly accepted violation with a reason.

**T-42.2 — Keyboard-only traversal.** Navigate the entire core flow — find a meeting, filter it, open it, play, jump to a transcript line, check an action item, delete the meeting — without touching the mouse. Record it as a test and as a GIF for the README.

**T-42.3 — Focus management audit:** every modal traps and restores focus; every drawer does the same; route changes move focus to the `<h1>`; skip-to-content link as the first tab stop.

**T-42.4 — Semantic landmarks:** `<header>`, `<nav aria-label="Main">`, `<main>`, `<aside>`; one `<h1>` per page; heading levels never skip.

**T-42.5 — Screen-reader labelling** for the player (`role="slider"` with `aria-valuetext` in `MM:SS`), the transcript (`aria-current` on the active segment), action items (`aria-checked`), and every icon-only button.

**T-42.6 — Colour-blind check.** Verify with a deuteranopia simulator that speaker colours remain distinguishable and that status (overdue/complete) is never conveyed by colour alone — always colour **plus** an icon or text.

**T-42.7 — Lighthouse targets** on the notebook and notepad: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95. Record the scores in the README.

**T-42.8 — Core Web Vitals:** LCP < 2.0s, CLS < 0.1, INP < 200ms on the notebook, measured on a throttled profile.

**T-42.9 — Bundle budget.** Route JS < 250KB gzipped. Analyse with `@next/bundle-analyzer`; dynamic-import the heavy leaves (waveform decoder, export modal, AskFred panel, date picker).

**T-42.10 — Backend latency budget:** list < 100ms, detail < 200ms, search < 200ms, on the seeded corpus. Assert in pytest with a timer.

**T-42.11 — Long-meeting stress test:** seed a synthetic 4-hour meeting with 5,000 segments and verify scroll, search, and sync all remain responsive.

**T-42.12 — Cross-browser pass:** Chrome, Safari, Firefox, plus iOS Safari on a real device or simulator. Known Safari traps to check explicitly: `<audio>` autoplay policy, `backdrop-filter`, sticky positioning inside a scroll container, and `contentEditable` selection behaviour.

**T-42.13 — Reduced-motion and zoom.** Verify at 200% browser zoom that nothing overlaps or clips, and that reduced-motion is respected.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T42-A | Axe, all surfaces, both themes | 0 serious/critical |
| T42-B | Keyboard-only core flow | Completable; focus always visible |
| T42-C | Every modal/drawer | Focus trapped and restored |
| T42-D | Lighthouse notebook | Perf ≥85, A11y ≥95 |
| T42-E | CLS on notebook load | < 0.1 |
| T42-F | 5,000-segment meeting | Scroll stays smooth; search < 500ms |
| T42-G | Safari | Player, sticky headers, and transcript editing all work |
| T42-H | 200% zoom | No overlap or clipping |
| T42-I | Route JS bundles | All < 250KB gzipped |
| T42-J | API latency assertions | All within budget |

---

## T-43 · Backend test suite

**Branch:** `test/T-43-pytest` · **Est:** 45 min

### Subtasks

**T-43.1 — Fixtures:** an in-memory (or temp-file) SQLite engine per test module, a `client` fixture with `get_db` overridden, and factory helpers (`make_meeting`, `make_segments(n)`, `make_action_item`).

**T-43.2 — Model/schema tests** (T-03 test cases): constraints, cascades, soft delete, FTS triggers, pragma enforcement.

**T-43.3 — Service-layer unit tests** with the DB mocked or a fresh session — filter composition, sort whitelisting, pagination maths, duration aggregation.

**T-43.4 — Router integration tests** for every endpoint: happy path, not-found, validation error, and one edge case each.

**T-43.5 — Parser tests** with real fixture files for `.vtt`, `.srt`, three `.txt` dialects, and `.json` — plus malformed variants of each asserting a clean error rather than a 500.

**T-43.6 — AI provider tests** (T-29 cases): determinism, extraction quality on a known fixture, fallback behaviour, caching.

**T-43.7 — Range-request tests** for media streaming — the detail most likely to be broken and least likely to be tested.

**T-43.8 — Export tests** — format correctness, filename sanitisation, section inclusion.

**T-43.9 — Search tests** — FTS ranking, query syntax parsing, `EXPLAIN QUERY PLAN` assertion.

**T-43.10 — N+1 guard.** A `assert_max_queries(n)` context manager using SQLAlchemy events, applied to the list and detail endpoints. This single test communicates more about your engineering than a paragraph of README.

**T-43.11 — Migration test:** `alembic upgrade head` then `downgrade base` on a scratch DB.

**T-43.12 — Coverage target ≥ 80%** on `services/`, `parsers/`, and `ai/`. Routers and models can be lower. Report with `pytest --cov` and put the badge in the README.

**T-43.13 — CI job** running `ruff check`, `mypy`, and `pytest --cov` with the coverage summary in the job output.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T43-A | `pytest` | All green, < 30s |
| T43-B | Coverage on services/parsers/ai | ≥ 80% |
| T43-C | Every endpoint | ≥ 3 tests (happy, 404/validation, edge) |
| T43-D | Every parser | ≥ 2 tests (valid, malformed) |
| T43-E | N+1 guard on list and detail | Within budget |
| T43-F | `mypy --strict` | Clean |
| T43-G | Migrations up and down | Clean |

---

# PHASE 8 · SHIP

---

## T-44 · Deployment

**Branch:** `chore/T-44-deploy` · **Est:** 40 min

### Subtasks

**T-44.1 — Frontend to Vercel.** Connect the repo, set root directory `frontend/`, add `NEXT_PUBLIC_API_URL`, enable automatic deployments from `main`.

**T-44.2 — Backend to Render/Railway/Fly.** Dockerfile (multi-stage, non-root user, `uvicorn` with `--workers 2`), health check pointed at `/api/health`.

**T-44.3 — SQLite persistence.** Attach a persistent disk and put the DB file on it. **Verify the data survives a redeploy** — an ephemeral filesystem silently wiping the demo database between the evaluator's two visits is a real and common failure. If the host offers no persistent disk, either use Fly volumes or switch to a hosted Postgres and note the change (your SQLAlchemy layer makes this a URL change).

**T-44.4 — Run migrations + seed on first boot** via a release command, guarded so it never re-seeds over live data.

**T-44.5 — CORS** locked to the Vercel domain(s) including preview URLs, not `*`.

**T-44.6 — Media serving.** Commit the small sample audio into the image, or serve from the persistent disk. Verify range requests survive the proxy (some platforms buffer and break 206 responses — test the deployed player specifically).

**T-44.7 — Cold-start mitigation.** Free tiers sleep. Either use a paid-but-cheap always-on instance, or add a `cron-job.org` ping every 10 minutes, **and** put an honest note in the README that the first request may take ~30s. An evaluator who hits a 30s blank page may not wait.

**T-44.8 — Security headers** on both apps: CSP, `X-Frame-Options`, `Referrer-Policy`, HSTS. Free marks on Best Practices in Lighthouse.

**T-44.9 — Environment parity check.** Run the `@smoke` Playwright suite against the deployed URL. It will find at least one thing (usually CORS or a hardcoded localhost).

**T-44.10 — Error monitoring** — Sentry free tier on both apps, or at minimum structured logs you can read from the host dashboard.

**T-44.11 — Custom domain** (optional): a subdomain reads more finished than `fireflies-clone-git-main-xyz.vercel.app`.

**T-44.12 — Demo reset endpoint.** A `POST /api/v1/admin/reset-demo` behind a secret header that re-seeds. Lets you recover instantly if an evaluator deletes everything, and demonstrates operational thinking. Document it.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T44-A | Open the deployed URL in a fresh incognito window | Loads < 3s (warm); 8 meetings visible |
| T44-B | Full core flow on production | Works end to end |
| T44-C | Player seek on production | Works — proves range requests survive the proxy |
| T44-D | Redeploy, then reload | Data still present |
| T44-E | Cross-origin API call from the Vercel domain | Allowed; from another origin | blocked |
| T44-F | `@smoke` suite against production | Green |
| T44-G | securityheaders.com scan | Grade A or B |
| T44-H | Mobile browser on a real phone | Usable |

---

## T-45 · README & documentation

**Branch:** `docs/T-45-readme` · **Est:** 45 min
The brief names the README as a deliverable and lists exactly what it must contain. Treat this as a graded artifact, not an afterthought.

### Subtasks

**T-45.1 — Header:** project name, one-line description, badges (CI, coverage), and **the live demo link plus the repo link at the very top**.

**T-45.2 — Screenshot/GIF section** immediately after the header: notebook, notepad, dark mode, and a short GIF of the transcript↔player sync. This is the first thing anyone actually looks at.

**T-45.3 — Feature list** mapped to the assignment's Core Features, with ✅ / 🚧 / ❌ markers, and a separate Bonus table. Honesty about what is mocked earns trust.

**T-45.4 — Tech stack table** with the *reason* for each choice, not just the name. "SQLite + FTS5 — the brief specifies SQLite; FTS5 gives real ranked search without an external service."

**T-45.5 — Architecture section** with a diagram (Mermaid) showing browser → Next.js → FastAPI → services → SQLAlchemy → SQLite, and the AI provider as a swappable box. Explain the layering rule (routers → services → models) in three sentences.

**T-45.6 — Database schema section:** the Mermaid ERD image plus a table per entity (column · type · constraints · purpose) and a short "design decisions" list covering soft delete, the `speakers` indirection, stored durations, and the FTS table.

**T-45.7 — API overview:** the endpoint table from T-04, a link to the live `/docs`, and one full request/response example.

**T-45.8 — Setup instructions,** both Docker and manual, copy-pasteable, tested on a clean machine. Include prerequisites with versions. Include `make seed`. **Have someone else follow them** — you cannot see your own missing step.

**T-45.9 — Assumptions & scope section,** explicit and unapologetic: single default user (no auth), transcription mocked, summaries via a pluggable provider defaulting to deterministic extraction, integrations and real-time bot out of scope, soft deletes, sample audio for two meetings only.

**T-45.10 — Testing section:** how to run each suite, what's covered, current counts, and a link to the coverage report.

**T-45.11 — Project structure tree** with one-line annotations on each top-level directory.

**T-45.12 — "What I'd do next"** — 5 bullets showing you know the gaps (real STT via Whisper, WebSocket live transcription, Postgres + pgvector for semantic search, RBAC, background jobs for AI). Reads as engineering maturity, not as excuse-making.

**T-45.13 — `docs/decisions.md`** — the ADR log you've been keeping. Link it from the README.

**T-45.14 — Original-work statement.** The brief warns about plagiarism. State plainly that the code is original, note that AI assistants were used for scaffolding and seed-content drafting (which the brief explicitly permits), and that you can explain every line.

### Test cases
| ID | Case | Expected |
|---|---|---|
| T45-A | Follow the setup steps on a clean machine | App runs; no undocumented step |
| T45-B | Every README link | Resolves (no 404s) |
| T45-C | Demo link | Live and seeded |
| T45-D | Schema section vs actual models | Matches exactly |
| T45-E | API table vs `/openapi.json` | No missing or phantom endpoints |
| T45-F | Read time | Under 8 minutes |

---

## T-46 · Final polish & demo preparation

**Branch:** `chore/T-46-polish` · **Est:** 45 min

### Subtasks

**T-46.1 — Side-by-side UI audit.** Open `docs/visual-comparison.html` and go screen by screen against the Fireflies reference. List every discrepancy, then fix the top 10 by visual weight. Spacing and type errors first — they're the ones the eye catches.

**T-46.2 — Console hygiene.** Zero errors, zero warnings, zero React key warnings, zero hydration mismatches, across every route in both themes.

**T-46.3 — Network hygiene.** No 404s for assets, no duplicate requests for the same resource, no requests to localhost from production, no waterfalls that could be parallel.

**T-46.4 — Dead code sweep.** Remove commented-out blocks, unused imports, unused components, `console.log`s, and any `TODO` you aren't going to do. `ts-prune` and `ruff --select F401` find these in seconds.

**T-46.5 — Copy pass.** Every user-facing string reviewed for consistency: sentence case for buttons (`Copy link`, not `Copy Link`), consistent terminology (`meeting` not sometimes `recording`), no lorem ipsum, no dev placeholders, no British/American mixing.

**T-46.6 — Loading-state sweep.** Throttle to Slow 3G and click through everything. Any white flash > 300ms needs a skeleton.

**T-46.7 — Error-path sweep.** With devtools, force each API to fail once and confirm the UI degrades gracefully rather than crashing.

**T-46.8 — Full keyboard-only run** of the demo script. Fix anything you can't reach.

**T-46.9 — Write the demo script** (`docs/demo-script.md`) — a 5-minute walkthrough with exact clicks:
1. Notebook — the list, hover, search `pricing`, filter by host, sort
2. Open the hero meeting — point out the five summary sections
3. **Click a transcript line → player seeks** · **press play → lines light up** ← the money moment, do it slowly
4. Click an outline timestamp; click a keyword → find bar
5. Check an action item → show the notebook badge updating
6. Upload a `.vtt` → preview → created meeting
7. Dark mode toggle
8. Global search → click a snippet → land on the exact line
9. `/docs` — the API surface
10. `npx playwright test` — the green run

**T-46.10 — Rehearse it twice, timed.** Once silently, once out loud. You will find a bug both times.

**T-46.11 — Prepare interview answers** for the predictable questions: why this schema; how you'd swap SQLite for Postgres; why virtualisation; how the player sync avoids re-render storms; how you'd add real STT; what you'd refactor with another week; where the N+1s were and how you found them.

**T-46.12 — Record a 3-minute Loom** walking through the app, and link it in the README. Many evaluators watch the video before opening the code.

**T-46.13 — Final checklist:** repo public · both links in the submission · CI green · demo seeded and warm · README screenshots current · no secrets in git history (`git log -p | grep -i` for key patterns, and check `.env` was never committed).

### Test cases
| ID | Case | Expected |
|---|---|---|
| T46-A | Every route, both themes | Zero console errors/warnings |
| T46-B | Full demo script on the deployed app | Completes without a single hiccup |
| T46-C | `git log --all -p` scanned for secrets | Clean |
| T46-D | Repo opened in an incognito window | Public and cloneable |
| T46-E | `ts-prune` / `ruff F401` | No dead exports or unused imports |
| T46-F | Demo script timed | ≤ 5 minutes |

---

# PART D — MASTER TEST MATRIX

## D1. Assignment requirement → test coverage

| Assignment requirement | Task | Primary tests |
|---|---|---|
| List of past meetings with title, date, duration, participants | T-12 | PW-12-01, PW-12-11, PW-12-J |
| Search and filter (title, date, participant) | T-13 | PW-13-01 → PW-13-16 |
| Sort by recency | T-13.12 | PW-13-13, PW-13-14 |
| Navbar with profile/settings placeholders | T-08, T-30 | PW-08-10, PW-30-04 |
| Interactive transcript with speaker labels and timestamps | T-20 | PW-20-01 → PW-20-04 |
| Media player with seek bar | T-19 | PW-19-01 → PW-19-15 |
| **Click transcript line → player seeks (and vice versa)** | T-21 | PW-21-01 → PW-21-14 |
| Search within transcript with highlighted matches | T-22 | PW-22-01 → PW-22-14 |
| AI-generated meeting summary | T-23 | PW-23-01, PW-23-09 |
| Action items / tasks extracted | T-24 | PW-24-01 → PW-24-17 |
| Key topics / outline / chapters | T-23.4 | PW-23-04 → PW-23-06 |
| Create a meeting (upload / paste / form) | T-26 | PW-26-01 → PW-26-16 |
| Edit meeting metadata | T-27 | PW-27-01 → PW-27-11 |
| Delete a meeting | T-28 | PW-28-01 → PW-28-11 |
| Add / edit / complete action items | T-24 | PW-24-06 → PW-24-10 |
| All data persists | T-03, T-43 | T43-A, PW-24-03, PW-31-01 |
| Navigation and layout (library + detail) | T-07, T-18 | PW-07-\*, PW-18-\* |
| Transcript and summary panels | T-20, T-23 | PW-20-16, PW-23-16 |
| Forms, modals, search, filters | T-10, T-26 | PW-10-03, PW-26-\* |
| Notifications / toasts | T-09 | PW-09-01 → PW-09-10 |
| Settings placeholders | T-30 | PW-30-04, PW-30-05 |
| Placeholder: live bot | T-30.6 | PW-30-03 |
| Placeholder: STT | T-29, README | — |
| Placeholder: integrations | T-30.3 | PW-30-01 |
| Placeholder: team/sharing | T-30.4 | PW-30-01 |
| Placeholder: auth | T-30.8 | PW-30-06 |
| Bonus: comments / highlights / soundbites | T-31/32/33 | PW-31-\*, PW-32-\*, PW-33-\* |
| Bonus: export | T-34 | PW-34-\* |
| Bonus: global search | T-35 | PW-35-\* |
| Bonus: tags & filtering | T-36 | PW-36-\* |
| Bonus: LLM Q&A chat | T-37 | PW-37-\* |
| Bonus: dark mode | T-38 | PW-38-\* |
| Seeded database | T-05 | T05-A → T05-H |
| Database design | T-03 | T03-A → T03-G |
| README with setup/architecture/schema/API | T-45 | T45-A → T45-F |
| Public repo + hosted demo | T-44 | T44-A → T44-H |

## D2. Cross-cutting negative test checklist

Run this list against every feature before calling it done:

1. Does it work with **zero** data? With **one** item? With **1,000**?
2. Does it work with a 250-character title? With emoji? With RTL text?
3. Does it survive a page refresh? A browser Back? A shared URL in a new tab?
4. Does it work with the API returning 500? 404? A 10-second delay? Offline?
5. Does a double-click fire the action twice?
6. Is it reachable and operable by keyboard alone?
7. Does it look right in dark mode?
8. Does it look right at 393px, 768px, 1024px, 1440px, and 200% zoom?
9. Does it produce a console error or a React key warning?
10. Does it inject unescaped user text anywhere (`<script>` test)?
11. Does it leave the UI in a stale state after a mutation elsewhere?
12. Does it hold 60fps while scrolling or playing?

## D3. Definition of Done (per task)

A task is done when **all** of the following are true:

- [ ] All subtasks committed, each with a `T-NN.n:` message
- [ ] All listed test cases written and passing
- [ ] Both the ✅ and ❌ visual assertions personally verified against the reference screenshot
- [ ] Works in light **and** dark mode
- [ ] Works at 1440px, 1024px, and 393px
- [ ] Keyboard-accessible; axe clean
- [ ] Zero console errors or warnings
- [ ] Loading, empty, and error states all implemented
- [ ] No hardcoded colours, no `console.log`, no dead code
- [ ] `data-testid`s added and used by the tests
- [ ] Any non-obvious decision logged in `docs/decisions.md`

---

# PART E — RISK REGISTER

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Transcript↔player sync is janky or one-way | Med | **Critical** — it's the headline graded interaction | Build T-21 early, on day 1 of Phase 3; binary search + throttle from the start; 14 dedicated tests |
| 2 | UI "looks like a generic admin dashboard" | High | **Critical** — UI/UX is a named criterion | T-02 calibration against real screenshots before any feature; `visual-comparison.html` reviewed every few hours |
| 3 | SQLite wiped on redeploy; evaluator sees an empty app | Med | High | Persistent disk verified in T-44.3; demo-reset endpoint in T-44.12 |
| 4 | Free-tier cold start; evaluator sees 30s of blank | High | High | Keep-alive ping + an explicit README note |
| 5 | Media range requests broken behind the host's proxy | Med | High | Explicitly test seek on production (T44-C) |
| 6 | Long transcript kills scroll performance | Med | Med | Virtualisation in T-20.2; 5,000-segment stress test in T-42.11 |
| 7 | Bonus features half-built at the deadline | High | Med | Strict priority order; feature flags in the E2E suite; never start one you can't finish |
| 8 | Seed data looks fake, undermining the whole demo | Med | High | T-05.2 — read every seeded transcript line |
| 9 | LLM key missing/rate-limited during evaluation | Med | Med | Mock provider is the default; automatic fallback (T-29.7) |
| 10 | Time overrun on Phase 3 | High | Med | 25h plan against a 24h estimate; buffer comes out of Phase 6, never out of Phase 7 QA |
| 11 | Can't explain a piece of AI-generated code in the interview | Med | **Critical** — explicitly graded | One commit per subtask; `decisions.md` as you go; read and refactor everything an AI writes |
| 12 | Dark mode ships broken and hurts more than it helps | Low | Med | It's a token-layer change (T-38.3); if any component needs a bespoke override, fix T-02 instead — or cut dark mode |

---

# PART F — QUICK REFERENCE

## F1. Task index

| Phase | Tasks |
|---|---|
| 0 · Foundations | T-01 Scaffold · T-02 Tokens · T-03 Schema · T-04 API skeleton · T-05 Seed · T-06 App shell |
| 1 · Chrome | T-07 Sidebar · T-08 Topbar · T-09 Toasts · T-10 Primitives |
| 2 · Notebook | T-11 List API · T-12 Notebook page · T-13 Filters · T-14 Bulk & pagination · T-15 Details drawer · T-16 States |
| 3 · Notepad | T-17 Detail API · T-18 Shell · T-19 Player · T-20 Transcript · T-21 **Sync** · T-22 Transcript search · T-23 Summary · T-24 Action items · T-25 Editing |
| 4 · CRUD & AI | T-26 Create · T-27 Edit · T-28 Delete · T-29 AI provider · T-30 Placeholders |
| 6 · Bonus | T-31 Comments · T-32 Highlights · T-33 Soundbites · T-34 Export · T-35 Global search · T-36 Tags · T-37 AskFred · T-38 Dark mode |
| 7 · QA | T-39 PW infra · T-40 E2E suites · T-41 Visual regression · T-42 A11y/perf · T-43 pytest |
| 8 · Ship | T-44 Deploy · T-45 README · T-46 Polish |

**46 tasks · 560+ subtasks · 380+ test cases**

## F2. The ten things that decide your grade

1. Clicking a transcript line seeks the player, and playing highlights lines — smoothly, both directions.
2. The notebook list looks like Fireflies' list, not a generic table.
3. The five summary sections are named and ordered exactly right.
4. The schema is normalised, indexed, migrated, and you can defend every column.
5. Routers are thin; services hold the logic; Pydantic schemas split by direction.
6. Seed data reads like real meetings.
7. Every state — loading, empty, error, offline — is designed.
8. The demo link works, instantly, with data, on the first click.
9. The README answers every question before it's asked.
10. You can explain any line of it, because you wrote or read every one.

## F3. Do-not-ship list

- `window.alert` / `confirm` / `prompt`
- Native `<audio controls>`
- Hardcoded hex colours outside `tokens.css`
- `console.log` in production
- Lorem ipsum, "Meeting 1", or `test test test` in seed data
- An `.env` file, an API key, or a `.db` file in git
- A README that says "TODO"
- Third-party trademarked logo files
- A `main.py` over 100 lines
- Any endpoint with a verb in its path

---

*End of plan.*
