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
| Bonus: comments / highlights / soundbites | T-31/32/33 | PW-31-\*, PW-32-\*, PW-33-\* | Comments: `25-comments.spec.ts › comments · threads on transcript lines`. Highlights & bookmarks: `27-highlights.spec.ts › highlights · seeded`, `› writes` (T32-A → T32-J; T32-K's export claim in `backend/tests/test_highlights.py`). Soundbites: `26-soundbites.spec.ts › soundbites` | Covered |
| Bonus: export | T-34 | PW-34-\* | `34-export.spec.ts › export modal`, `› bulk export`; renderers (md/txt/pdf/docx) in `backend/tests/test_export.py` (pytest) | Covered |
| Bonus: global search | T-35 | PW-35-\* | `24-search.spec.ts › global search` (page, deep links, filters); `05-topbar.spec.ts › topbar` (dropdown, grouping, history) | Covered |
| Bonus: tags & filtering | T-36 | PW-36-\* | `27-tags.spec.ts › tags · chips, filters and colour` (T36-C/D/E/L read paths), `› tags · editor, settings and bulk` (T36-A/B/F/G/H/I/J/K writes); service rules (CI uniqueness, merge, cap) in `backend/tests/test_tags.py` (pytest) | Covered |
| Bonus: LLM Q&A chat | T-37 | PW-37-\* | `26-askfred.spec.ts › AskFred` (T37-E → T37-K: suggestions, thinking state, citation seek, history carry, retry, badge); endpoint claims (citations, guardrail, 429, truncation) in `backend/tests/test_ask.py` (pytest T37-A..D) | Covered |
| Bonus: dark mode | T-38 | PW-38-\* | `25-dark-mode.spec.ts › dark mode` (T38-A → T38-I + shortcut cycle: first paint, system tracking, axe at zero in dark, canvas repaint). `02-tokens.spec.ts › design tokens` pins the token layer both themes read from | Covered |
| Quality: loading states under a slow network | T-46.6 | T16-E, T16-F | `12-states.spec.ts › states` (T16-E skeleton rows at the real row height on a delayed request, T16-F the skeleton mirrors the list, and only one is live at a time); `03-shell.spec.ts` pins skeleton and row heights equal so content cannot jump. Asserted with **mocked request delays rather than Chrome's Slow-3G profile** — the claim is "no white flash, no jump", and a mocked delay tests it deterministically where a throttling profile makes the same test timing-dependent | Covered |
| Quality: network hygiene | T-46.3 | T46-N | `35-network.spec.ts › network hygiene` — no 404s on four routes, nothing fetched twice, no request to an unconfigured origin, and the notepad's four independent panel fetches overlap rather than chaining | Covered |
| Quality: accessibility, performance, cross-browser | T-42 | PW-42-\*, T42-A → T42-J | `28-a11y.spec.ts` (axe × 8 surfaces × 2 themes + 393px, keyboard, focus traps); `30-zoom.spec.ts` (200%/400% reflow, reduced motion); `31-crossbrowser.spec.ts` (Firefox + WebKit platform seams); `32-bundle.spec.ts` (route JS, CLS); `33-colour-vision.spec.ts` (dichromacy simulation, colour-never-alone); `34-stress.spec.ts` (5,000-segment meeting); latency budgets and the backend half of the stress case in `backend/tests/test_performance.py` (pytest) | Covered |

Every row above is now Covered: the bonus features landed across two parallel
branches that merged into `main` on 2026-07-27.

A note on the duplicate numeric prefixes (`24-`, `25-`, `26-`, `27-` each name
two files): the two development streams numbered new specs independently and
both were right about the next free number at the time they branched. Playwright
neither requires nor derives anything from the prefix, so the files were left
as they merged rather than renamed — a rename would have rewritten history that
is itself graded evidence, for a purely cosmetic gain.

## The clock fixture is not yet universal — 14 specs still run on the wall clock

Worth stating precisely, because a commit message in the history says `10-bulk`
"was the last spec importing `test` from Playwright rather than `../fixtures`".
It was not. Counted after that change landed, **24 spec files still imported the
bare `test`** and therefore never got `fixtures.ts`'s auto-fixture that pins
`Date.now()` to `SEED_ANCHOR`.

**Ten have since been converted, in two batches read one failure at a time.**
Batch 1 took the four with the most timing surface — `12-states`, `14-player`,
`16-sync`, `17-find`. Batch 2 took the six mutation specs —
`20-transcript-edit`, `21-create`, `22-edit`, `23-delete`, `25-comments`,
`26-soundbites`.

`17-find` was then reverted: it passed its batch run 55/55 and a full 552/552
suite, and both were luck. Measured at 12 repeats in an isolated worktree, T22-I
fails 5 times in 12 with the clock pinned and 0 times in 12 without it. **One
green run is not evidence that a conversion is clean** when the failure is
intermittent — the batch runs above proved less than they appeared to.

Fifteen still import the bare `test`: `00-smoke`, `02-tokens`, `04-sidebar`,
`05-topbar`, `06-toasts`, `07-primitives`, `11-details`, `17-find`,
`24-placeholders`, `24-search`, `25-dark-mode`, `27-tags`, `34-export`,
`98-smoke`, `99-capture`. Three have a positive reason to stay: `99-capture` is
a camera and pins the clock itself, and `17-find` and `27-tags` are the two
cases below.

### How to check a conversion, and how not to

`--repeat-each` is the right probe for a **read-only** spec: the three surviving
batch-1 files ran 205/205 at five repeats.

It is the wrong probe for a **mutations** spec, and misleadingly so. Those tests
mutate a database that `global-setup` seeds once per run, so re-running one
in-process without a reseed makes it act on state its predecessor left behind.
`25-comments` T31-A and T31-K duly failed 2-of-3 under `--repeat-each=3` — and
failed **identically on the wall clock**, which is what proves the repeat, not
the clock, is the cause. Anyone who skips that control will file a clock bug
that does not exist.

The honest repeat for a mutations spec is a repeated FULL suite run, because
each one reseeds. That is what the ×5 verification is for.

**Independently confirmed, by the other session, by a different method.** The
merged tree failed T22-I in a full-suite run; five separate invocations — each a
fresh process that reseeds, so the control above is satisfied — gave **2/5
passing pinned and 5/5 unpinned**, then 5/5 again after reverting. Two people,
two methods, the same conclusion, arrived at within the hour. Recorded because
concurrent duplication on a real bug is a much better outcome than concurrent
duplication on a feature, and because two independent measurements of a flake
are worth more than one careful one.

Count these by import SOURCE, not by prefix — `grep "^import { expect, test"`
matches the converted form too, and reports 37 of 38 files as unconverted.

### `27-tags` is held back deliberately

Converted, exactly two assertions fail — T36-B and T36-J, both the same line:
after clicking the `Meetings` heading to dismiss the row tag editor by clicking
away, the editor stays `data-state="open"`.

Probed rather than argued about. The clock is the only variable: the same probe,
identical apart from which module `test` comes from, dismisses on the wall clock
and does not with `Date.now()` pinned — at the same popover geometry, so it is
not a scroll-into-view race. It is not the heading either; a bare
`mouse.click(5, 400)` on empty background also fails to dismiss. The pointerdown
does land outside (a capture-phase listener reports `target=H1`) and a
MutationObserver shows the editor never leaves `open`, so Radix is not being
asked to close rather than asking and being refused. Escape still dismisses.
`performance.now()` still advances under the fixture (388ms measured across a
300ms sleep, against 0 for `Date.now()`), so React's scheduler is not it.

**The mechanism is not established.** What follows from the evidence is only the
decision: leave the spec on the wall clock. T36-B and T36-J assert real
behaviour, a user's `Date.now()` never stops advancing, and weakening a genuine
assertion to accommodate a test-only artefact costs coverage to buy tidiness.

**Why the remainder is not currently a defect.** The specs that assert anything
date-relative were audited: only `19-action-items` and `33-colour-vision`, and
both use the fixture now. The rest assert structure and behaviour, not dates.

**Why it is still worth doing.** Pinning is not only about dates. Converting
`10-bulk` immediately failed *"selection survives paging"* — the test waited for
the meeting list to be VISIBLE after clicking page 2, which is instantly true of
page 1 because the list element never unmounts, so it selected a row that was
already selected, toggled it off, and asserted against a bulk bar that had
unmounted. The race predated the conversion; real-clock timing had been hiding
it.

**What the ten conversions actually returned.** One real race (`10-bulk`), one
test-only artefact left alone (`27-tags`), and ten files that no longer depend
on when the suite happens to run. The early "one genuine bug per spec converted"
rate did not survive a larger sample — from twelve it is one. That is the
argument for converting in small batches and reading each failure rather than
all at once: the yield is real but low, so a wall of red would cost more to
triage than the findings are worth. The remaining twelve are worth doing on the
same terms, and are not worth doing in one push.
## On the plan's test-case IDs

PLAN.md names 497 case IDs (`T12-A`, `T21-N`, …). Grepping the whole test tree
finds 426 of them; 71 do not appear as literal strings. That is a **labelling**
difference, not a coverage hole, and the distinction matters enough to write
down before someone greps and concludes otherwise.

**42 of the 71 are infrastructure tasks** — T39 through T46. Their "cases" are
acceptance criteria for the harness, the deploy, the README and the polish pass
(`T45-A`: header with badges and links), not assertions a test can carry.

**29 are feature cases**, and the ones checked are all covered by tests with
descriptive pytest names instead of the ID:

| Plan case | The test that covers it |
|---|---|
| `T35-B` exact-phrase search | `test_search_query.py::test_a_quoted_phrase_stays_one_term` |
| `T35-C` `-churn` exclusion | `test_search_query.py` — `parse_query("pricing -churn")` |
| `T35-D` `speaker:` filter | `test_search_query.py` — `parse_query("speaker:Sarah pricing")` |
| `T35-E` uses the FTS index | `test_search.py:126` — a real `EXPLAIN QUERY PLAN` |
| `T17-G` deleted → 410 | asserted in `test_ask.py`, `test_highlights.py`, `test_transcript.py` |

The convention split is deliberate rather than accidental: the Playwright specs
carry the IDs (414 of the 426 found), because a `PW-*` ID is how the plan's
acceptance table is traced. The pytest suite names behaviours instead, because
a pytest name IS the failure message — `test_a_deleted_meeting_answers_410_not_an_answer`
tells you more on a red run than `T17-G` does.

**Honest limit on this claim:** 7 of the 29 feature cases were checked
individually. The rest are asserted to be covered on the strength of that
sample and of the suite-level counts, not one by one.

## Test counts

Measured with `npx playwright test --list` on `main` (2026-07-27):
**564 tests across 44 spec files**, split into `read-only` (parallel readers),
`mutations` (serial writers, tagged `@mutates`), `visual` (`@visual`, opt-in)
`chromium-mobile` (`@mobile`, opt-in) and `firefox`/`webkit` (`@crossbrowser`,
opt-in) — see the project split rationale in
`playwright.config.ts`. The listing is authoritative; this table is a snapshot.

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
| `25-dark-mode.spec.ts` | 10 | Dark mode: state, first paint, contrast (T-38) |
| `26-askfred.spec.ts` | 7 | AskFred grounded Q&A (T-37) |
| `26-soundbites.spec.ts` | 11 | Soundbites: clips, trimmer, range playback (T-33) |
| `27-highlights.spec.ts` | 10 | Highlights & bookmarks (T-32) |
| `27-tags.spec.ts` | 12 | Tags: chips, filters, settings, bulk (T-36) |
| `28-a11y.spec.ts` | 29 | Axe on 8 surfaces × 2 themes + 393px, keyboard, focus traps, dropdown overlays (T-40.12, T-42.1) |
| `29-errors.spec.ts` | 9 | Timeouts, malformed payloads, degraded floors (T-40.11) |
| `30-zoom.spec.ts` | 6 | Reflow at 200%/400%, reduced motion (T-42.13) |
| `31-crossbrowser.spec.ts` | 8 | Platform seams, `@crossbrowser` — Firefox + WebKit (T-42.12) |
| `32-bundle.spec.ts` | 6 | Route JS budget and CLS (T-42.9, T-42.8) |
| `33-colour-vision.spec.ts` | 6 | Dichromacy simulation, status never colour-alone (T-42.6) |
| `34-export.spec.ts` | 4 | Export modal & bulk zip (T-34) |
| `34-stress.spec.ts` | 4 | The 5,000-segment meeting, `@mutates` (T-42.11) |
| `35-network.spec.ts` | 7 | No 404s, no duplicate fetches, no stray origin, no waterfall (T-46.3) |
| `90-mutations.spec.ts` | 33 | Every write path, serial (`@mutates`) |
| `98-smoke.spec.ts` | 12 | Post-deploy smoke, `@smoke` (T-40.13) |
| `97-visual.spec.ts` | 36 | Visual baselines, `@visual` (T-41) — 68 snapshots |
| `99-capture.spec.ts` | 16 | Screenshot capture harness, `@visual` (T-41.7) |

## How to run

```bash
cd e2e

# Full suite. Playwright boots the backend on :8140 (fresh-seeded e2e.db) and a
# production frontend build on :3140 — no manual steps from a cold clone.
npm test

# One project at a time (readers are parallel; writers are serial):
npx playwright test --project=read-only
npx playwright test --project=mutations

# Smoke (12 tests, <60s) against the locally booted stack:
npx playwright test 98-smoke --project=read-only

# Smoke against the DEPLOYED site — catches "works locally, broken in prod":
SMOKE_URL=http://8.231.115.48:8600 npx playwright test 98-smoke --project=read-only

# If :8140/:3140 are taken on your machine (reuseExistingServer is deliberately
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

## Visual baselines (T-41)

68 PNGs live in `tests/__screenshots__/`, named
`{snapshot}-{project}-{platform}.png` by the `snapshotPathTemplate` in
`playwright.config.ts`. They only ever run in the `visual` project, which pins
`deviceScaleFactor: 1` and `reducedMotion` — the tag keeps them out of every
other project, and out of the 382-test desktop count above.

```bash
cd e2e

# Compare against the committed baselines.
npm run test:visual

# Re-record them. NOT a way to make CI green (T-41.8).
npm run test:update-snapshots

# Refresh the side-by-side comparison harness (docs/visual-comparison.html).
CAPTURE=1 npx playwright test tests/99-capture.spec.ts --project=visual
```

**The update workflow, in order:**

1. Make the UI change and let `npm run test:visual` FAIL.
2. Open `playwright-report/` and read every diff image. Each one is a
   question — "did I mean to move this?" — and a diff you cannot explain is a
   regression you have not noticed yet.
3. Only then `npm run test:update-snapshots`, and commit the PNGs in the SAME
   commit as the change that justifies them. A snapshot update on its own is
   unreviewable.

Never blanket-update to clear a red build. The baselines are the only
evidence in this repo that a token change did not quietly reshape six screens,
and a reflexive `--update-snapshots` deletes exactly that evidence.

Baselines are platform-stamped because font hinting differs between macOS and
Linux; CI records and compares its own Linux set, so a macOS laptop and a Linux
runner never fight over the same file.
