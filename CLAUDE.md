# Fireflies.ai Clone — Project Instructions

Graded SDE Fullstack take-home. Two documents govern this repo:

- **`PLAN.md`** — the master spec. 46 tasks (T-01 → T-46), ~560 subtasks, 380+ test cases.
  **Read the relevant task section before starting it** — acceptance criteria, `data-testid` names
  and Playwright IDs are already written. Do not invent your own.
- **`design.md`** — the design-token and layout reference (PLAN.md Part A, extracted).
  Every colour, size, radius and duration comes from here.

## How this is graded

1. An evaluator compares screens **side by side against real Fireflies screenshots**. Spacing, type
   scale and colour fidelity outscore extra features.
2. A follow-up **interview probes code understanding**. Anything you can't explain is a liability —
   read and own every line, including AI-generated scaffolding.
3. The single most-graded interaction is **transcript ↔ player bidirectional sync** (T-21).

Protect, in priority order: T-21 sync → notebook list fidelity → the five canonically-named summary
sections → seed data that reads like real meetings.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router, TS strict) | `noUncheckedIndexedAccess: true` |
| Styling | **Tailwind v3 — pin explicitly** | `tailwindcss@3`, NOT `@latest` (v4 is CSS-first and breaks T-01.6) |
| Data | TanStack Query v5 | `staleTime 30s`, `retry 1`, `refetchOnWindowFocus false` |
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic | Python 3.14, managed with `uv` (no poetry) |
| DB | SQLite + FTS5 | WAL, `foreign_keys=ON` |
| AI | Pluggable provider | `MockProvider` (deterministic, default) + `LLMProvider` |
| E2E | Playwright | `pytest` for backend |

## Folder conventions

```
frontend/src/
├─ app/                 # routes ONLY — no business logic in page.tsx
├─ components/ui/       # the 20 primitives — zero domain knowledge
├─ components/layout/   # Sidebar, Topbar, AppShell
├─ features/notebook/   # MeetingRow, FiltersPanel, useMeetings…
├─ features/notepad/    # TranscriptPanel, SummaryPanel, Player…
├─ features/actions/    # ActionItemList…
├─ lib/api/ lib/hooks/ lib/utils/
├─ styles/tokens.css    # the ONLY place hex codes exist
└─ types/

backend/app/
├─ main.py              # app factory, CORS, exception handlers, router mounting
├─ core/ db/ models/ schemas/
├─ api/v1/routers/      # thin: parse → call service → return schema
├─ services/            # ALL business logic lives here
├─ ai/                  # provider.py, mock.py, llm.py, prompts/
├─ parsers/ seed/
```

## Hard rules

These are mechanically enforced (lint/CI) or directly graded. Violating one is a bug, not a style
preference.

**Styling**
- Hex codes exist in `styles/tokens.css` and nowhere else.
- Components consume **semantic** tokens only, never primitives. A component needing a bespoke
  dark-mode override is a token-layer bug — fix the token layer.
- Tailwind's default palette is deleted, so `bg-blue-500` is a build error. Keep it that way.
- `tabular-nums` on every timestamp and duration.
- `lucide-react` only, stroke 1.75. No emoji as production icons.

**Frontend**
- No raw `<button>` / `<input>` outside `components/ui/`.
- No `features/*` → `features/*` cross-imports.
- Never `dangerouslySetInnerHTML` with user text — use the `Highlighter` primitive.
- Every icon-only control needs `aria-label` **and** a tooltip.
- Filters, search, sort, page and `?t=` live in the URL. Every view must be shareable by copying
  the URL, and browser Back must undo a filter change.
- `data-testid` naming: `<domain>-<element>-<qualifier>`.

**Backend**
- Routers contain **no** `db.query(...)`. All logic in `services/`.
- Never return ORM objects — Pydantic schemas, split by direction (`MeetingListItem` is light,
  `MeetingDetail` is heavy).
- No verbs in endpoint paths (`/meetings/{id}`, never `/getMeeting`).
- Every list endpoint uses the same 6-key pagination envelope; every error uses the same
  `{error: {code, message, details}}` envelope.
- Durations stored as INT milliseconds (`start_ms`/`end_ms`). Format only at the presentation edge.
  Never store `"00:04:32"`.

**Testing**
- Playwright locators: `getByTestId` → `getByRole` → `getByText`. No CSS or XPath selectors.
- Backend coverage target ≥80% on `services/`, `parsers/`, `ai/`.

## Workflow

- **One commit per subtask**, message format `T-12.4: sticky table header with tabular-nums`.
  Granular history is direct evidence for the code-understanding criterion.
- Branch per task: `feat/T-12-notebook`, `chore/T-01-scaffold`, `test/T-40-e2e`.
- Log every non-obvious decision in `docs/decisions.md` **as you make it**. That file is the
  interview script.
- Fill the README through the build, not at the end.

## Definition of Done (per task)

- [ ] All subtasks committed with `T-NN.n:` messages
- [ ] All listed test cases written and passing
- [ ] Both the ✅ and ❌ visual assertions verified against the reference screenshot
- [ ] Works in light **and** dark mode
- [ ] Works at 1440px, 1024px, 393px
- [ ] Keyboard-accessible; axe clean
- [ ] Zero console errors or warnings
- [ ] Loading, empty and error states all implemented
- [ ] No hardcoded colours, no `console.log`, no dead code
- [ ] `data-testid`s added and used by the tests
- [ ] Non-obvious decisions logged in `docs/decisions.md`

## Open decisions — settle during T-01/T-03, log each as an ADR

1. **RSC vs client data.** TanStack Query + URL-state + optimistic mutations makes nearly every page
   `"use client"`. Defensible, but write down *why* App Router — it will be asked.
2. **Speaker colour authority.** DB `speakers.color_index` vs client `getSpeakerColor()` hash. Pick
   one (recommend: DB authoritative, hash as fallback) or they diverge.
3. **FTS5 ignores soft delete.** Triggers fire on `transcript_segments`; soft-deleting a *meeting*
   doesn't touch segments, so global search will surface deleted meetings unless it joins back to
   `meetings` and filters `deleted_at IS NULL`.
4. **Who composes the five summary sections.** `summary_sections.kind` omits action items (separate
   table), yet `GET /summary` is specced to return all five in order. API or frontend?
5. **Seed anchor date.** Seeds are relative ("2 today, 1 yesterday"); Playwright pins the clock to
   `2026-07-26T09:00:00Z`. Needs an explicit `SEED_ANCHOR_DATE` or CI date assertions break.

## Scope

PLAN.md budgets 25h; the real work is ~3–4× that (T-10's 20 primitives are budgeted 90 min; T-40's
≥120 E2E tests are budgeted 90 min). **Scope posture is undecided — do not scale anything down
without asking first.** Phases 0→3 are the graded core; Phase 6 (bonus) is cut first if it comes to
that.

## Do not ship

- `window.alert` / `confirm` / `prompt`
- Native `<audio controls>`
- Hardcoded hex outside `tokens.css`
- `console.log` in production
- Lorem ipsum, "Meeting 1", or `test test test` in seed data
- An `.env` file, an API key, or a `.db` file in git
- A README that says "TODO"
- Third-party trademarked logo files (including Fireflies' own mark — draw your own)
- A `main.py` over 100 lines
- Any endpoint with a verb in its path
