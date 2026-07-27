# E2E Coverage — assignment requirement → tests (T-40.14)

This is the bridge between the assignment brief, the plan's test matrix, and the
spec files that actually exist. Bring it to the interview.

## How to read the IDs

PLAN.md Part C and the D1 matrix reference Playwright cases as **`PW-NN-MM`**
("the Playwright tests for task T-NN"). The per-task tables in Part B name the
same cases **`TNN-X`** (`T21-A`, `T13-B`, …), and it is the `TNN-X` form the
suite adopted: every test title starts with its case id, so
`grep -rn "T21-" tests/` finds every sync test. **`PW-*` appears nowhere in the
tree** — treat `PW-21-*` as "task T-21's case table", i.e. the `T21-A → T21-N`
tests. The **Covered by** column below points at the real file and
`test.describe` block, so no translation is needed in practice.

Conventions in the table:

- `file › describe` — where the tests live.
- **Pending** rows are features not yet merged into this branch; the owning
  branch follows the repo's `feat/T-NN-<slug>` convention.
- Backend-only claims (parsing, FTS ranking, persistence round-trips) live in
  `backend/tests/` under pytest (T-43) and are marked as such.

## D1 — Assignment requirement → coverage

| Assignment requirement | Task | Plan IDs | Covered by | Status |
|---|---|---|---|---|
| List of past meetings with title, date, duration, participants | T-12 | PW-12-01, PW-12-11, PW-12-J | `08-notebook.spec.ts › notebook` (T12-A row anatomy, T12-B density); `11-details.spec.ts › details drawer`; `12-states.spec.ts › states` (loading/empty/error) | Covered |
| Search and filter (title, date, participant) | T-13 | PW-13-01 → PW-13-16 | `09-filters.spec.ts › search`, `› filters panel`; `10-bulk.spec.ts › bulk selection`, `› pagination` | Covered |
| Sort by recency | T-13.12 | PW-13-13, PW-13-14 | `09-filters.spec.ts › sorting` | Covered |
| Navbar with profile/settings placeholders | T-08, T-30 | PW-08-10, PW-30-04 | `05-topbar.spec.ts › topbar`, `› narrow viewports`; `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Interactive transcript with speaker labels and timestamps | T-20 | PW-20-01 → PW-20-04 | `15-transcript.spec.ts › transcript panel` (T20-A order, T20-B labels) | Covered |
| Media player with seek bar | T-19 | PW-19-01 → PW-19-15 | `14-player.spec.ts › player` | Covered |
| **Click transcript line → player seeks (and vice versa)** | T-21 | PW-21-01 → PW-21-14 | `16-sync.spec.ts › transcript ↔ player sync` (T21-A → T21-N, both directions and the edges); re-checked post-deploy by `98-smoke.spec.ts › smoke` | Covered |
| Search within transcript with highlighted matches | T-22 | PW-22-01 → PW-22-14 | `17-find.spec.ts › find in transcript`, `› smart search` | Covered |
| AI-generated meeting summary | T-23 | PW-23-01, PW-23-09 | `18-summary.spec.ts › summary panel`, `› index flyout`; `90-mutations.spec.ts › summary · regenerate` | Covered |
| Action items / tasks extracted | T-24 | PW-24-01 → PW-24-17 | `19-action-items.spec.ts › action items`; `90-mutations.spec.ts › action items · editing` | Covered |
| Key topics / outline / chapters | T-23.4 | PW-23-04 → PW-23-06 | `18-summary.spec.ts › summary panel` (T23-D/E/F outline + seeking); `16-sync.spec.ts` (T21-J chapter click) | Covered |
| Create a meeting (upload / paste / form) | T-26 | PW-26-01 → PW-26-16 | `21-create.spec.ts › create meeting` (read-only rejection paths); `90-mutations.spec.ts › create meeting` (the writes); parser edge cases in `backend/tests/` (pytest) | Covered |
| Edit meeting metadata | T-27 | PW-27-01 → PW-27-11 | `22-edit.spec.ts › edit meeting`; `90-mutations.spec.ts › edit meeting` | Covered |
| Delete a meeting | T-28 | PW-28-01 → PW-28-11 | `23-delete.spec.ts › delete meeting`; `90-mutations.spec.ts › delete meeting`, `› bulk delete`, `› toasts · delete and undo` | Covered |
| Add / edit / complete action items | T-24 | PW-24-06 → PW-24-10 | `19-action-items.spec.ts` (T24-G validation, T24-D rollback); `90-mutations.spec.ts › action items · editing` (T24-O cross-view badge sync) | Covered |
| All data persists | T-03, T-43 | T43-A, PW-24-03, PW-31-01 | pytest round-trips in `backend/tests/` (T-43); `90-mutations.spec.ts` re-reads after reload; `25-comments.spec.ts › comments · threads` | Covered |
| Navigation and layout (library + detail) | T-07, T-18 | PW-07-\*, PW-18-\* | `03-shell.spec.ts › app shell`, `› URL as state`, `› responsive`; `04-sidebar.spec.ts` (+ `› mobile drawer`); `13-notepad.spec.ts › notepad shell`, `› narrow viewports` | Covered |
| Transcript and summary panels | T-20, T-23 | PW-20-16, PW-23-16 | `13-notepad.spec.ts › notepad shell` (panels, resize, scroll containment); `15-transcript.spec.ts`; `18-summary.spec.ts` | Covered |
| Forms, modals, search, filters | T-10, T-26 | PW-10-03, PW-26-\* | `07-primitives.spec.ts › primitives`, `› reduced motion`; `21-create.spec.ts`; `09-filters.spec.ts` | Covered |
| Notifications / toasts | T-09 | PW-09-01 → PW-09-10 | `06-toasts.spec.ts › toasts · behaviour`, `› coming soon`; `90-mutations.spec.ts › toasts · delete and undo` | Covered |
| Settings placeholders | T-30 | PW-30-04, PW-30-05 | `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Placeholder: live bot | T-30.6 | PW-30-03 | `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Placeholder: STT | T-29, README | — | README section; the plan maps no E2E here (pipeline is mocked by design) | N/A (docs) |
| Placeholder: integrations | T-30.3 | PW-30-01 | `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Placeholder: team/sharing | T-30.4 | PW-30-01 | `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Placeholder: auth | T-30.8 | PW-30-06 | `24-placeholders.spec.ts › placeholder surfaces` | Covered |
| Bonus: comments / highlights / soundbites | T-31/32/33 | PW-31-\*, PW-32-\*, PW-33-\* | Comments: `25-comments.spec.ts › comments · threads on transcript lines`. Highlights: **pending** — `feat/T-32-highlights` (in progress elsewhere). Soundbites: **pending** — `feat/T-33-soundbites` (in progress) | Partial |
| Bonus: export | T-34 | PW-34-\* | **Pending** — `feat/T-34-export` (in progress) | Pending |
| Bonus: global search | T-35 | PW-35-\* | `24-search.spec.ts › global search` (page, deep links, filters); `05-topbar.spec.ts › topbar` (dropdown, grouping, history) | Covered |
| Bonus: tags & filtering | T-36 | PW-36-\* | **Pending** — `feat/T-36-tags` (in progress) | Pending |
| Bonus: LLM Q&A chat | T-37 | PW-37-\* | **Pending** — `feat/T-37-askfred` (in progress) | Pending |
| Bonus: dark mode | T-38 | PW-38-\* | **Pending** — `feat/T-38-dark-mode` (in progress). `02-tokens.spec.ts › design tokens` already pins the token layer both themes read from | Pending |

When a pending branch merges, its spec lands in `tests/` under the same
numbering scheme and its row above flips to Covered — this file is updated in
the same commit.

## Test counts

Measured with `npx playwright test --list` on `test/T-39-playwright-infra`
(2026-07-27): **382 tests across 29 spec files**, split into the `read-only`
project (parallel readers) and the `mutations` project (serial writers, tagged
`@mutates` — see the project split rationale in `playwright.config.ts`).
The suite is still growing on this branch; the listing is authoritative.

| File | Tests | Covers |
|---|---:|---|
| `00-smoke.spec.ts` | 3 | Scaffold boot check (T-01.10): health, /docs, token layer |
| `02-tokens.spec.ts` | 5 | Design tokens (T-02) |
| `03-shell.spec.ts` | 18 | App shell, URL-as-state, responsive (T-03/T-07) |
| `04-sidebar.spec.ts` | 18 | Sidebar, collapse, mobile drawer (T-07) |
| `05-topbar.spec.ts` | 19 | Topbar, global-search dropdown (T-08, T-35) |
| `06-toasts.spec.ts` | 14 | Toasts, coming-soon surfaces (T-09) |
| `07-primitives.spec.ts` | 26 | The 20 UI primitives (T-10) |
| `08-notebook.spec.ts` | 22 | Notebook list fidelity (T-12) |
| `09-filters.spec.ts` | 23 | Search, filters, sorting (T-13) |
| `10-bulk.spec.ts` | 15 | Bulk selection, pagination (T-14) |
| `11-details.spec.ts` | 11 | Details drawer (T-15) |
| `12-states.spec.ts` | 12 | Loading / empty / error states (T-16) |
| `13-notepad.spec.ts` | 12 | Notepad shell, panels, title editing (T-18) |
| `14-player.spec.ts` | 15 | Media player (T-19) |
| `15-transcript.spec.ts` | 15 | Transcript panel, virtualisation (T-20) |
| `16-sync.spec.ts` | 14 | **Transcript ↔ player sync (T-21)** |
| `17-find.spec.ts` | 14 | Find in transcript, smart search (T-22) |
| `18-summary.spec.ts` | 14 | Summary panel, outline, flyout (T-23) |
| `19-action-items.spec.ts` | 10 | Action items, read paths (T-24) |
| `20-transcript-edit.spec.ts` | 5 | Transcript editing, read paths (T-25) |
| `21-create.spec.ts` | 7 | Create modal, rejection paths (T-26) |
| `22-edit.spec.ts` | 7 | Edit modal, read paths (T-27) |
| `23-delete.spec.ts` | 4 | Delete dialog, read paths (T-28) |
| `24-placeholders.spec.ts` | 8 | Placeholder surfaces (T-29/T-30) |
| `24-search.spec.ts` | 7 | Global search page (T-35) |
| `25-comments.spec.ts` | 10 | Comments & threads (T-31) |
| `90-mutations.spec.ts` | 33 | Every write path, serial (`@mutates`) |
| `98-smoke.spec.ts` | 12 | Post-deploy smoke, `@smoke` (T-40.13) |
| `99-capture.spec.ts` | 9 | Screenshot capture harness |

## How to run

```bash
cd e2e

# Full suite. Playwright boots the backend on :8100 (fresh-seeded e2e.db) and a
# production frontend build on :3100 — no manual steps from a cold clone.
npm test

# One project at a time (readers are parallel; writers are serial):
npx playwright test --project=read-only
npx playwright test --project=mutations

# Smoke (12 tests, <60s) against the locally booted stack:
npx playwright test 98-smoke --project=read-only

# Smoke against the DEPLOYED site — catches "works locally, broken in prod":
SMOKE_URL=http://8.231.115.48:8600 npx playwright test 98-smoke --project=read-only

# If :8100/:3100 are taken on your machine (reuseExistingServer is deliberately
# false — ADR-010), move the stack instead of killing whatever owns the port:
E2E_BACKEND_PORT=8140 E2E_FRONTEND_PORT=3140 npm test

# Interactive / debugging / report:
npm run test:ui
npm run test:debug
npm run report
```

Notes for the deployed smoke run: the tests are read-only and seed-resilient by
design (shape and count assertions, never exact strings — except the five
canonical summary section names, which are spec). Behind nginx only `/api/*` is
proxied, so the FastAPI `/docs` assertion runs only against a directly reachable
backend.
