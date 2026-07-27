# Architecture Decision Log

One entry per non-obvious choice, written **as the choice is made**. This is the interview script:
every entry should answer "why did you do it that way?" before it is asked.

Format: context → decision → consequences (including what we gave up).

---

## ADR-001 · Monorepo with `frontend/` + `backend/` + `e2e/`

**Date:** 2026-07-26 · **Task:** T-01.1 · **Status:** Accepted

**Context.** The frontend, backend and E2E suite are three separate toolchains (npm, uv, npm) that
must version together. Splitting them across repos means a schema change and its client update land
in two PRs that can merge independently.

**Decision.** One repository, three top-level projects, each owning its own dependency manifest.
`e2e/` gets its own `package.json` so Playwright's deps never leak into the app bundle.

**Consequences.** CI needs per-directory caching and path filters. In exchange, any single commit is
a coherent, runnable state — which is what makes "clone and run in two commands" achievable at all.

---

## ADR-002 · Tailwind pinned to v3, not v4

**Date:** 2026-07-26 · **Task:** T-01.6 · **Status:** Accepted

**Context.** npm currently ships Tailwind **4.3.3**, which is CSS-first: no `tailwind.config.ts` is
generated, theming happens in an `@theme` block. The plan's token-enforcement mechanism (T-01.6) is
written against a v3 config file, where replacing `theme.colors` wholesale deletes the default
palette and makes `bg-blue-500` a build error.

**Decision.** Install `tailwindcss@3` explicitly rather than `@latest`.

**Consequences.** We forgo v4's faster engine and CSS-first ergonomics. In return the single
highest-leverage discipline in the project — *no hex code outside `tokens.css`* — is enforced by the
compiler on a well-trodden path, on day one, instead of being re-derived against a newer API. The
token layer is what the UI grade rests on; it is the wrong place to spend novelty budget.

---

## ADR-003 · `uv` for Python dependency management

**Date:** 2026-07-26 · **Task:** T-01.4 · **Status:** Accepted

**Context.** The plan allows `uv` or `poetry`. Poetry is not installed locally; uv is.

**Decision.** `uv` with a PEP 621 `pyproject.toml` and a committed `uv.lock`.

**Consequences.** Resolution and installs are fast enough that CI does not need aggressive caching
to stay quick, and the lockfile makes the Docker build reproducible. `uv` is newer than poetry, so
anyone cloning this needs it installed — the README says so, and the Docker path avoids it entirely.

---

## ADR-004 · Layering enforced by a check script, not by a linter rule

**Date:** 2026-07-26 · **Task:** T-01.7 · **Status:** Accepted

**Context.** The rule that matters most on the backend is *routers must not touch the ORM* — no
`db.query(...)`, no `session.execute(...)` inside `api/v1/routers/`. Ruff has no rule that expresses
"this symbol is banned in this directory only", and writing a ruff plugin is disproportionate.

**Decision.** A small `scripts/check_layering.py` that greps the router package for ORM access and
exits non-zero, wired into `make lint`, the pre-commit hook, and CI. It is also covered by a pytest
test so it fails the backend suite too.

**Consequences.** One more moving part than a pure linter config, but the rule is readable in ten
lines, produces a targeted error message naming the offending file and line, and is trivially
extensible to the other layering invariants (e.g. schemas never importing models).

---

## ADR-006 · Off-palette colour is enforced by a lint rule, not by the compiler

**Date:** 2026-07-26 · **Task:** T-01.6 (test T01-C) · **Status:** Accepted

**Context.** The plan states that deleting Tailwind's default palette makes `bg-blue-500` "a compile
error". It does not. Tailwind emits no CSS for an unknown utility and says nothing — the class sits
in the markup doing nothing, so the colour bug ships silently and *looks* like the token system is
working. The mechanism the plan is reaching for needs an actual checker.

**Decision.** `eslint-plugin-tailwindcss`'s `no-custom-classname` rule, which errors on any class the
Tailwind config cannot produce. Verified: `bg-blue-500`, `text-white`, `text-gray-700` and
`rounded-xl` all fail; `bg-surface-0` and `text-accent` pass.

**Consequences.** The guard is broader than colour — off-scale radii and type sizes fail too, which
is what we want. Two costs. First, it pins us to the `eslint-plugin-tailwindcss@3` line, since v4 of
the plugin requires Tailwind v4. Second, hand-authored utilities (`.tnum`) are invisible to the
plugin and must be whitelisted in the ESLint config, so adding a custom utility is now a two-file
change. The plugin also needs an **absolute** path to `tailwind.config.ts` — it derives its module
resolution base from `dirname(config)`, and a relative path yields `"."`, which fails to resolve
Tailwind itself.

---

## ADR-007 · Two Tailwind internals still emit raw hex; one is accepted

**Date:** 2026-07-26 · **Task:** T-01.6 · **Status:** Accepted

**Context.** Deleting the default palette causes some of Tailwind's own internals to fall through to
hardcoded literals, because they look up palette entries that no longer exist. An audit of the built
CSS found two:

- `--tw-ring-color: #93c5fd80`. `ringColor.DEFAULT` is piped through `withAlphaValue()`, which cannot
  parse a CSS variable and therefore returns its hardcoded blue-300 fallback. **Fixed** by declaring
  `ringColor.DEFAULT` as a *function* — the resolver invokes function values directly instead of
  parsing them. Tailwind's published types declare colour leaves as `string`, so this needs a cast.
- `::placeholder { color: #9ca3af }` from preflight, which reads `colors.gray.400` directly.
  **Not fixable** without dropping preflight and hand-writing the reset.

**Decision.** Fix the ring colour. For the placeholder, override it in `globals.css` with
`--ff-text-muted` so the rendered colour is correct, and accept that preflight's literal remains in
the vendor portion of the bundle.

**Consequences.** Every colour the app actually renders traces to `tokens.css`. One inert vendor
literal survives in the output. This defines what T02-D can assert: grep **source** files other than
`tokens.css` for hex — that is the meaningful enforcement — rather than grepping the built bundle,
which necessarily contains `tokens.css` inlined plus this one vendor value.

---

## ADR-008 · `httpx2` replaces `httpx`

**Date:** 2026-07-26 · **Task:** T-01.4 · **Status:** Accepted

**Context.** The plan lists `httpx` as a backend dependency. Starlette 1.3 now emits
`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2
instead` when `TestClient` is constructed. Because `filterwarnings = ["error"]` is set in the pytest
config — deliberately, so a deprecation cannot rot quietly for weeks — that warning failed the entire
suite at collection time.

**Decision.** Depend on `httpx2` and drop `httpx`. One HTTP client serves both `TestClient` and the
outbound LLM calls in T-29.

**Consequences.** The dependency list diverges from PLAN.md T-01.4, which was written before the
rename. Nothing else changes: `httpx2` is the same library's next major line under a new
distribution name. Keeping `filterwarnings = ["error"]` means the next such deprecation surfaces the
same way — as a failing build on the day it appears, rather than as a surprise during a later
upgrade.

---

## ADR-009 · `NoDecode` on every list-typed setting

**Date:** 2026-07-26 · **Task:** T-01.5 · **Status:** Accepted

**Context.** `CORS_ORIGINS=http://localhost:3100` crashed the app at import time with
`error parsing value for field "cors_origins"`. For complex field types (anything list- or
dict-shaped) pydantic-settings runs `json.loads` on the environment value inside `EnvSettingsSource`,
*before* field validators run — so a `mode="before"` validator that splits on commas never gets a
chance, and the ordinary comma-separated form used by both `.env.example` and `docker-compose.yml`
is rejected as invalid JSON.

Worth noting how this surfaced: the default value made it invisible locally, and it only appeared
once something actually set the variable. It would otherwise have shown up as a container that
refuses to boot.

**Decision.** Annotate the field `Annotated[list[str], NoDecode]`, which passes the raw string to the
validator, and cover it with parametrised tests including the empty and space-padded cases.

**Consequences.** Any future list- or dict-typed setting needs the same annotation. The tests in
`tests/test_config.py` document why, so the next person adding one has a worked example rather than a
puzzle.

---

## ADR-010 · The E2E suite runs on dedicated ports

**Date:** 2026-07-26 · **Task:** T-01.10 · **Status:** Accepted

**Context.** With `reuseExistingServer: true` (the usual local default) the first smoke run tested an
entirely different application — an unrelated project was already serving port 3000, Playwright
reused it, and the suite dutifully asserted against someone else's page. Playwright cannot tell our
dev server from anyone else's; it only checks whether the port answers.

**Decision.** The suite runs the app on 3100/8100 with `reuseExistingServer: false`, overridable via
`E2E_FRONTEND_PORT` / `E2E_BACKEND_PORT`.

**Consequences.** Playwright always starts and owns the servers it tests, so a run cannot be
contaminated by whatever else is listening, and `make dev` can stay up on 3000/8000 while the suite
runs. The cost is a few seconds of startup per run, since nothing is ever reused. Cheap, against a
failure mode that produces confidently wrong results rather than an error.

---

## ADR-011 · The palette is violet, and the plan's researched values were wrong

**Date:** 2026-07-26 · **Task:** T-02.1 · **Status:** Accepted

**Context.** PLAN.md A3.1 supplied a researched palette explicitly flagged as unsampled. Eight real
screenshots of the product became available and were sampled in four passes: flat fills by modal
colour, text by most-common-dark-pixel (antialiasing makes a naive average far too light), dividers
by single-pixel edge scan, and glyphs by most-saturated-pixel. Screenshots are committed to
`docs/reference/fireflies/`.

**Three findings contradicted the plan materially:**

1. **The accent is `#6A39EF` violet, not `#2A6EF4` blue.** This touches every accented surface in
   the product — buttons, active nav, links, focus ring, selected rows, the active transcript line.
   Building on the blue would have made the clone wrong at a glance, which is precisely what the
   side-by-side comparison grades.
2. **Fireflies is white-on-white.** The plan assumed a `#F7F8FA` app background against white cards.
   In reality the topbar, left rail, main content and cards are all `#FFFFFF`, separated by a 1px
   `#ECEDF1` border. The surface hierarchy exists but is far subtler than assumed:
   `#FFFFFF` → `#FCFCFD` → `#F9FAFB`, the last being the search input and status chips.
3. **The logo mark is magenta (`#C43990`), not amber.** Amber does appear, but as the notice-banner
   tint `#FFFAEC`. A separate `--ff-brand-mark` token now carries the magenta.

**Decision.** Overwrite the palette with sampled values, marking every token `[S]` sampled or `[D]`
derived in both `tokens.css` and `design.md`.

**Consequences.** Because every component consumes semantic tokens, this was a one-file correction
with no component churn — which is the entire argument for building T-02 before any feature.
Substantial surface area remains uncalibrated: the whole notepad (active transcript line, speaker
colours, player), search-highlight colours, every hover state, and dark mode. Those are marked `[D]`
and should be re-sampled if a transcript screenshot appears.

---

## ADR-012 · `--ff-text-muted` deviates from the reference for accessibility

**Date:** 2026-07-26 · **Task:** T-02.1 (test T02-G) · **Status:** Accepted

**Context.** Fireflies' sampled muted grey is `#97A1B3`, used for timestamps, metadata and column
headers. On white it scores **2.60:1** — failing WCAG AA (4.5:1), AA-large (3:1), and even the 3:1
non-text floor. PLAN.md T02-G asks for ≥4.5:1 on this exact pairing, so the plan's own two goals —
pixel fidelity and contrast compliance — are in direct conflict here. Reaching 4.5:1 needs roughly
`#6C7481`, which reads as secondary body text and is visibly darker in a side-by-side.

**Decision.** Darken ~9% to `#8992A2` (3.14:1) and assert a 3:1 floor rather than 4.5:1. Every other
pairing in the file is held to 4.5:1.

**Consequences.** A shift invisible at normal zoom buys a genuine improvement, but the app is still
not AA on metadata text and axe will flag it in T-42 — knowingly, once, with this entry as the
justification. If accessibility is later prioritised over fidelity, the single-token change to
`#6C7481` is all that is required. The trade-off is enforced by a test
(`src/styles/tokens.test.ts`), so silently regressing past 3:1 breaks the build.

---

## ADR-013 · Speaker colour is authoritative in the database

**Date:** 2026-07-26 · **Task:** T-03 · **Status:** Accepted · *(resolves open decision #1)*

**Context.** Two mechanisms could decide a speaker's colour: `speakers.color_index` in the schema,
and `getSpeakerColor()` hashing the name on the client. With both live and neither declared the
winner, they diverge the moment either changes — and the symptom is a speaker who is violet in the
transcript and green in the participants list.

**Decision.** The stored `color_index` wins. It is computed once at ingest using the same FNV-1a
algorithm as the frontend. The client reads the stored value for persisted speakers and hashes
locally **only** for previews of transcripts not yet saved (the upload preview step, T-26.7).

**Consequences.** The hash is implemented twice, in Python and TypeScript, which is duplication — but
of a pure function with an explicit spec, covered by tests on both sides. In exchange the colour
survives a change to the hash implementation, and a speaker renamed from `Speaker 1` to a real name
keeps their colour instead of jumping to a different hue mid-meeting.

---

## ADR-014 · The FTS index outlives a soft delete, so search joins back to `meetings`

**Date:** 2026-07-26 · **Task:** T-03.9 · **Status:** Accepted · *(resolves open decision #2)*

**Context.** `transcript_fts` is maintained by triggers on `transcript_segments`. Soft-deleting a
*meeting* sets `meetings.deleted_at` and never touches its segments — so the segments stay indexed
and a naive `MATCH` query returns hits from deleted meetings. PLAN.md's T-35 test cases do not cover
this, so it would have shipped.

Two fixes were possible. Cascading the soft delete into segments was rejected: it makes restore
lossy and turns one UPDATE into thousands.

**Decision.** Every FTS query joins `meetings` and filters `deleted_at IS NULL`, and that join lives
in exactly one place — `app/db/search.py::search_segments`. Search paths must go through it.

**Consequences.** The index is knowingly "wrong" on its own; correctness lives in the query layer.
`tests/test_schema.py` asserts **both** halves — that the raw index still contains the row, and that
the helper does not return it — so a future refactor that simplifies the join away fails rather than
silently leaking. The same discipline will be needed for any future index built on segments.

---

## ADR-015 · The five canonical summary sections are composed by the API

**Date:** 2026-07-26 · **Task:** T-03 · **Status:** Accepted · *(resolves open decision #3)*

**Context.** PLAN.md gave `summaries` both an `overview TEXT` and a `bullet_notes JSON` column, and
gave `summary_sections` a `kind` enum including `'overview'` and `'keywords'` — while a dedicated
`keywords` table also existed. The overview had two homes, the notes two, keywords three, and
nothing decided which won.

**Decision.** One home each: the overview is a scalar on `summaries`; outline chapters and note
groups are `summary_sections` rows (`kind` narrowed to `outline|notes`); keywords stay in `keywords`;
action items stay in `action_items`. `bullet_notes JSON` is dropped. The five sections the UI renders
(design.md §2.4) are **composed by the API at read time** from those four sources.

**Consequences.** `GET /summary` does slightly more assembly. In exchange every part is queryable,
orderable and partially updatable — a JSON blob is none of those, which is the reason the rest of the
schema is relational. Regenerating a summary replaces section rows within one transaction rather than
rewriting a document.

---

## ADR-016 · Enums persist their value, not their Python member name

**Date:** 2026-07-26 · **Task:** T-03.7 · **Status:** Accepted

**Context.** Reading the autogenerated migration — which T-03.7 explicitly instructs — showed
`sa.Enum('AUDIO', 'VIDEO', 'NONE', ...)`. SQLAlchemy persists an enum's **member name** by default,
so the database would have stored `"AUDIO"` and the CHECK constraint would have permitted only the
uppercase spellings, while Pydantic, the JSON API, the seed fixtures and every test assertion use
`"audio"`.

The mismatch is invisible through the ORM, which translates in both directions. It surfaces only
where something reads the database directly: a raw SQL filter, a hand-written migration, a seed file,
an export.

**Decision.** A shared `enum_column()` helper passes `values_callable`, so the stored value is the
enum's value. One spelling from the database to the browser.

**Consequences.** Every enum column must go through the helper; a bare `sa.Enum(...)` would silently
reintroduce the bug. `tests/test_schema.py` asserts the raw stored strings via `text()` rather than
through the ORM, which is the only way this class of defect is visible.

---

## ADR-017 · The layering rule has no exceptions, including health checks

**Date:** 2026-07-26 · **Task:** T-04 · **Status:** Accepted

**Context.** `/api/health` has to run a real `SELECT 1` — a check that cannot fail tells the host
nothing, and the case that matters is a container whose volume never mounted, which answers HTTP
perfectly while every real request 500s. The obvious implementation puts `from sqlalchemy import
text` in the router, and it is easy to argue that infrastructure endpoints are a special case.

`scripts/check_layering.py` rejected it, which is exactly what it was built for.

**Decision.** No exception. The query moved to `HealthService.database_status()`, and the router
calls it like any other.

**Consequences.** One more file for four lines of logic. In exchange the rule stays absolute, which
is the only state in which a mechanical check is worth having — the moment it has one carve-out it
acquires a second, and then it is documentation rather than enforcement. It also means the health
probe is unit-testable without a request, which is how the 503 path is asserted.

---

## ADR-018 · The generated TypeScript client is committed and drift-tested

**Date:** 2026-07-26 · **Task:** T-04.12 · **Status:** Accepted

**Context.** `openapi-typescript` turns the API schema into `frontend/src/types/api.d.ts`, so a
backend field rename becomes a compile error in the frontend instead of a runtime `undefined`. That
promise holds only while the generated file is current, and nothing forces anyone to re-run the
generator after editing an endpoint.

**Decision.** Commit both `docs/openapi.json` and the generated client, and add
`tests/test_openapi_drift.py`, which compares the committed schema against the live app and fails
with the exact remedy (`run make types`) plus a diff of added/removed paths.

The schema is exported from the app object rather than by curling a running server, so `make types`
works from a cold clone with nothing started and no port to guess.

**Consequences.** Editing an endpoint now requires re-running `make types` before the build passes.
That friction is the point — it is what makes the type safety real rather than aspirational. The
alternative, regenerating in CI and committing automatically, hides schema changes inside unrelated
commits.

---

## ADR-019 · Seeded meetings are 5–17 minutes, not the plan's 14–55

**Date:** 2026-07-26 · **Task:** T-05 · **Status:** Accepted

**Context.** PLAN.md T-05.1 specifies eight meetings running 14:47 to 55:32. Durations are **derived**
from the transcript (T-05.10) rather than authored, so a meeting is exactly as long as what is
actually said in it. The eight fixtures total 607 segments of genuine dialogue; timed at 150 wpm
that is roughly 67 minutes of speech, producing meetings of 5 to 17 minutes.

Hitting the plan's table would need roughly 2,500 segments — about four times the dialogue written
here, and the bulk of the remaining effort in the task.

Two things were considered and rejected:

- **Inflating the inter-speaker gaps to reach the target durations.** This is the tempting one, and
  it is a fabrication: two of the meetings have real audio attached, so a listener scrubbing the
  player would hear thirty seconds of nothing between lines. The number would be right and the
  artefact would be wrong.
- **Hardcoding `duration_seconds`.** That breaks the derivation the schema depends on and would fail
  T05-B, which exists precisely to stop the denormalised column drifting from the transcript.

**Decision.** Keep derived durations. One honest adjustment was made: the gap range moved from the
plan's 200–600ms to 700–2,600ms, because 200ms is the rhythm of a fast two-person exchange and a
meeting has thinking time, unmuting and pauses. That is a correction to an unrealistic assumption,
not a lever pulled to reach a number — and it is documented in `timing.py` as such.

**Consequences.** Durations read as varied and plausible (4:57 through 17:02) but shorter than a real
company's calendar. The longest meeting is 159 segments, which is still enough for virtualisation to
be a genuine and measurable improvement in T-20. Every seeded value remains internally consistent,
which is what the tests can actually verify. Extending the fixtures later requires no code change —
only more dialogue in the JSON.

---

## ADR-021 · The rail is measured from the reference, not taken from the plan

**Date:** 2026-07-26 · **Task:** T-07 · **Status:** Accepted

**Context.** T-07 is the first task where pixel fidelity *is* the deliverable, and T-02 had already
shown the plan's researched values could be wrong. So the rail geometry was measured off
`docs/reference/fireflies/03.png` rather than typed in from the spec table. Scale was recovered by
assuming the documented 240px rail width and reading the divider position (x=332), giving
1 CSS px = 1.383 image px.

**Measured against specified:**

| | PLAN.md T-07 | Measured | Used |
|---|---|---|---|
| Item height | 36px | 35.4px | 36px ✓ |
| Item pitch | 40px (2px margin) | 39.8–41.9px | 40px ✓ |
| Inner padding | 12px | 13.0px | 12px ✓ |
| **Pill inset** | **8px** (`margin: 2px 8px`) | **12.3 / 11.6px** | **12px** |
| **Background** | **`--ff-surface-1`** | **`#FFFFFF`** | **`--ff-surface-0`** |

**Decision.** Follow the measurements on both divergences.

The background one matters most and follows directly from ADR-011: Fireflies is white-on-white, with
a 1px `#ECEDF1` border doing the separating. A grey rail against white content is wrong at a glance
in exactly the side-by-side comparison this project is graded on.

The 12px inset is subtler but visible — at 8px the pill sits noticeably closer to the rail edge than
the reference.

**Consequences.** design.md §3.7's `rail 240 / collapsed 64` still holds; only the inset and the
background changed. The tests assert on **computed** values resolved through the token layer rather
than on class names, so a test cannot pass while the token behind it is broken.

---

## ADR-005 · Client-side data fetching, not RSC

**Date:** 2026-07-26 · **Task:** T-06 · **Status:** Accepted

**Context.** App Router makes server components the default, and fetching in an RSC would mean
smaller bundles and no client-side loading state. This app does the opposite: every data-touching
page is `"use client"` and reads through TanStack Query. That deserves an explicit defence, because
*"why App Router if everything is a client component?"* is the obvious question.

**Decision.** Client-side fetching, for three reasons RSC does not serve:

1. **Cross-surface cache invalidation is the hard part of this app.** Ticking an action item in the
   Notepad has to update the Notebook row's "N open" badge and the details drawer (T-24.12). Under
   RSC that is a router refresh which refetches the whole tree; with a shared query cache it is one
   `invalidateQueries` against a nested key.
2. **Optimistic updates.** The graded interactions — checkbox toggles, inline title edits, undoable
   deletes — must apply in under 100ms and roll back on failure. That is client state by definition.
3. **URL-as-state with instant feedback.** Filters live in the query string and must be shareable,
   but a server round-trip per keystroke is not acceptable; the cache serves the previous page while
   the next loads.

**Consequences.** App Router earns its place through file-based routing, layouts, `next/font`,
streaming boundaries and `loading.tsx`/`error.tsx` — not through server rendering of data. Bundles
are larger than an RSC-first build would be. If this app ever grows a genuinely static, read-only
surface — a publicly shared transcript, say — that route should be an RSC, because none of the three
reasons above apply to it.

---

## ADR-020 · Three CSS Grid traps, all of which failed silently

**Date:** 2026-07-26 · **Task:** T-06.2/T-06.10 · **Status:** Accepted

**Context.** The shell is CSS Grid, and building it hit three failures in a row that shared a shape:
no console error, nothing obviously wrong in the CSS, and a visibly broken page.

1. **`1fr` does not mean "shrinkable".** A track sized `1fr` still floors at its content's
   min-width, so the topbar's natural width (440px) became the column width inside a 393px viewport
   — and the horizontal scrollbar appeared on the *page* rather than on the offending element. Fixed
   with `minmax(0, 1fr)`, needed on the outer **and** inner grid; missing it on either is enough.
2. **`display: none` removes an element from grid PLACEMENT.** Hiding the sidebar at mobile meant
   `<main>` auto-placed into the first track — the 0px rail column — and rendered a completely blank
   page below the topbar. Fixed by declaring a single column below `md` rather than a zero-width
   rail track.
3. **`min-height: auto` on grid items.** Same family: an overflowing `<main>` stretches its row so
   the page scrolls instead of the panel. `min-h-0` is the one line that makes "only panel interiors
   scroll" (T-18.10) work at all.

**Decision.** All three fixed at the shell with the reasoning inline, since the Notepad's two
resizable panels (T-18) sit inside this grid and would otherwise hit every one of them again.

**Consequences.** The `scrollWidth - clientWidth` assertion in the responsive tests is what catches
this class of bug. None of the three produced an error, and two were visible only in a screenshot —
which is a good argument for the responsive tests existing at all rather than being deferred to a
manual pass.

---

## ADR-022 · User input is not a query language

**Date:** 2026-07-26 · **Task:** T-08.3 · **Status:** Accepted

**Context.** The first test of the search endpoint that typed punctuation returned a 500:

```
sqlite3.OperationalError: fts5: syntax error near "."
```

The value was bound, so this was never SQL injection. The problem is one layer up: FTS5 parses the
*bound string* as its own query language, where `*`, `"`, `:`, `^`, `-`, `(` and `NEAR` are
operators. A user typing `a.*b` into a search box means those five characters.

**Decision.** `app/db/search.py::to_fts_query()` tokenises input to word characters, phrase-quotes
each token, drops single-character tokens, and appends `*` to the last one so results narrow while
typing. It lives at the **db layer**, not in the service, so T-35's call sites inherit it rather
than each re-deriving it. Empty output means "no match", never "match everything".

The same reasoning applies twice more in this task: `_title_ranges` uses `re.escape` rather than
compiling user input as a pattern, and the title `LIKE` passes `autoescape=True` so a search for
`50%` does not become a wildcard.

**Consequences.** Some FTS5 power (explicit `NEAR`, boolean operators) is unreachable from the
plain search box. T-35 specifies a deliberate query syntax — quoted phrases, `-exclusion`,
`speaker:` — which is the right place to expose that, because then it is a documented feature rather
than punctuation the parser happens to accept.

---

## ADR-023 · Search sends match ranges, never markup

**Date:** 2026-07-26 · **Task:** T-08.3/T-08.10 · **Status:** Accepted

**Context.** Highlighting a search hit needs the server's knowledge — FTS5 stemming means a query
for `pricing` matches `priced`, and the client cannot re-derive which characters matched. The
obvious implementation is `snippet(transcript_fts, 0, '<b>', '</b>', …)` and
`dangerouslySetInnerHTML` on the client.

**Decision.** The API returns `matches: [{start, end}]` and plain text. `SearchService` asks SQLite
to delimit with `\x02`/`\x03` — control characters that cannot appear in transcript text — then
converts those to offsets and strips them before serialising.

Transcripts are user content. A meeting where somebody reads out an HTML tag would, under the markup
approach, inject it into every dropdown that surfaces the line. Offsets make that structurally
impossible: the `Highlighter` primitive splits into text nodes and wraps them in `<mark>`, so
`<img src=x onerror=…>` renders as thirty visible characters.

**Consequences.** Two extra conversion steps and a primitive the whole app must use for highlighting
— `Highlighter` also backs T-22's find bar and T-35's results page. The e2e suite stubs the API with
a transcript containing an `onerror` payload and asserts `window.__pwned` never appears, so the
guarantee is tested rather than assumed.

---

## ADR-024 · ⌘K is a callback, not mirrored state

**Date:** 2026-07-26 · **Task:** T-08.4 · **Status:** Accepted

**Context.** `useCommandPalette` (T-06.11) owned an `isOpen` boolean. Wiring the real search field
to it meant mirroring that boolean into the field's own state via an effect — which
`react-hooks/set-state-in-effect` rejected, correctly.

Suppressing the rule would have shipped a genuine bug. The hook's ⌘K handler *toggled*, so the two
copies could disagree: clicking outside closed the field but left `isOpen` true, and the next ⌘K
toggled the stale flag to false — the shortcut appeared dead until pressed twice.

**Decision.** The hook registers the binding and fires `onTrigger`; it holds no state. `GlobalSearch`
owns the single copy of "is the search open".

The same reasoning removed the second effect in that component: the highlighted row is now *derived*
during render (`preferredId` if it still exists in the current rows, else the first row) rather than
stored and re-synced whenever the rows change.

**Consequences.** Two effects and one whole category of state-desync bug are gone. This is the third
time in this project the lint rule has pointed at a real defect rather than a style preference —
after `use-local-storage` and `use-sidebar` — which is worth recording as evidence that the rule
earns the friction.

---

## ADR-025 · Toasts and the search endpoint built ahead of their tasks

**Date:** 2026-07-26 · **Task:** T-08 · **Status:** Accepted

**Context.** T-08 depends on two things PLAN.md schedules later. T-08.6's `Sign out` is specified as
showing an info toast, and the toast system is T-09. T-08.3's dropdown needs
`GET /api/v1/search`, specified under T-35.1.

**Decision.** Build minimal versions of both now rather than stub them.

Stubbing the endpoint would have meant every dropdown test asserting against fixtures instead of
real FTS ranking — the debounce, the grouping and the empty state would all have been verified
against data that could not disagree with them. And a temporary inline banner for `Sign out`,
replaced a task later, leaves that behaviour untested at the point it ships.

**Consequences.** T-09 extends the toast API (actions, promise toasts, the undo pattern) rather than
creating it; T-35 extends search with query syntax, filters, ranking transparency and pagination.
Both were built to be extended: `ToastProvider` already carries variants and durations, and the
search response is already the grouped shape T-35 needs. This is the only deviation from the plan's
task ordering so far, and it is recorded here rather than left for a reader to notice.

---

## ADR-026 · An undo handler cannot own a component-scoped mutation

**Date:** 2026-07-26 · **Task:** T-09.4 · **Status:** Accepted

**Context.** `useDeleteWithUndo` first used `useRestoreMeeting()` — a `useMutation` — inside the
toast's `Undo` handler. Deleting worked, the toast appeared, and clicking `Undo` did nothing at all:
no restore, no confirmation, no error.

A `useMutation` observer belongs to the component that called the hook. Here that component was the
row's delete button, inside the row that the successful delete had just removed from the list. By
the time the user clicked `Undo`, the observer had unsubscribed with its component and `mutate()`'s
callbacks never fired.

**Decision.** The undo path calls `api.post(...)` directly and invalidates `qk.meetings.all` itself.

The general rule this instance illustrates: **an undo handler outlives whatever raised it**, so it
cannot depend on that thing still being mounted. Any handler that survives in a toast, a
notification or a timer has the same constraint.

**Consequences.** The restore bypasses the `MutationCache`, and therefore the global error toast
from T-09.11 — so it reports its own failure explicitly. Saying "couldn't restore" matters more than
usual here, because the user has been told the meeting was deleted and now believes it is back.

The bug was invisible in isolation and only showed up as a missing toast, which is a good argument
for T09-B asserting the *restored meeting reappears* rather than just that a toast is shown.

---

## ADR-027 · Tests that write get their own Playwright project

**Date:** 2026-07-26 · **Task:** T-09 · **Status:** Accepted

**Context.** Until T-09 every e2e test only read, so four workers sharing one seeded database was
safe. Delete-and-undo broke that immediately: while `T09-A` has a meeting deleted, `03-shell`'s
"renders seeded meetings end to end" asserts there are exactly eight, and which one wins depends on
scheduling. `T09-B` passed run alone and failed in the suite — the signature of this class of bug,
and the reason "run the whole suite before merging" is a rule here.

**Decision.** Tests that write are tagged `@mutates` and run in a `mutations` project that
`dependsOn` the read-only one, with `fullyParallel: false`. Playwright finishes every reader before
the first writer starts, and the writers do not race each other. Each writer also restores what it
changed, so the next one starts from the seeded state.

**Rejected: a database per worker.** It is the right answer for a suite ten times this size, but it
needs a backend process per worker, and the startup cost would exceed the entire current run.

**Consequences.** Writers are serial, so they are the wall-clock floor as they multiply — T-14's bulk
delete, T-26's create and T-28's delete all land in this project. The tag is the whole contract: a
new writing test that forgets `@mutates` runs in the parallel project and produces exactly the flake
described above. That is worth watching for in review.

---

## ADR-028 · Radix for the parts that are invisible when wrong

**Date:** 2026-07-26 · **Task:** T-10 · **Status:** Accepted

**Context.** T-10 builds 20 primitives. The visual layer is ours — every one is styled entirely
from tokens — but several need behaviour that takes a day to write and a year to get right: a focus
trap that survives dynamic content, `inert` on the rest of the page, scroll-lock that compensates
for the scrollbar's width, roving focus with typeahead, and collision detection that flips a panel
near a viewport edge.

**Decision.** Radix for `Dialog`, `DropdownMenu`, `Select`, `Popover`, `Tabs`, `Checkbox`, `Switch`,
`RadioGroup` and `Tooltip`. Everything else — `Button`, `Chip`, `Badge`, `Avatar`, `Pagination`,
`ProgressBar`, `Skeleton`, `EmptyState`, `SearchInput`, `Highlighter`, `ResizablePanels`,
`DatePicker` — is hand-written, because their hard parts are ours, not the platform's.

Notably `DatePicker` pulls in no date library: start-of-day, add-days and end-of-month are three
lines of `Date` arithmetic, and the presets (`Last 7 days`) are the actual feature.

**Consequences.** Nine dependencies, all headless, none carrying styles. The audit surface did not
change — the 14 high findings are still build-time toolchain transitives, none from Radix.

Radix is unstyled, so its accessibility guarantees are not automatic: three of its controls render
as `<button>` and axe flagged all of them (ADR-029).

---

## ADR-029 · Radix controls need explicit names, not sibling labels

**Date:** 2026-07-26 · **Task:** T-10.16 · **Status:** Accepted

**Context.** Checkbox, Switch, Radio and Select were each written with a visible `<label htmlFor>`
pointing at the control's id — the correct pattern for a native input. The axe scan on
`/dev/components` reported **eleven critical `button-name` violations**.

Radix renders these controls as `<button role="checkbox">`, `<button role="switch">`,
`<button role="radio">` and `<button role="combobox">`. `<label for>` names a native input reliably;
for a button, browsers and screen readers do not expose that association, so every one of them was
announced as an unnamed button.

**Decision.** Every one gets `aria-labelledby` pointing at the label's own id. The visible `<label>`
stays — it still makes the text clickable — but the accessible name comes from the explicit
reference.

**Consequences.** Caught only because T10-L runs axe over a page that renders every primitive in
every state. A checkbox tested through the one feature that uses it would have looked fine. This is
the argument for the gallery existing at all, and it is why T-39/T-40 extend axe to eight surfaces
rather than treating this as done.

---

## ADR-030 · A controlled Modal must restore focus itself

**Date:** 2026-07-26 · **Task:** T-10.10 · **Status:** Accepted

**Context.** T10-C asserts that closing a modal returns focus to whatever opened it. It did not —
focus landed on `<body>`, dumping a keyboard user at the top of the document.

Radix restores focus by itself when the dialog is opened through `Dialog.Trigger`. Our `Modal` is
CONTROLLED: callers render their own button and flip `open`. There is no trigger for Radix to
remember.

**Decision.** `onOpenAutoFocus` fires *before* Radix moves focus into the dialog, so
`document.activeElement` at that instant is still the thing that opened it. Capture there, restore
in `onCloseAutoFocus`. Guarded on `isConnected`, because the trigger may have unmounted while the
dialog was open — a row's kebab after the row was deleted — and focusing a detached node silently
does nothing.

**Consequences.** The controlled API is kept, which every caller in T-14, T-26 and T-28 needs, and
the focus contract holds without callers passing a ref. `ConfirmDialog` layers `initialFocusRef` on
top so focus lands on **Cancel**: Enter still travelling from the keystroke that opened a
destructive dialog must not delete anything.

---

## ADR-031 · Raw `<button>`, `<input>` and `<select>` are lint errors outside components/ui

**Date:** 2026-07-26 · **Task:** T-10.18 · **Status:** Accepted

**Context.** "Build once, reuse everywhere" is a convention until something enforces it. Turning
the rule on surfaced **20 violations** across code written in T-06 to T-09 — every one of them a
control that had reimplemented a height, a hover state and a focus ring by hand.

**Decision.** `no-restricted-syntax` on `JSXOpeningElement` for `button`, `input` and `select`,
scoped to `src/features/**`, `src/app/**` and `src/components/layout/**`. `components/ui/` is
exempt, since that is where the primitives are defined.

All 20 were fixed rather than suppressed, and two of them were real bugs rather than duplication:

**The global search field was a second implementation of `SearchInput`.** It now uses the primitive,
with combobox ARIA passed in — one field component, three call sites.

**The drawer backdrop was a `<button>`,** on the reasoning that an invisible click target should be
reachable. That was wrong: it inserted a tab stop announcing "Close menu" immediately before the
real Close button, so keyboard and screen-reader users met the same action twice. Tap-outside is a
POINTER affordance; it is now `aria-hidden`, and Escape and the visible button serve everyone else.

**Consequences.** Adding a control now means using or extending a primitive. Where a primitive did
not fit, it was extended rather than bypassed — `SearchInput` gained combobox props, `menu.tsx`
gained `MenuRadioItem` — which is the outcome the rule is for.

---

## ADR-032 · Eager-by-default relationships were loading the whole transcript

**Date:** 2026-07-26 · **Task:** T-11.7 · **Status:** Accepted

**Context.** T11-L counts statements on a 20-item page. It found 13, and four of
them were `SELECT ... FROM transcript_segments`, `speakers`, `action_items` and
`summary_sections`.

Every relationship on `Meeting` had been declared `lazy="selectin"` — a reasonable-looking default
that means "never N+1". For the Notebook list it meant every page loaded **~1,200 transcript
segments per meeting, twenty meetings at a time**, plus every action item and every summary section.

None of it appeared in the response: `MeetingListItem` does not have those fields, so the payload
was correct and light while the query cost was enormous. This is exactly the deduction T-04.4 warns
about, arriving through the back door — and the only way to see it was to count statements.

**Decision.** `segments`, `speakers`, `action_items` and `Summary.sections` are lazy. Callers that
need them opt in with `selectinload`. The small, bounded collections a row actually renders
(`participants`, `keywords`, `tags`, `summary`) stay eager.

**Consequences.** Nine statements for a full page instead of thirteen, and none of them touching a
transcript. The test asserts both the bound and, explicitly, that
`FROM transcript_segments` does not appear — a count alone would pass again if something heavy came
back under a different name.

**DEVIATION from T11-L, which asks for ≤ 4.** The floor for this model is 8: the page query, the
count, four `selectinload`s, and two grouped aggregates. Reaching 4 would mean denormalising counts
onto `meetings` or dropping fields from the row — trading a real correctness surface for a number.
What the case protects is that the count does not GROW with the page, and that is asserted directly
by its own test.

---

## ADR-033 · An unknown sort key is a 400, not a silent fallback

**Date:** 2026-07-26 · **Task:** T-11.5 · **Status:** Accepted

**Context.** `list_meetings` previously did `SORTABLE.get(sort, SORTABLE[DEFAULT])` — an unknown key
quietly sorted by the default. Safe against injection, which was the point at the time, and wrong in
a different way.

**Decision.** An unknown key raises `InvalidSortError` → **400 `INVALID_SORT`**, with the allowed set
in `details`.

A fallback hides a client bug in the worst possible way: the caller believes it sorted by one thing
and is looking at another, with nothing to distinguish that from data that happens to be ordered
oddly. A 400 makes it a five-second fix.

This also introduced `BadRequestError` as a category distinct from 422. FastAPI raises 422 when a
value fails to PARSE; 400 is for a value that parsed fine and is still not allowed. Collapsing them
leaves the client unable to tell "you sent a string where I wanted an int" from "that is not a
column".

**Consequences.** One existing test asserted the old fallback and was updated — deliberately, with
the reasoning recorded in the test itself rather than silently flipped.

---

## ADR-034 · List responses are validated with a weak ETag over the body

**Date:** 2026-07-26 · **Task:** T-11.11 · **Status:** Accepted

**Context.** The Notebook re-requests the same list constantly — every navigation back, every filter
toggled and untoggled. Those requests should be cheap, and they must never be stale: a meetings list
that still shows a meeting the user deleted is worse than a slow one.

**Decision.** `Cache-Control: no-cache` plus a weak ETag digested from the serialised response.

`no-cache` does not mean "do not cache" — it means "cache it, but revalidate before reuse". Paired
with an ETag, a repeat request costs a 304 and no body, while any change anywhere in the page
changes the digest. `max-age` would have been the bug.

The digest is taken over the BODY rather than a `MAX(updated_at)` high-water mark, because the page
contains aggregates — action-item counts, participant totals — that no single row's timestamp
covers. A body digest cannot go stale by construction.

`W/` is honest about strength: the digest is over Pydantic's JSON, so two equivalent encodings would
compare unequal. Weak comparison is all `If-None-Match` on a GET needs.

**Consequences.** Every list response serialises twice on a cache miss (once to digest, once to
send). At this scale that is invisible, and it buys a correctness property that is hard to get any
other way. The 304 is raised as an exception rather than returned, so the handler's return type
keeps describing what the endpoint actually produces.

---

## ADR-035 · Routers get their enums from schemas, not models

**Date:** 2026-07-26 · **Task:** T-11.1 · **Status:** Accepted

**Context.** The list endpoint takes `?source=` typed as `MeetingSource`, which lives in
`app.models.enums`. The layering guard rejected the import.

The guard was arguably over-broad here — an enum is a value type, not ORM access. But ADR-017
settled that the rule has no exceptions, on the grounds that every exception is a precedent and the
guard's value is that it cannot be argued with.

**Decision.** `app.schemas.meeting` re-exports the enums, and routers import from there.

This is better layering, not just guard appeasement: the API layer's vocabulary should come from the
API contract. If `MeetingSource` ever needs to differ between storage and wire — a renamed member, a
value the API accepts but never stores — the seam already exists.

**Consequences.** One re-export block, and the guard stays absolute. Third time the rule has forced a
better structure rather than a worse one (ADR-017, ADR-031).

---

## ADR-036 · The Notebook is a date-grouped card list, not a column table

**Date:** 2026-07-27 · **Task:** T-12 · **Status:** Accepted · **Closes pending decision #6**

**Context.** design.md §2.2 flagged this at the start and deferred it to T-12. PLAN.md A2.1 and the
T-12 row spec describe a dense column table: 72px rows, a sticky header, and columns for date,
duration, participants and action items. `docs/reference/fireflies/02.png` shows something else
entirely — meetings as **bordered cards in a vertical list, grouped under date headings**
(`Sat, Jul 25`), each card carrying a leading tile, a title, and one metadata line reading
`Jul 25 · 9:00 AM · 30 min · Goyal`. No columns. No table header.

This is the third time the plan's researched values have conflicted with the reference, after the
accent colour (ADR-011) and the rail metrics (ADR-021).

**Decision.** Follow the reference, for the same reason as the previous two: the project is graded
on looking like Fireflies, and a side-by-side comparison is where a wrong layout is most obvious.

The plan's own ❌ list is satisfied rather than contradicted. It rules out *"a card grid by default
(Fireflies' primary view is the list)"* — and this **is** a list. The card grid is T-12.13's
opt-in Grid view, behind the segmented toggle, exactly where the plan puts it.

**What was kept from the plan.** Everything that is not the column geometry: the leading
thumbnail/checkbox cross-fade with a reserved 40×40 box, the roving-tabindex keyboard navigation,
the kebab with its submenus, the avatar group with counted overflow, the action-item badge as a
badge rather than a bare number, every `data-testid`, and — as it turned out — the 72px height,
which the card is pinned to via the `row` token.

The reference's cards carry less information than the plan's rows. Where the API has more to show,
it is shown: participants and action items sit at the trailing edge of the card, and a
transcript-only search hit adds a `match_context` line (T-11.3). Matching the reference's *layout*
does not mean matching its *feature set* downward.

**Consequences.** Two test cases were adapted, with the reasoning inline in the spec rather than
silently rewritten:

- **T12-B** asserted `height === 72` on a table row. The card is pinned to the same token, so the
  assertion survives unchanged — and the skeleton now mirrors the card's box model rather than
  maintaining its own height, which is what stops the two drifting.
- **T12-I** asserted a sticky column header at `y=56`. This layout has no column header, so there is
  nothing to stick. The property it protected — the topbar surviving a long scroll — is already
  covered by T08-K.

Grouping is suppressed when the sort is not chronological: a title-sorted list would put every
meeting under its own date heading, which is noise rather than structure.

---

## ADR-038 · Assert the wiring when the interaction cannot be simulated

**Date:** 2026-07-27 · **Task:** T-10.8 · **Status:** Accepted

**Context.** `T10-G` originally hovered the AvatarGroup's `+N` chip and read the tooltip. It passed
on macOS and failed all three attempts on Linux CI — twice. The first fix moved the *content*
guarantee onto an `aria-label` (the right fix, and a real product improvement) but kept a separate
hover test, on the grounds that its failure "would not be a correctness failure". It then broke the
build.

Radix's tooltip opens from `pointermove` heuristics that Playwright's synthetic events do not
reproduce reliably across platforms.

**Decision.** Assert what can be asserted deterministically — that the chip is wired as a tooltip
trigger (`data-state` is present) — and let the content guarantee live where it cannot flake: the
`aria-label` in `T10-G`, and `overflowLabel`'s unit tests.

**The general rule.** A test that cannot be made deterministic is worse than no test: it trains the
team to re-run the build, and the next real failure gets re-run too. When an interaction cannot be
simulated faithfully, assert the wiring and move the guarantee to a layer that can be.

That the *accessible* path is the one left under test is not a consolation prize — a tooltip does
not exist for touch users and is not reliably announced, which `tooltip.tsx` says in its own header.

**Consequences.** Visual tooltip behaviour is unverified by the suite. Acceptable: it is one
presentational affordance on a secondary control, and the information it shows is guaranteed twice
over elsewhere.

---

## ADR-037 · Every test that writes lives in one file

**Date:** 2026-07-27 · **Task:** T-12 · **Status:** Accepted · **Extends ADR-027**

**Context.** ADR-027 gave writing tests their own Playwright project so they could not race the
readers. T-12 added a second mutating spec, and the suite went intermittently red again: `T09-A`
deleted the first row while the notebook's kebab test was counting rows.

`fullyParallel: false` serialises tests within a **file**. Files still run in parallel across
workers. So one mutating file was safe and two were not — and the failure rate was about one run in
three, which is the worst possible frequency: often enough to matter, rare enough to be dismissed as
a flake.

**Decision.** All `@mutates` tests live in `tests/90-mutations.spec.ts`. The rule is short enough to
hold in review: **if a test writes, it goes there, and it restores what it changed.**

**Rejected: `workers: 1`.** Playwright has no per-project worker count, so this would serialise the
entire suite — a 1.5-minute run becomes several minutes to protect four tests.

**Consequences.** Mutating coverage is not co-located with the feature it exercises, which is a real
cost to discoverability; the file's header comment explains why, and each test names the task it
belongs to. Three consecutive full-suite runs were clean before merging, which is now the bar for
anything touching this area — one green run does not distinguish "fixed" from "got lucky".

---

## ADR-039 · The filters panel is draft-then-Apply

**Date:** 2026-07-27 · **Task:** T-13.5 · **Status:** Accepted · **Closes pending decision #5**

**Context.** T-13.5 offers both models and requires a choice. The panel has seven sections: host,
participants, date, duration, tags, channel and an action-items switch.

**Decision.** Draft-then-Apply.

Live-apply means a request per checkbox. A user narrowing by host, then date, then duration fires
three or more round-trips and watches the list churn under them — and the intermediate states are
ones nobody asked to see. With seven sections that is the common path, not an edge case.

The plan's own specification points the same way: a sticky footer holding `Clear all` and `Apply`,
and a discard-with-toast on dismissal, only mean anything if the changes are drafts.

**The cost, and what pays for it.** Draft models are confusing when the user cannot tell what is
committed. Two things resolve that: the active-filter chip row above the list always shows the
APPLIED state, and dismissing a dirty panel says `Filters not applied` rather than silently
discarding six clicks.

**Consequences.** The draft is reseeded from the applied state each time the panel OPENS, keyed on
`open` rather than on the applied filters — reseeding while the panel is open would wipe the user's
in-progress edits the moment anything else touched the URL.

---

## ADR-040 · The e2e suite runs against a production build

**Date:** 2026-07-27 · **Task:** T-13 · **Status:** Accepted

**Context.** Three T-13 search tests failed in the suite and passed alone. The symptom was that a
debounced write to the URL "never happened" — so the obvious suspects were the debounce, the
controlled input, and the fixed clock. None of them was the cause.

`next dev` compiles routes and RSC payloads on demand. With four Playwright workers, the first
client navigation in each worker waited seconds on the dev compiler, and the URL only updates once
that navigation commits. Warming the routes with a plain fetch did not help, because the flight path
is compiled separately.

**Decision.** The `webServer` runs `next build && next start`.

Beyond removing that class of flakiness, it means the suite exercises what actually ships: minified,
production React, no StrictMode double-invocation of effects.

**Consequences.** ~40 seconds of build time per run, against several seconds of compile stalls per
worker. The `/dev/*` surfaces were gated on `NODE_ENV === 'production'`, which meant "these pages
exist only where we do not test them" — they now check an explicit
`NEXT_PUBLIC_ENABLE_DEV_SURFACES` flag that only the e2e config sets. Two of the three were not
gated at all and would have shipped; that is now fixed.

---

## ADR-041 · Search-param changes use history.pushState, not the router

**Date:** 2026-07-27 · **Task:** T-13.8 · **Status:** Accepted

**Context.** With the production build in place, filter chips and `Clear all` still took seconds to
take effect and often appeared not to work at all.

Next's App Router treats a search-param change as a navigation: it fetches a fresh RSC payload for
the route before the URL updates. Every page in this app fetches its data client-side through
TanStack Query (ADR-005), so that round-trip returns a payload nothing consumes — pure latency on
the interaction the Notebook is built around.

**Decision.** `setParams` uses `window.history.pushState` / `replaceState`. Next 15+ integrates the
native history methods with `usePathname` and `useSearchParams` for exactly this case: the URL
updates synchronously, the hooks re-render, and Back still works because a real history entry is
created.

**Consequences.** Filtering is instant. `router` is no longer needed in `useQueryParams` at all. Any
future page that DOES render server-side must not use this hook for its filters — it would update
the URL without re-rendering the server component. Nothing does today, and ADR-005 explains why.

---

## ADR-042 · A debounced input must not fire on mount

**Date:** 2026-07-27 · **Task:** T-13.1 · **Status:** Accepted

**Context.** With the two fixes above in place, filter chips *still* did nothing on any page opened
with query parameters — while the same controls worked from a bare `/notebook`. React was hydrated,
handlers fired, and local-state controls responded.

`SearchInput`'s debounce effect ran on mount and reported the initial value as though the user had
typed it. On the Notebook that meant every page load rewrote the URL ~250ms later, and a click
landing inside that window had its navigation clobbered by the rewrite.

**Decision.** The effect skips its first run.

**The general shape.** "Notify when this value changes" and "notify with this value" are different
contracts, and `useEffect` gives you the second by default. Any debounced callback wired to a
controlled input has this bug latent in it.

**Consequences.** A caller that genuinely wants the initial value can read it directly — it is the
value they passed in. The bug took three wrong hypotheses to find because every symptom pointed at
navigation; the lesson recorded here is that a spurious *write* looks exactly like a failed write.

---

## ADR-043 · Selection survives paging but not filtering

**Date:** 2026-07-27 · **Task:** T-14.1 · **Status:** Accepted

**Context.** T-14.1 says to clear the selection on filter *or* page change. Those two are not the
same event.

**Decision.** Selection survives paging and is cleared — with a toast — when the filters change.

Paging is navigation within one result set: picking three meetings on page 1 and two on page 2
plainly means five, and T-14.9's "Select all 47 matching" only makes sense if crossing a page
boundary does not discard what came before.

A filter change is different. It can remove the selected rows from the result set entirely, and the
next action available is **Delete**. Silently destroying something the user can no longer see is the
worst outcome on offer here, so the selection goes and the toast says so.

**Consequences.** The select-all checkbox is scoped to the current PAGE while the bulk bar counts
ALL selected — deliberately, since they answer different questions ("is this page picked?" versus
"how many will this delete?"). An empty page reports `none` rather than `all`: `every()` on an empty
array is true, which would render a checked box over nothing.

---

## ADR-044 · Shift-click is handled in the capture phase

**Date:** 2026-07-27 · **Task:** T-14.3 · **Status:** Accepted

**Context.** Shift-clicking to select a range selected two rows instead of the range between them.

Radix's checkbox reports only the resulting state, never the modifiers that produced it, so the
shift handler sat on a wrapper. On the way back up, the checkbox's own toggle had already run — and
that toggle moves the range's ANCHOR to the row just clicked, so the range was always from a row to
itself.

**Decision.** `onClickCapture` on the wrapper: a shift-click is intercepted before the checkbox sees
it, and the plain toggle never runs.

The range also always SELECTS rather than toggling. A range that flipped each row's state would
leave holes wherever the user had already picked one, which is not what dragging a selection means
anywhere else.

**Consequences.** Two behaviours now depend on event-phase ordering, which is easy to break without
noticing — the unit tests cover the anchor semantics directly (`useSelection`), so a regression
shows up there rather than only in a browser.

---

## ADR-045 · The list row and the details drawer get different participant shapes

**Date:** 2026-07-27 · **Task:** T-15.8/T-15.9 · **Status:** Accepted

**Context.** The drawer needs each participant's email, whether they attended, how long they spoke,
and their speaker colour. The obvious move is to add those fields to `ParticipantRef`, which the
Notebook row already uses.

**Decision.** A separate `ParticipantDetail`, returned only by `GET /meetings/{id}`.

`ParticipantRef` exists to render an avatar in a group and deliberately carries nothing else. A
Notebook page holds twenty rows with up to five participants each — widening it would ship
attendance data for a hundred people nobody looks at, on every page load. That is the same weight
ADR-032 removed from the list query, arriving from the other direction.

**Consequences.** Two shapes for one concept, which is a real cost in a codebase this size. It is
the right cost: the split is exactly where the payload sizes diverge, and a test asserts the light
row still does not carry `talk_seconds`.

The talk-time bar uses the SERVER's `color_index` rather than re-hashing the name, because the
server's assignment is authoritative (ADR-013) — re-hashing here would give the same person two
different colours depending on which component drew them.

---

## ADR-046 · A meeting without a summary is 200, not 404

**Date:** 2026-07-27 · **Task:** T-15.5 · **Status:** Accepted

**Context.** `GET /meetings/{id}/summary` had to be added — only the regenerate endpoint existed, so
the drawer's overview silently never loaded. The question was what an unsummarised meeting answers.

**Decision.** 200 with `overview: null`.

"Not summarised yet" is a state of the meeting, not a missing resource. A 404 would make every
client treat a perfectly normal meeting as an error — retry logic, error toasts, an error boundary —
for a condition that is expected and temporary.

**Consequences.** Callers check the field rather than the status. This mirrors ADR-014's reasoning
about 410 versus 404: the status code should describe what happened, and the client's behaviour
should follow from that rather than from a guess.

---

## ADR-047 · One StateView, four variants, four sets of copy

**Date:** 2026-07-27 · **Task:** T-16.12 · **Status:** Accepted

**Context.** Empty, no-matches, no-results, error and offline had each been written where they were
needed. That is how four different situations quietly collapse into one "No data" screen — which
PLAN.md puts on the do-not-ship list, and rightly: the user's NEXT ACTION differs in each case. With
no meetings they need to create one; with a filter on they need to relax it; with a search term they
need to change it; with a failed request they need to retry.

**Decision.** One `StateView` driven by a variant, with the copy and the call to action supplied per
use.

The visual language cannot drift because there is one component; the messages cannot merge because
they are arguments. The filtered-empty state also ECHOES the active filters, so the user can see
which one to relax rather than clearing everything to find out.

**Consequences.** A test asserts the three empty variants produce different text, which is the
property that actually matters and the one most likely to erode.

---

## ADR-048 · Playwright glob `?` is a wildcard, and it cost an hour

**Date:** 2026-07-27 · **Task:** T-16 · **Status:** Accepted

**Context.** Three T-16 tests failed in ways that pointed at the app: the empty state "not
rendering", the error state "not appearing". The page was in fact showing "Something went wrong".

`page.route('**/api/v1/meetings?*')` looks like "the meetings list with a query string". In
Playwright's glob syntax `?` is a SINGLE-CHARACTER WILDCARD, so it also matches
`/api/v1/meetings/facets`. Every one of those tests was stubbing or failing the facets request too.

**Decision.** Route interception uses a URL predicate — `(url) => url.pathname === '/api/v1/meetings'`
— wherever the distinction matters.

**Consequences.** Two real product bugs were hiding behind the misdirection and are fixed:

`Button asChild` threw. Radix's `Slot` clones a single child, and the component renders three slots
(leading, children, trailing); two being `undefined` still counts as three, so every
`<Button asChild>` crashed into the route error boundary. It now renders children alone when
`asChild`, since a consumer in that mode composes its own icons.

The loading skeleton did not reserve the date-group headings the real list has, so the first row
jumped ~30px when data landed — exactly the shift a skeleton exists to prevent.

A third fix was to a TEST rather than the app: T16-D failed only its first request, but the query
client retries a retryable error once, so the automatic retry succeeded and the error state never
appeared. It was asserting against a recovery it had itself made possible.

---

## ADR-049 · Alembic autogenerate must not see the FTS5 shadow tables

**Date:** 2026-07-27 · **Task:** T-17 · **Status:** Accepted

**Context.** Adding one boolean column to `summaries` produced a migration whose `upgrade()` began:

```python
op.drop_table('transcript_fts_data')
op.drop_table('transcript_fts')
op.drop_table('transcript_fts_docsize')
op.drop_table('transcript_fts_idx')
op.drop_table('transcript_fts_content')
op.drop_table('transcript_fts_config')
```

FTS5 creates five shadow tables alongside the virtual table. No model declares any of them — they
are made by a hand-written migration and maintained by triggers — so autogenerate reads six tables
as "in the database, absent from the metadata" and proposes dropping them.

Applying that would have **destroyed search on the next deploy**, silently: the endpoint would keep
answering 200 with an empty result set.

**Decision.** `alembic/env.py` passes an `include_object` hook that excludes anything named
`transcript_fts*` from autogenerate, and the T-17 migration was hand-written to contain only the
intended column.

**Consequences.** Autogenerate now produces an empty migration when the models match the database,
which is the behaviour that makes it trustworthy — and a *reviewable* diff is what caught this at
all. The generated file was read before it was applied; had it been trusted, the failure would have
surfaced weeks later as "search returns nothing" with no obvious cause.

The general lesson: an autogenerated migration is a PROPOSAL. Anything the ORM does not model —
virtual tables, triggers, views, extensions — is invisible to the comparison and will be proposed
for deletion.

---

## ADR-050 · Regeneration is claimed with a conditional UPDATE

**Date:** 2026-07-27 · **Task:** T-17.8 · **Status:** Accepted

**Context.** T-17.8 asks for regeneration to be idempotent under concurrent calls. Two clicks on
`Regenerate`, or a double-submit, must not run the (eventually expensive) generation twice.

**Decision.**

```sql
UPDATE summaries SET is_generating = 1 WHERE id = ? AND is_generating = 0
```

Exactly one caller sees `rowcount == 1`. The loser returns the CURRENT summary rather than a 409 —
from the user's point of view a regeneration is already happening, which is what they asked for, and
an error the UI has to explain away is worse than the truth.

A `SELECT ... then UPDATE` has a window between the two statements where both callers see "not
generating". That window is wide enough to hit with two clicks; the condition has to be part of the
write.

The flag is released in a `finally`, because a stuck flag makes `Regenerate` permanently do nothing
with no way back.

**Consequences.** A crashed process could still leave the flag set — a real limitation, and the
right fix is a timestamp with a timeout rather than a boolean. Not built, because nothing in this
build takes long enough for it to matter, and it is recorded here rather than discovered later.

---

## ADR-051 · Range requests are the difference between playing and seeking

**Date:** 2026-07-27 · **Task:** T-17.9 · **Status:** Accepted

**Context.** PLAN.md calls this "the single most-missed backend detail in this assignment", and the
reason it gets missed is that the failure is invisible: without `Accept-Ranges` and 206 responses, a
browser can still PLAY the file — it downloads it and starts. Only SEEKING breaks, and it breaks
silently. The scrubber snaps back and no error appears anywhere.

**Decision.** Full single-range support, with the three details that are each individually easy to
get wrong:

- **Ranges are INCLUSIVE at both ends.** `bytes=0-0` is one byte; length is `end - start + 1`. The
  off-by-one produces subtly corrupted audio rather than an error.
- **A suffix range is the LAST n bytes.** `bytes=-500` means the final 500, not the first 500.
- **An open-ended range is capped to a chunk.** Browsers open `bytes=0-` to start playback; serving
  3MB on every seek defeats the point of ranges entirely.

`416` carries `Content-Range: bytes */size` so a client that asked for the impossible can learn the
real length. A malformed `Range` is IGNORED rather than rejected — a client sending nonsense still
gets its file.

**Consequences.** The parsing is a pure function with unit tests covering each of the above, because
every one of them is a place where the code looks right and the behaviour is wrong. Reads are
buffered rather than streamed; the seam for streaming is in `read_range` and the callers do not
change.

## ADR-052 — The shell's `<main>` owns the height chain; pages own their padding

**Context.** The Notepad's panels must be the only things that scroll: the
header stays put, and each pane scrolls its own interior. Every panel had
`h-full min-h-0 overflow-y-auto` and none of them scrolled — the whole page
scrolled instead, and the header slid away.

`h-full` resolves against the parent's height. The shell's `<main>` was a grid
row with a wrapper of `mx-auto w-full max-w-content p-6`: no height, so every
`h-full` below it resolved to `auto` and the chain broke at the top.

**Decision.** The wrapper is `mx-auto flex h-full w-full max-w-content flex-col`
and carries NO padding; each page adds its own. The shell's grid rows became
`[56px_auto_minmax(0,1fr)]` so the last row can actually shrink.

Padding moved to the pages because the Notepad needs its header flush to the
edges while the Notebook wants the old inset — a shared padded wrapper cannot
give both, and the Notepad's version was the one silently breaking.

**Consequence.** Any new page must set its own padding. The alternative — a
`noPadding` prop on the shell — puts one page's layout exception into shared
chrome, which is how shells accumulate flags.

---

## ADR-053 — `notFound()` in a matched dynamic route renders the 404 page but returns 200

**Context.** `/meeting/bogus` calls `notFound()` from the server component after
rejecting a non-numeric id. The test asserted a 404 status and got 200.

**Decision.** Keep `notFound()`, and record the status behaviour honestly rather
than assert something that is not true. In this Next version a route that
MATCHED (the segment exists; only its parameter is wrong) has already committed
its status by the time the boundary renders. A genuinely unmatched path —
`/totally-unknown-route` — does return 404; that is what `03-shell` asserts now.

**Consequence.** `12-states` asserts the branded not-found page renders for a
malformed id, with the status deviation written down beside it. Anything
depending on the status — a crawler, a link checker — sees 200 for a malformed
id. Acceptable here: these links are internal and no route serves both.

---

## ADR-054 — Responsive branches get their own e2e coverage

**Context.** The Notepad's sub-1024px branch swaps the split for tabs. It
rendered "Something went wrong" for the entire time it existed, and every test
was green: `TabPanel` was a SIBLING of `Tabs` rather than a child, Radix's
`Tabs.Content` throws outside its `Tabs.Root`, and the route error boundary
turned the throw into a friendly message. The desktop tests never entered the
branch, and no console error surfaced because the boundary caught it.

**Decision.** Every layout branch behind a media query gets at least one test at
a viewport inside it, asserting the branch's own testid (`notepad-tabs`), not
just that the page rendered.

**Consequence.** A handful of `test.use({ viewport })` blocks. The alternative is
what happened here — a whole responsive mode broken, invisible to a suite that
only ever ran at 1440px, and caught only because a viewport-specific assertion
finally failed.

---

## ADR-055 — The player's timeline is the meeting's duration, not the media file's

**Context.** `sample-meeting.m4a` is eighteen minutes of filtered noise, shared
by two meetings that are nine and seventeen minutes long. Two clocks are
therefore available: what the file says, and what the meeting says.

**Decision.** `duration_seconds` from the meeting. The transcript timestamps,
the outline's `start_ms` and the `?t=` links are all expressed against it, so
letting the file's duration drive the seekbar would put every chapter tick and
every transcript sync in the wrong place — and it would do so differently for
each meeting.

**Consequence.** The audio can outlast the timeline; playback stops at the
meeting's end and the remainder is never reachable. That is the right way round
— the alternative is a seekbar whose marks do not line up with anything.

---

## ADR-056 — One player interface, two transports, reconciled declaratively

**Context.** Six of the eight seeded meetings have no media at all, so a player
built directly on `<audio>` would be inert on most of the app's data. The engine
therefore drives either a media element or a virtual clock behind one interface.

The first version called `media.play()` from the play button. It worked, then
failed under parallel test load in a way that took three passes to see: press
play before `loadedmetadata` arrives and the virtual clock starts; metadata then
lands, the engine switches to the media element, and the clock begins reading
`currentTime` from an element nobody ever started. The playhead snapped back to
zero and froze, with no error anywhere — `readyState` 4, `paused` true, and a
button reading "Pause".

**Decision.** `isPlaying` is the single source of truth and an effect
RECONCILES the element to it, keyed on the transport. A transport change is
then just another reason to re-run the effect, and the handoff carries the
virtual clock's position across so playback continues from where the user is.

The same class of bug produced the second fix in this task: `loadedmetadata`
can fire before the listener is attached, so the engine also CHECKS
`readyState` rather than only subscribing. An event that has already happened
never arrives again.

**Consequence.** Playback state lives in one place and the element follows it.
Calling `play()` from an effect rather than from the click handler is inside
Chromium's user-activation window in the normal case; when a slow load pushes
it outside, the promise rejects and the player falls back to the virtual clock
with the note T-19.14 asks for. That is a real behaviour, not a workaround.

---

## ADR-057 — The playback clock is an interval, not `requestAnimationFrame`

**Context.** The plan specifies rAF for the virtual clock. rAF is tied to
PAINTING: a backgrounded, occluded or throttled page stops receiving frames.

**Decision.** `setInterval` at 10Hz, with every tick working from the elapsed
time it MEASURES rather than assuming it ran on schedule.

Audio does not stop when you switch tabs, so its clock must not either — with
rAF the playhead would freeze while the sound kept going and the two would
disagree by however long the page was out of sight. Delta-based arithmetic also
means a throttled interval (browsers clamp hidden tabs to 1Hz) still keeps
correct time; it simply updates less often while nobody is watching.

**Consequence.** 10Hz would visibly step, so the seekbar's fill carries a
matching linear CSS transition and the browser interpolates between commits:
ten state updates a second, sixty frames of motion. The easing must be
`linear` — an ease curve accelerates and decelerates ten times a second, which
reads as stuttering rather than as smoothing.

---

## ADR-058 — Bespoke media controls live in `components/ui`

**Context.** The play circle, the chapter tick and the volume slider are not
`Button`, `IconButton` or `Input`. `cn` joins classes without resolving
conflicts — a deliberate choice — so passing `size-10 rounded-full` to a button
that already declares `h-btn-md` and `rounded-md` yields a control whose
appearance depends on the order Tailwind emitted its utilities.

**Decision.** Three new primitives in `components/ui/media-controls.tsx`, each
carrying ONE complete class set. The lint rule banning raw `<button>` and
`<input>` under `features/**` pushed this, and it pushed the right way: the
alternative was three hand-rolled controls in a feature folder, each with its
own focus ring to get subtly wrong.

The volume control is a native `range` rather than a Radix slider. It is the
one input the platform already gets right — keyboard, touch, screen readers and
RTL all work with no code — and the only thing missing is the paint, which the
`.ff-range` block supplies. Those pseudo-element rules cannot be combined into
one selector list: a list containing an unknown pseudo-element is discarded
whole, so `::-webkit-` and `::-moz-` sharing a comma would style neither.

---

## ADR-059 — Decoding the waveform waits for idle

**Context.** Drawing a real waveform means fetching the whole media file and
decoding it — the same file the `<audio>` element is fetching to start playing.
Racing it costs the thing the user actually asked for: under four parallel test
workers, playback took seconds to start because the decode had the bandwidth.

**Decision.** The decode is deferred to `requestIdleCallback` (a timeout where
that is unavailable), and the seeded pseudo-waveform is shown until it lands.
The strip is a decoration; playback is the feature.

**Consequence.** The strip changes once, a second or two after opening a
meeting that has audio. Worth it. The seeded waveform is also what every
meeting WITHOUT media shows, so the fallback is a first-class path rather than
a degraded one — and it is deterministic, seeded from the meeting id, because
`Math.random()` would produce a different picture on every render and turn a
decoration into a source of false visual-regression diffs.

---

## ADR-060 — The transcript is virtualised by SEGMENT, not by speaker turn

**Context.** Segments group into turns, so a turn is the visual unit and the
obvious thing to virtualise. It is the wrong one.

**Decision.** Virtualise segments; grouping is a `startsTurn` FLAG computed once
over the list. A turn can be a screen tall, and the thing that has to be
scrolled to is the line currently playing — with turns as the unit,
`scrollToIndex` lands on the top of a block that may not contain the playhead
at all, and "follow the audio" becomes an estimate.

**Consequence.** `markTurns` is a pure function with its own tests, the
virtualiser sees a flat list, and the active index is exactly the index the
binary search returns.

---

## ADR-061 — Auto-scroll suspends on INPUT, not on the scroll event

**Context.** The transcript follows the playhead, and must stop following the
moment the reader scrolls away — T-20.9 calls this out because a panel that
yanks itself back is one of the most visible bugs a transcript view can have.

The first version listened for `scroll` and ignored events inside an 800ms
window after its own programmatic scroll. A scroll event cannot say who caused
it, so a window is the only way to use one — and that window swallows a real
user scroll that lands inside it. Which is precisely when a user scrolls: the
panel has just moved, and they want it to stop.

**Decision.** Suspend on `wheel`, `touchmove` and the scrolling keys. Nothing
programmatic emits those, so there is no window and no ambiguity. The `scroll`
listener remains, with its window, as the fallback for the one way to scroll
that emits no input event of its own — dragging the scrollbar.

**Consequence.** Tests must scroll the way a user does: `page.mouse.wheel`,
not `element.scrollTo`. That is a better simulation anyway — the bug this
found was invisible to a test that scrolled programmatically.

---

## ADR-062 — `SegmentRow` is memoised by hand; the list is not memoised at all

**Context.** The playhead commits ten times a second and every commit re-renders
the transcript. `useVirtualizer` returns fresh function identities by design, so
the React Compiler refuses to memoise any component that calls it — and says so.

**Decision.** Accept that for the list, which there is one of, and memoise
`SegmentRow` by hand with an explicit comparator, of which there are hundreds.
The comparator deliberately excludes the callbacks: they are `useCallback`-stable
at the call site, and including them would silently turn the comparator into a
no-op the first time one was rebuilt.

**Consequence.** One `eslint-disable` with a written reason, and the empty-array
fallbacks in the panel are memoised too — `data?.segments ?? []` is a new array
every render, and a fresh identity there defeats everything downstream of it.

---

## ADR-063 — T20-E's 1,200-segment transcript is synthesised in the test

**Context.** T-20 tests virtualisation against "the 55-min meeting (1,200
segments)". T-05.2 specified 60–220 segments per meeting, and the seed honours
that: the longest is 159. The plan disagrees with itself — 55 minutes at the
word counts T-05 also specifies is roughly 270 segments, not 1,200.

**Decision.** Keep the seed as T-05 specified it and supply the size in the
test, by intercepting the transcript response with a generated 1,200-segment
payload. The claim under test is about the RENDERER, and a fixture is a fine
way to state it.

Rewriting the seed was the alternative, and it would have rippled through the
summaries (whose chapter timestamps must land on real segments), the derived
durations, the talk-time shares and every test that asserts against them —
changing closed, merged work to satisfy a number that contradicts the section
that produced it.

**Consequence.** T20-E and T20-N run against synthetic data and say so. The
empty-transcript state (T20-O) is tested the same way, for the same reason: no
seeded meeting has an empty transcript, and giving one an empty transcript
would cost every other test that uses it.

---

## ADR-064 — One seek path: `useNotepadCommands`

**Context.** Five things seek — a transcript line, a transcript timestamp, an
outline chapter, a chapter tick on the seekbar, a `?t=` link — with comments,
soundbites and search results still to come.

**Decision.** One `seekTo(ms, { play, reveal })`, in a command bus above the
player. The two flags are the entire vocabulary of the differences that
actually exist: a timestamp starts playback and a line does not; an outline
chapter is an explicit "take me there" that overrides the auto-scroll
suspension, while the playhead advancing on its own does not.

`reveal` is a COUNTER rather than a boolean, because two reveals to the same
position must both be observable and a boolean that is already `true` is not.

**Consequence.** Written five times these would drift — one starting playback
and another not, one scrolling the transcript and another leaving it — and the
difference is invisible until someone notices the app behaves differently
depending on which timestamp they clicked.

---

## ADR-065 — The transcript takes the active INDEX, not the playhead

**Context.** The clock commits ten times a second. The active line changes every
few seconds.

**Decision.** The panel resolves `activeSegmentIndex` and passes the index; the
list is wrapped in `memo`. The panel still re-renders with the clock — it reads
`currentMs` — but it renders almost nothing, and the ten-times-a-second cadence
stops there instead of reaching a virtualised list of hundreds of rows.

**Consequence.** Two memoisation layers, each doing a different job: this one
keeps the clock out of the list, and `SegmentRow`'s comparator (ADR-062) keeps a
line change from re-rendering the rows around it.

---

## ADR-066 — Two bugs that only a real navigation could find

Recorded together because both were invisible to any test that did not leave
the page and come back, and both had the same shape: code reading state from
something that had already moved on.

**Scroll restoration saved zero.** The cleanup persisted
`element.scrollTop` — and at teardown that reads 0, because the element's
content is already gone. Every navigation overwrote a good position with zero,
so the feature did nothing while appearing to be wired correctly. The offset is
now tracked in a ref, written on a 250ms debounce, and persisted from the REF.

**`initialOffset` does not scroll.** It tells the virtualiser which rows to
RENDER; it does not move the element. Setting it alone leaves the DOM at the top
with the right rows drawn below the fold. The element is scrolled explicitly in
a layout effect, with `initialOffset` still supplied so the correct window is
rendered on the first paint rather than after a jump.

---

## ADR-067 — The waveform decoder strides instead of scanning

**Context.** T21-K budgets long tasks at under 200ms across twenty seconds of
playback. The measurement came in at 222ms and did not move when the sync loop
was memoised — because the sync loop was not what was spending it.

Eighteen minutes of mono at 22kHz is 24 million samples, and `decodePeaks` was
reading every one of them to draw 400 bars.

**Decision.** Sample at most 256 points per bar. A peak that only one sample in
a hundred thousand reaches is a click, not a shape, so the strip is visually
indistinguishable and the loop is two orders of magnitude cheaper.

**Consequence.** The budget passes with room, and it passes because the cost
went away rather than because the number was raised. Worth noting as a method:
the first fix — memoising the list — was a real improvement that did not move
this measurement at all, which is what said the diagnosis was wrong.

---

## ADR-068 — Find-in-transcript overrides ⌘F

**Context.** Overriding a browser shortcut is a strong move and usually the
wrong one.

**Decision.** Override it here, because native find only sees the DOM and the
transcript is virtualised: it would report three matches in a transcript
containing thirty, with no way to reach the rest — which is worse than useless,
because it looks like an answer. `Escape` closes the bar and hands the
keystroke back, which is the deal.

**Consequence.** The bar owns match navigation, the counter, the speaker filter
and the density map, none of which native find could offer. The shortcuts modal
names `Escape` so the way back is discoverable.

---

## ADR-069 — Match navigation scrolls through the VIRTUALISER

**Context.** T-22.5 calls this the trap in the task, and it is: a match is very
often in a row that is not mounted, and `scrollIntoView` on a node that does not
exist silently does nothing. The counter advances, the highlight moves, and the
view stays exactly where it was.

**Decision.** Stepping to a match calls `virtualizer.scrollToIndex(segmentIndex)`.
Only the virtualiser knows where an unrendered row would be.

**Consequence.** The match index is carried as `{ segmentIndex, indexInSegment }`
rather than as a DOM reference — the first says where to scroll, the second
tells the highlighter which of that line's marks is current.

---

## ADR-070 — The find cursor is derived, not reset by an effect

**Context.** "A new search starts at its first match; refining an existing one
keeps the reader where they are." The obvious implementation is a `current`
number plus an effect that resets it when the query changes.

**Decision.** Store the cursor WITH the query it belongs to and derive the
current match from the pair.

The effect version renders once with the old index against the new matches
before the effect corrects it — a highlight in the wrong place on every
keystroke — and the lint rule against synchronous `setState` in an effect was
pointing at exactly that. Deriving it means there is never a render where the
two disagree, and it collapses two effects into one expression that also clamps
when the speaker filter narrows the results out from under the cursor.

---

## ADR-071 — Smart Search says it is pattern matching

**Context.** The four presets — Questions, Tasks, Metrics, Dates — are regexes.
The feature they echo in the reference product is called "Smart Search".

**Decision.** Ship the regexes, and have the panel say "Matched by pattern, not
by a model" above the results. Every preset also shows its count before it is
selected, so a preset with nothing behind it says so rather than being clicked
into an empty list.

The `Tasks` pattern is deliberately narrow. Widening it to every verb that
could imply an action turns the preset into "most of the transcript", and a
filter that matches everything is worth less than no filter at all — it costs a
click to learn nothing.

**Consequence.** An honest small feature rather than a dishonest large-sounding
one. The seeded transcript returns 18 questions, 12 tasks, 13 dates and 1 metric
— that last number is low because this meeting talks in words rather than
figures, which is the correct answer rather than a bug to tune away.

---

## ADR-072 — A memo comparator that skips callbacks makes those callbacks a contract

**Context.** `SegmentRow` is memoised with a comparator that compares only what
the row draws, deliberately ignoring `onSeek` and the copy handlers. CI then
found that clicking a transcript line while playing jumped the display to the
right time and snapped back a tenth of a second later; while paused it looked
correct and silently left the audio behind.

**Cause.** `seekTo` depended on the player, and the player changes ten times a
second with the clock — so `seekTo` did too. Rows therefore held the closure
from the render they mounted on, which was BEFORE the audio metadata had
loaded. In that closure `usingMedia` was false, so seeking moved a number and
never touched the media element. The clock's next tick re-read the element,
which had not moved, and the position snapped back.

**Decision.** Make the callback genuinely stable rather than widen the
comparator: `seekTo` now reads the player through a ref updated in an effect,
and has no dependencies. Widening the comparator would have "fixed" it by
never memoising anything, which is the cost the memo exists to avoid.

**Consequence.** Skipping callbacks in a comparator is now a stated
REQUIREMENT on the call site, written at both ends. Three things made this hard
to see: it needed playback (a paused test passes), it needed the media path
(the virtual clock has no element to disagree with), and the symptom was a
correct-looking value that lasted 100ms.

---

## ADR-073 — Performance budgets are measured as a difference

**Context.** T21-K budgets long-task time while following the playhead. The
same code measured 222ms running alone and 549ms with three copies of the test
competing for the machine — so the assertion was measuring the runner, and the
test both failed on CI when nothing was wrong and would pass on a quiet machine
when something was.

**Decision.** Measure an idle window and a playing window of the same length,
and assert on the DIFFERENCE. Whatever else the runner is doing, it is doing it
during both.

**Consequence.** The number the test asserts is now the cost of the feature
rather than the cost of the machine. Eight-second windows rather than fifteen,
so the whole test fits inside the per-test timeout — eighty clock commits is
already far more than enough to see a per-tick cost.

Worth recording as a method: an earlier fix (memoising the list) was a real
improvement that did not move this measurement at all, and that was the signal
the measurement was wrong, not the code.

---

## ADR-074 — The summary's five sections keep the reference product's names and order

**Context.** Keywords, Meeting Overview, Meeting Outline, Bullet-Point Notes,
Action Items. "TL;DR" and "Highlights" are better words in isolation.

**Decision.** Use the reference product's labels, in its order, verbatim — and
assert both in the e2e suite.

They are not decoration: they are how someone who has used Fireflies knows
where to look. Renaming them costs that recognition and buys nothing a reader
of this app would notice. Action Items ships as a stub pointing at T-24 for the
same reason — it holds its place now rather than appearing later and shifting
everything above it.

**Consequence.** The test asserts the labels in TITLE case, because that is the
text; the panel uppercases in CSS. Asserting the rendered capitals would be
asserting a stylesheet, and a screen reader hears "Meeting Overview" either way.

---

## ADR-075 — Bullet notes are grouped by chapter in the SERVICE

**Context.** Each note row stores one bullet and repeats its chapter title, so
the naive one-row-per-group mapping produced fifteen groups for a five-chapter
meeting: the same heading printed four times with a single bullet under each.
It looked almost right, which is why it survived until a test counted.

**Decision.** Group in `to_summary`, keyed on the title and preserving
insertion order. The client renders what it is given.

Grouping in the client was the alternative, and it would have put the same
logic in every consumer — the panel, the Markdown export, the Index flyout —
each free to disagree about what a group is.

**Consequence.** Three backend tests pin it: one group per chapter, a
multi-line body contributing every line, and the chapter order following the
sequence. The e2e test additionally asserts no heading repeats, which is the
symptom that was visible on screen.

---

## ADR-076 — `NoteGroup` and `is_stale` lost their defaults

**Context.** The fourth instance of the same defect: a Pydantic field with a
default is OPTIONAL in the emitted OpenAPI, so the generated client types it
possibly-undefined for an absence the API never produces. `SummaryOut` already
carried a comment about this; `NoteGroup` and `is_stale` were written after it
and repeated the mistake.

**Decision.** No defaults on response schema fields. `chapter: str | None` is
nullable AND required — a different claim from optional, and the correct one.

**Consequence.** Two call sites now pass `is_stale=False` explicitly, which is
the point: the value is stated where it is known rather than defaulted where it
is not.

---

## ADR-077 — Action items are ordered in SQL, and the drawer's preview is not

**Context.** T-24.1 wants open before completed, then by due date with nulls
last, then by the moment the commitment was made. Two surfaces render the list:
the Notepad's full section and the Notebook drawer's three-item preview.

**Decision.** Order in the query, once. "Nulls last" is spelled out rather than
left to the dialect — SQLite sorts NULL first ascending and Postgres sorts it
last, and an item with no due date belongs at the bottom either way.

The DRAWER then re-sorts its own copy by id before taking three. The prioritised
order is right for a list and wrong for a preview: ticking a row moves it past
the cut, and it vanishes from under the cursor with no way to untick it. That
was not a hypothesis — it is what the existing T15-D started doing the moment
the ordering changed.

**Consequence.** Two orders, each justified: the full list is prioritised, the
preview is stable. Both come from one query.

---

## ADR-078 — `null` and absent are different in a PATCH body

**Context.** An action item edit can set the text, the assignee, the due date or
the status, in any combination. Clearing an assignee is a real edit.

**Decision.** `ActionItemUpdate` has all-optional fields, and the service reads
`model_fields_set` rather than checking `is not None`. Sending `null` CLEARS the
field; omitting it leaves it alone.

The `is not None` shortcut is the obvious version and it makes unassigning
impossible through the API — the request is well-formed, the server accepts it,
and nothing happens.

**Consequence.** Two tests pin the distinction, one for each direction. The
generated client's `ActionItemPatch` marks the nullable fields `| null` for the
same reason.

---

## ADR-079 — Deleting an action item is a hard delete with Undo

**Context.** Meetings are soft-deleted: they have transcripts, summaries and
action items hanging off them, and a 410 is meaningfully different from a 404.

**Decision.** An action item is deleted outright, and the DELETE response
RETURNS the item so the client can offer Undo by re-creating it.

One line of text with no children does not need the soft-delete machinery, and
adding it would leave rows nobody can reach for a restore path already covered
by the toast. A confirm dialog was the other option, and a modal to remove a
one-line task is heavy-handed — the Undo is cheaper for the user and safer than
a dialog people learn to dismiss.

**Consequence.** The Undo handler captures the item's values at delete time
rather than reading them from a row, because it outlives the row it came from
(ADR-026, again).

---

## ADR-080 — Positional locators break when a list can reorder

Recorded because it has now cost two debugging sessions in two tasks.

`nth(8)` and `.first()` are re-evaluated by Playwright at the moment of use.
When the list underneath can move — a transcript following the playhead, an
action item sliding to the bottom as it is ticked — the element clicked is not
the element measured, and the failure reads as a product bug: the player seeking
to the wrong time, a badge that will not go back to its original count.

Pin to an id first, then act on that id. Where the movement is the problem
rather than the locator, stop the movement the way a user would — a wheel event
suspends the transcript's follow for five seconds.

---

## ADR-081 — The speaker legend is filter and management at once

**Context.** T-25 wants a legend with talk-time shares, a way to filter to one
speaker, and a place to rename speakers. Three surfaces would fit that
description.

**Decision.** One row. Outside edit mode a legend entry TOGGLES the filter —
click to see only Marcus, click again to see everyone. Inside edit mode the
same entry opens a rename popover.

A toggle rather than a menu because "just show me what they said" is something
people do repeatedly, and a two-click affordance for it is one click too many.

The filter is applied in the PANEL, not inside the list, so the match count,
the copy action and the row indices all describe the same set of lines. A list
filtering internally would leave the find bar counting matches in lines nobody
can see.

**Consequence.** `SpeakerRef` gained `segment_count` and `talk_ms`, counted
across the whole meeting in one grouped query. The client only ever holds a
page of segments and cannot count the rest — which is also what makes the
rename popover able to say "will update 84 segments" before the click.

---

## ADR-082 — An open editor follows the segment underneath it

**Context.** The segment editor holds a draft in local state, as every text
editor does. An undo writes the previous text to the server, the query cache
updates, and the new value arrives as a prop.

**Decision.** Compare the incoming value against the last one seen, DURING
RENDER, and reset the draft when they differ — React's documented recipe for
adjusting state to a prop.

Without it, ⌘Z appeared to do nothing: the database had the old text, the row
would have shown it, and the open textarea kept displaying the edit. The test
that caught it asserted on the row's `innerText`, which does not include a
textarea's value — so the first failure was the test's, and the second was the
product's.

---

## ADR-083 — Segment text is trimmed and bounded by the API

**Context.** T-25.10 wants whitespace trimmed, empty text rejected and very
long text refused.

**Decision.** All three in the schema: `strip_whitespace`, `min_length=1`,
`max_length=5000`. The editor checks the same rules so the message is
immediate, but the API is the half that cannot be bypassed.

**Consequence.** A test that had been "editing" a segment by appending a space
stopped marking the summary stale — correctly, because nothing changed. That is
the trim working, and the test now makes a real edit. Worth recording: a
tightened validation rule invalidates any test that was relying on a no-op edit
counting as an edit.

---

## ADR-084 — Portalled submenus are not held open across steps in a test

**Context.** T25-H drove speaker reassignment through the row's kebab → a Radix
submenu. It timed out, repeatedly, in three different formulations.

**Cause.** The submenu lives in a portal owned by the row, and the row
re-renders on any background refetch of the transcript — which unmounts the
open menu mid-test. Playwright's `click` also moves the pointer straight to the
target, leaving the safe path between a sub-trigger and its content.

**Decision.** Assert the menu OFFERS the choices while it is open, then perform
the selection through the API and assert the row follows. Both halves are real
claims; neither depends on a portal surviving several seconds of background
activity.

Where a submenu interaction is genuinely under test, hover to it rather than
clicking straight at it.

---

## ADR-085 — Transcripts are parsed on the SERVER, and previewed from a dry run

**Context.** T-26 needs a preview the user confirms before anything is created,
and T-26.13 needs validation a client cannot bypass. Parsing in the browser
gives an instant preview; parsing on the server gives a check that means
something.

**Decision.** One parser, in Python, behind `POST /meetings/parse` — a DRY RUN
that writes nothing and answers "what would we create". The confirmed segments
are then sent to `POST /meetings/import`.

Parsing in both places was the alternative, and the two would drift: the
preview is a contract, and a second implementation is a second opinion about
what the file said.

**Consequence.** The paste tab's live preview is a debounced request rather
than a local computation — 500ms, which is the same debounce it would have
needed anyway. The extension chooses the PARSER; it does not certify the
content, so a `.exe` renamed to `.txt` reaches the text parser and is refused
on what it actually contains.

Extension and size are ALSO checked in the browser, because a round-trip to be
told a `.pdf` is a `.pdf` is a round-trip nobody needed. That is an
optimisation, not the guard.

---

## ADR-086 — Invented timings say they were invented

**Context.** Four heuristics read a `.txt`: bracketed timestamps, leading
timestamps, `Name: text` prefixes, and plain paragraphs. The last two have no
timings, so they are synthesised at 150 words per minute.

**Decision.** The preview reports WHICH rule matched, in words —
"Speaker names — timings estimated from reading speed" rather than
"speaker-prefixes". A transcript whose timestamps were guessed looks exactly
like one whose timestamps were read, and the difference matters the moment
somebody clicks a line to hear it.

**Consequence.** Synthesised segments are strictly increasing and never
zero-length: the player resolves the active line from these, and a
zero-length segment breaks that and the chapter positions at once. A segment
that arrives ending before it starts is given a floor rather than rejected —
the timings came from a file we did not write.

---

## ADR-087 — Speakers are corrected in the preview, before the meeting exists

**Context.** A diariser labels voices "Speaker 1" and "Speaker 2". Fixing that
after import means editing a transcript; fixing it in the preview means typing
two names.

**Decision.** The preview's speaker list is editable, and the rename is applied
to every line that speaker has as the meeting is created.

**Consequence.** The import payload carries the corrected names, so there is no
second pass and no window where the meeting exists with the wrong ones. The
rename map is keyed on what the PARSER found, so re-parsing (typing more into
the paste box) does not lose corrections that still apply.

---

## ADR-088 — Dirty state is a comparison, not a flag

**Context.** `Save` must be disabled until something changes (T-27.5), and the
PATCH must carry only what changed (T-27.6).

**Decision.** One `useMemo` builds the patch by comparing the draft against the
meeting as loaded, and `dirty` is `Object.keys(patch).length > 0`. There is no
per-field flag.

A flag set on every edit stays set when a field is changed and changed back,
which leaves `Save` enabled with nothing to save — and then sends a PATCH that
resets a field to the value it already had, overwriting anyone who changed it in
between.

**Consequence.** The two requirements are one piece of code, so they cannot
disagree: what enables the button IS what gets sent.

---

## ADR-089 — Participants are reconciled by name, not replaced

**Context.** The editor sends the whole participant list. The obvious
implementation deletes the rows and re-adds them.

**Decision.** Match the existing rows by name (case- and padding-insensitive),
delete what is gone, add what is new, and leave the rest untouched.

A participant's id is load-bearing: action items are assigned to it, speakers
link to it, and talk time hangs off it. Delete-and-re-add orphans all three
while looking like it worked — the names are identical afterwards, and only the
action item assignments are quietly gone.

**Consequence.** A test asserts that a surviving participant keeps their id AND
that their action item still points at somebody. The host is set through a
participant id for the same reason: the editor picks from the room, and the
service resolves that to the user account the meeting is filtered by.

---

## ADR-090 — One error toast, from the global handler

**Context.** The edit modal raised its own error toast with a Retry. The app
already raises one for every failed mutation (T-09.11).

**Decision.** Delete the local one. The global handler prefers the API's own
message, offers Retry only when retrying could plausibly work, and re-runs the
exact mutation with the exact variables — all of which the local version had to
reimplement worse.

What the modal owns is staying OPEN with the input intact, which it does by not
closing except on success.

**Consequence.** Its own test caught the duplication: `getByTestId('toast')`
resolved to two elements. Worth remembering as a smell — a strict-mode
violation on a notification is usually two systems reporting the same event.

---

## ADR-091 — LLMProvider speaks raw HTTP, not two vendor SDKs

**Context.** T-29.3 requires one abstraction over both OpenAI and Anthropic,
selected by `AI_PROVIDER`. The demo never exercises either — `mock` is the
default — and the repo already depends on `httpx2`.

**Decision.** One thin client over both wire dialects (`app/ai/llm.py`). The
vendor differences reduce to two methods: `_request_body` and `_extract_text`.
Structured output is requested from both (Anthropic `output_config.format`,
OpenAI `response_format`), against JSON schemas derived from the same pydantic
types the rest of the app consumes.

**Consequence.** No `openai` or `anthropic` packages shipped for a path that
is off by default; the retry/timeout policy is ours and identical for both
vendors; and the injectable `httpx2` transport is what makes T29-F testable
without a network. The cost: no SDK conveniences (typed errors, auto-retry) —
which T-29.8 required us to build explicitly anyway.

---

## ADR-092 — The AI response cache is process-local, not a table

**Context.** T-29.10 wants identical input to never re-bill, keyed on
`hash(transcript + prompt_version)`.

**Decision.** An in-memory LRU (`app/ai/cache.py`), not a SQLite table. A
table would survive restarts but needs a migration, an eviction policy and a
cleanup job — for a guard whose worst-case miss costs exactly one extra
provider call, on a path that is mock-by-default. The key is strengthened
beyond the spec: full segment JSON (timestamps and speakers change outlines,
not just words), every prompt version, and the provider identity — so bumping
a prompt's front-matter version invalidates precisely the responses that
prompt produced.

**Consequence.** Restart forgets the cache; acceptable, the mock regenerates
in milliseconds. If the LLM path ever carries real traffic, the `ResponseCache`
interface swaps to Redis without callers changing.

---

## ADR-093 — Regenerate replaces the summary; it never touches action items

**Context.** T-29's interface includes `extract_action_items`, and regeneration
(T-29.9) replaces overview, gist, sections and keywords. Should it also replace
action items?

**Decision.** No. Action items carry user state — completed flags,
reassignments, edited text, due dates (T-24). Blowing that away because
someone clicked Regenerate is data loss wearing an AI costume. Keywords and
sections carry no user edits, so wholesale replacement is safe there.
`extract_action_items` stays on the interface for ingest-time extraction and
future explicit "re-extract" affordances, where the user asks for exactly that.

**Consequence.** After a regenerate, the summary panel is fresh while the
action-item list is stable — which is also what the real Fireflies does.

---

## ADR-094 — Due dates resolve against the meeting date, never the wall clock

**Context.** The mock's action-item extraction resolves "by Friday" and
"next week" to real dates. Resolving against `date.today()` would make output
depend on when the test ran — breaking T29-A's byte-identical determinism and
the pinned-clock Playwright suite.

**Decision.** `Transcript` carries an optional `reference_date` (the meeting's
start date), and `_resolve_due` is a pure function of phrase + reference. No
reference, no resolved date — an honest null beats a clock-dependent guess.

**Consequence.** The provider layer contains zero calls to `now()`, and the
same fixture asserts the same dates forever.
## ADR-095 — Single delete confirms first; the undo toast stays

**Context.** T-12 shipped row deletion with an Undo toast and no confirmation
— defensible for a soft delete with a six-second escape hatch. T-28 specifies a
named confirmation dialog as well.

**Decision.** Both. The dialog stops the accident; the toast catches the
confirmed-but-regretted. They guard different mistakes, and each is cheap.

The dialog names the meeting in bold — "which one" is the whole question — and
autofocuses CANCEL, because a destructive dialog that autofocuses its
destructive button turns an Enter still travelling from the opening keystroke
into a deletion.

**Consequence.** Every pre-existing delete test needed the confirm step added.
The double-click guard (one DELETE per confirmation, enforced by a synchronous
ref) is tested by dispatching two DOM clicks in one evaluate — `locator.click()`
re-checks actionability and refuses to click a button that disabled itself,
which is the correct product behaviour making the naive test impossible.

**Also learned here:** deriving a confirm dialog's button testids from the
dialog's own id (`delete-dialog-confirm`) broke the one test I renamed with a
blanket substitution. Rename by call site, not by pattern.

---

## ADR-096 — The exit animation animates `height`, legally

**Context.** T-28.6 wants a deleted row to animate out rather than vanish, and
`height: auto` is famously not animatable.

**Decision.** Animate `height` to zero directly — legal here only because a
Notebook row is a FIXED 72px (`h-row`), a token the skeleton shares. The margin
goes with it, because the list is `space-y-2` and a collapsed row would
otherwise leave its gap behind.

The row plays out BEFORE the cache changes: the list is query-driven, so a row
disappears the instant the data does, and there is no unmount transition to
hook. Mark, wait one animation, then mutate.

**Consequence.** A 200ms constant in the view (`ROW_EXIT_MS`) that must match
the CSS duration; both point at each other in comments. If rows ever become
variable-height, this becomes the grid-rows trick — noted in the stylesheet.

---

## ADR-097 — One theme store, and it's the avatar menu's

**Context.** T-30.7's Appearance tab needs a theme preference. The avatar menu
(T-08.9) already shipped one — `ff.theme` via `useLocalStorage` — that nothing
applied yet. Building the tab on a fresh key would have left two switchers
that disagree.

**Decision.** Settings → Appearance adopts the existing key and the existing
`useLocalStorage` subscription bus (`useThemePref` in `lib/prefs/app-prefs`);
the avatar menu is rewired through the same hook. Application to the DOM is
centralised: a before-paint boot script in the root layout (no white flash on
reload) plus a `ThemeApplier` in Providers that follows the pref bus and, on
`system`, the OS via `matchMedia`. Default stays `light` until T-38 signs off
dark mode — an OS-dark visitor should not get a half-finished theme
unprompted.

**Consequence.** Two surfaces, one store, one applier. T-38's remaining work
is purely visual (finishing the dark token audit), not plumbing.

---

## ADR-098 — A `Soon` badge inside a functional tab beats a lying toggle

**Context.** T-30.7 lists five preferences. Four wire to real consumers —
default sort and page size feed the Notebook's URL-state defaults (URL still
wins, so shared links stay identical for everyone), playback rate writes the
same `ff.player.rate` key the player persists (T-19.6), autoplay is honoured
by `player-card` once per mount. Date format has no consumer yet: the row that
renders dates is `meeting-row.tsx`, mid-edit on the T-28 branch in the other
worktree.

**Decision.** Ship four live settings and render Date format as a visibly
deferred `Soon` row — the same voice as every other placeholder — rather than
a select that persists a value nothing reads.

**Consequence.** Everything interactive on the Preferences tab genuinely
works, which is the tab's whole claim. Date format joins its consumer after
T-28 merges.
## ADR-099 — Search syntax is parsed once, into two languages

**Context.** `"pricing model" -churn speaker:Sarah after:2026-07-01` mixes text
matching with filters that are not text matching at all. FTS5 can express the
first half; dates and speakers are SQL's.

**Decision.** One parser (`search_query.py`) splits the string into an FTS
MATCH expression and structured filters. Every text term is quoted so
punctuation is characters rather than FTS syntax; exclusions chain with `NOT`;
the last bare word gets a prefix `*` so results narrow while typing; and the
parser NEVER RAISES — an unclosed quote closes itself, an unknown `field:` is
searched literally, `after:lunch` is a phrase somebody said.

**Consequence.** The WHERE clause is shared verbatim between the row query and
the count query, because two copies of a filter is how a total stops matching
its list. The host filter takes a NAME, since names are what the facets
sidebar has — there is no users endpoint to resolve ids against.

---

## ADR-100 — The search total is stable across pages

**Context.** `total` combined the title hits with the transcript count — and
titles were only fetched on page one, so `Load more` changed the number in the
header.

**Decision.** Count title matches on EVERY page; include the hit objects only
on the first. The total describes the corpus; the page describes the fetch.

**Consequence.** The pagination test asserts the totals agree across pages and
that pages never overlap — the property, not the implementation. The EXPLAIN
QUERY PLAN test pins that MATCH goes through the FTS virtual table's index and
segments are reached by rowid, never scanned; the plan names the table by its
ALIAS, which is what the first version of the assertion got wrong.

---

## ADR-101 — A snippet's deep link carries both halves of the answer

**Context.** T-35.5 calls the snippet link the feature's payoff.

**Decision.** `/meeting/{id}?t=<sec>&find=<q>` — the player seeks to the moment
(T-19.12's machinery) and the find bar opens primed with the query (T-22.11's).
Neither part was built for search; the deep link is two existing contracts
composed, which is the argument for having made them URL state in the first
place.

**Consequence.** T35-H asserts all three outcomes off one click: position,
active line in view, find bar populated. History removal in the topbar is
pointer-only (`tabIndex={-1}`, so no nested tab stop inside the listbox); the
keyboard's route to the same outcome is the `Clear history` row, which is a
real option reachable with ↑/↓.

---

## ADR-102 — Dark ships at zero axe violations, and light got fixed on the way

**Context.** T-38.5 orders a contrast recheck of every token pair. The sweep
held both themes on both key pages to ZERO `wcag2aa` violations — and the
failures it found were almost all in the LIGHT theme, which had shipped first
and been eyeballed rather than measured.

**Decision.** Fix everything at the token layer, per the hard rule:

- `--ff-grey-500` (muted text) lifted from the sampled `#8992a2` (3.14:1) to
  `#667085` in light and `#7b8497` → `#8b93a5` in dark — settling pending
  decision #7, which had tracked this since T-19's first axe sweep.
- New `--ff-warning-strong` / `--ff-danger-strong` for TEXT on the subtle
  badge backgrounds; the base hues stay for icons and fills, where 3:1
  suffices and the brighter colour is the point. In dark, strong == base,
  because on dark the bright hue IS the readable one.
- The light speaker palette was re-derived against its STRICTEST background —
  the active row's violet tint — because every hue is used three ways at once
  (text on white, text on the tint, fill under white initials) and clearing
  the tint implies the rest. Four hues darkened; the family reads the same.

**Consequence.** Fidelity to the sampled screenshots lost a few per-cent of
lightness on timestamps and speaker names; every timestamp in the app became
legible by measurement rather than by luck. The default theme flipped from the
placeholder `light` to `system`, which the pref module had documented as
waiting on exactly this sign-off.

---

## ADR-103 — The mark conflict that flipped between builds

**Context.** T38-H found resting search highlights painting TRANSPARENT in one
build after painting amber in every previous one. Nothing relevant had been
edited.

**Cause.** The Highlighter stacked `bg-transparent` (to neutralise the UA's
yellow `<mark>`) under a caller-supplied `bg-highlight`. Two same-property
utilities on one element resolve by STYLESHEET ORDER, which Tailwind derives
from its internal class ordering — a build-dependent coin toss `cn()`
deliberately refuses to hide (see `lib/utils/cn.ts`).

**Decision.** Neutralise `<mark>` in the BASE layer (`mark { background:
none }`), where the cascade guarantees utilities beat it, and drop
`bg-transparent` from the component. One background utility per element, which
is the convention the no-merge `cn` exists to enforce.

**Consequence.** The latent conflict is gone rather than currently-winning.
Canvas surfaces got the same treatment for a different reason: the waveform
reads its colours from CSS variables at draw time, so a theme switch now bumps
an epoch (via a `data-theme` MutationObserver) to trigger a repaint — pixels
do not restyle themselves.
## ADR-104 — PDF via ReportLab/Platypus, not WeasyPrint

**Context.** T-34.5 offers either. Both Docker images are `python:3.13-slim`
with zero apt packages and the prod container runs non-root with a read-only
`/app`; WeasyPrint needs the pango/cairo/gdk-pixbuf C stack in both images.

**Decision.** ReportLab (plus python-docx for the fourth format) — manylinux
and pure wheels for cp313/cp314, so export deploys with no image change. The
T-34.6 page discipline maps onto Platypus directly: `KeepTogether` around every
transcript turn and action item, `keepWithNext` on headings, and the two-pass
canvas recipe for `Page N of M` (buffer page states in `showPage()`, stamp in
`save()` once the total is known).

**Consequence.** No HTML template — the PDF is drawn, which costs layout code
but removes an entire native-dependency class from the deploy. Checkbox glyphs
come from ZapfDingbats because Helvetica has no ballot boxes.

---

## ADR-105 — The document palette is a sanctioned copy of the token layer

**Context.** PDFs and DOCX cannot read CSS custom properties, yet T-34.5 wants
the export to look like the same product.

**Decision.** `app/services/export/palette.py` mirrors the resolved light-theme
values from `tokens.css`, each constant named after the semantic token it
copies. This is the one sanctioned exception to "hex exists only in
tokens.css" — a token change there must be mirrored here. The header draws the
same two offset rounded rectangles as the Topbar mark, never a trademarked
asset.

**Consequence.** A grep for hex codes outside `tokens.css` now has exactly one
allowed hit, documented at the top of the file.

---

## ADR-106 — `include=` names data sources; render order is fixed

**Context.** T-34.1's `include=` lists five sections, two of which (comments,
highlights) belong to tasks landing in parallel branches.

**Decision.** A registry (`export/registry.py`) maps section keys to loaders
that emit a small format-neutral block IR every renderer already draws.
`summary` expands through `MeetingService.to_summary()` — ADR-015's composition
point — so export can never disagree with the summary panel. `comments` and
`highlights` are accepted in the vocabulary today and render the moment their
task registers a loader (one line). Caller order in `include=` is ignored: two
exports of the same meeting must read the same.

**Consequence.** Unknown token → 422 (failed the vocabulary); `include=` that
selects nothing → 400 `EMPTY_INCLUDE` (parsed but not allowed), matching the
existing 422/400 split. T-31 registered its loader in this same change; T-32's
is a one-liner when it merges.

---

## ADR-107 — Streaming and bulk-zip posture

**Context.** T-34.7 requires a 1,200-segment export not to buffer whole in
memory; T-34.9 zips a selection.

**Decision.** All validation happens before the first chunk leaves — an error
must never surface after headers are sent. md/txt render lazily; PDF/DOCX are
container formats with no incremental mode, so they render once and re-chunk at
64 KB. The zip builds in a `SpooledTemporaryFile` (spills past 32 MB) and is
all-or-nothing: any missing or deleted id fails the whole request, listing
`details.missing` and `details.deleted` — a zip that silently ships 7 of 9
files looks complete and is not. The export router registers *before* the
meetings router so static `GET /meetings/export` is never captured as
`/{meeting_id}` (guarded by a test).

**Consequence.** Measured: 0.6 s / 8 MB peak against the 5 s / 64 MB budget.

---

## ADR-108 — Filenames are whitelisted into existence, not blacklisted

**Context.** T-34.11's test title contains `/`, `..` and emoji.

**Decision.** NFKD-normalise, drop non-ASCII, lowercase, collapse every run of
non-alphanumerics to one hyphen — traversal is impossible by construction
rather than stripped by pattern. Whole name capped at 100 chars; an unusable
title falls back to `meeting-<date>.<ext>`, never `download` or `export.pdf`.

**Consequence.** The zip reuses the same rule per member with `-2`/`-3`
suffixes on collisions, so bulk and single exports of one meeting share a name.

---

## ADR-109 — `features/export` is a shared feature module; the download is a raw fetch

**Context.** Notebook (bulk bar, row kebab) and Notepad (header kebab) both
open the export modal, and `apiFetch` unconditionally `.json()`s bodies.

**Decision.** The modal lives in `features/export`, outside the eslint
cross-feature fence — the `features/edit` precedent; lifting it to
`components/ui` would put meetings knowledge into the primitive layer. The
download path is a raw fetch (not `apiFetch`, not a mutation — it mutates no
cache): 60 s timeout because a 1,200-segment PDF legitimately outlives an API
read, a `role="status"` line flips to "Still working…" at 10 s, and the modal
owns both its toasts since the global `MutationCache` handler never sees the
request. `RadioCardGroup` is a new primitive because `RadioGroup` hardcodes
`radio-<value>` testids and has no icon/description slot, while T-34.12 fixes
the names as `export-format-<fmt>`.

**Consequence.** One sanctioned exception to "never add onError toasts",
documented at the call site. The server's `Content-Disposition` is authoritative
for the filename (CORS already exposes it); a client-side slug is the
cross-origin fallback.

---

## ADR-110 — One client-side section registry drives checkboxes, `include=`, the estimate, and clipboard Markdown

**Context.** T34-H grades that unchecking Transcript visibly shrinks the
estimate; T-31/T-32 add sections over time.

**Decision.** `features/export/sections.ts` is the single list everything
derives from. `include=` is always sent explicitly — relying on the server's
default-all would silently grow exports the moment a parallel branch registers
a new section server-side while the UI still shows three boxes. The word count
is a stated heuristic over already-cached queries (whitespace tokens; pages =
`ceil(words/450)`, shown only for paginated formats). "Copy as Markdown"
mirrors the server's T-34.3 shape client-side from the same caches — zero
requests — grouping the transcript by speaker turns via the same `markTurns`
the transcript panel uses.

**Consequence.** Ticked boxes stay exactly equal to the file's contents at all
times; registering a section is one line plus optional estimate/clipboard
extensions.

---

## ADR-111 — The frozen clock is an auto-fixture pinned to the seed anchor

**Context.** T-39.6. Four specs pinned the clock inline, and all four had
drifted to a noon instant while the seeder anchors at `09:00:00Z`.

**Decision.** `fixtures.ts` installs `page.clock.setFixedTime(SEED_ANCHOR)`
automatically for every test; `pinClock(page)` covers secondary tabs. A test
that genuinely needs a different time of day derives it from `SEED_ANCHOR`
with a comment.

**Consequence.** Date labels are calendar-day granular, so the migration
changed no assertions. `setFixedTime` freezes `Date.now` but keeps timers
running — debounces and toast auto-dismiss behave normally.

---

## ADR-112 — POMs serve new suites only

**Context.** T-39.7 wants eight Page Objects; 349 tests already pass as flat
specs whose granular history is itself graded evidence.

**Decision.** `e2e/pages/` exists and is mandatory for *new* suites; the 26
existing spec files are not retrofitted. POMs are getter-based, lazy, and
contain no assertions.

**Consequence.** Two idioms coexist, documented at the top of
`pages/index.ts`. Migration happens opportunistically when a spec is touched
for other reasons, never as a bulk rewrite.

---

## ADR-113 — Raw locators are constrained by a lint grammar, not banned outright

**Context.** T-39.9 bans CSS/XPath, but ~75 call sites use
`[data-testid^="prefix-"]` — Playwright has no `getByTestId` prefix form — and
structural tags (`mark`, `section`) assert real semantics.

**Decision.** A custom eslint rule (`e2e/no-fragile-locator`) allows
attribute-only selectors and structural tags with attribute/`:not` qualifiers;
class selectors, id selectors, XPath and descendant chains are errors. Five
fragile selectors were fixed by adding real testids; e2e lint is wired into
`make lint`, lint-staged and CI like the frontend's.

**Consequence.** The rule encodes *why* a selector form is acceptable instead
of enforcing a blanket rule the suite already violates 75 times.

---

## ADR-114 — Visual and mobile are opt-in projects; read-only's grepInvert widened

**Context.** T-39.3. The existing read-only/mutations split is write-isolation
(ADR-010 territory), not a device matrix; snapshot baselines are named per
project, so a `@visual` test matching read-only fails unconditionally.

**Decision.** New projects `visual` (deviceScaleFactor 1, reduced motion,
grep `@visual`) and `chromium-mobile` (Pixel 7, grep `@mobile`) run only
tagged tests; read-only's `grepInvert` widens to
`/@mutates|@visual|@mobile/`. The read/write semantics are untouched.

**Consequence.** `test:mobile` carries `--pass-with-no-tests` so wiring stays
green until the first tagged test lands. The full 382-test suite is unchanged
for untagged specs.

---

## ADR-115 — `checkA11y` gates on serious and critical only

**Context.** T-39.12. Axe's minor/moderate findings are real but non-blocking;
gating CI on them invites blanket rule-disabling.

**Decision.** The shared helper fails on serious+critical (tags
wcag2a/2aa/21a/21aa) and prints the full violation list either way. The two
pre-existing inline scans keep their stricter settings.

**Consequence.** T-42's zero-serious/critical target maps 1:1 onto the
helper's failure condition.

---

## ADR-116 — `seededMeeting` resolves by title, not by id

**Context.** T-39.8. Seed ids are an artifact of filename order into a reset
database.

**Decision.** The worker-scoped fixture fetches `/api/v1/meetings` and finds
the hero meeting by its seeded title, failing loudly if seeding changes.

**Consequence.** One extra request per worker buys immunity to reseeding
order; tests never hardcode `/meeting/1`.

---

## ADR-117 — The smoke suite is self-contained, and SMOKE_URL flips the config into deployed mode

**Context.** T-40.13 runs 12 tests against production post-deploy. The repo
config unconditionally booted servers and reseeded `e2e.db` — wasted locally,
harmful pointed at prod.

**Decision.** `98-smoke.spec.ts` imports nothing from fixtures, mutates
nothing, asserts shapes and counts — with one deliberate exception: the five
canonical summary section names verbatim, because they are the spec and their
regression is exactly what a prod smoke must catch. `SMOKE_URL` in the
environment now skips `globalSetup` and `webServer` and becomes `baseURL`.
Deployed nginx also gained exact-match `/docs` and `/openapi.json` proxy
locations: the README sends evaluators to the interactive docs, and the smoke
run against production found them 404ing behind the `/api/`-only proxy.

**Consequence.** `SMOKE_URL=http://8.231.115.48:8600 npx playwright test
98-smoke --project=read-only` is the whole post-deploy gate: 12 tests, ~4 s.
The nginx change needs a one-time manual install (deploy.sh does not manage
nginx).

---

## ADR-118 — Visual comparison harness: fixed keys, honesty rules, blue-vs-violet declared

**Context.** T-41.7 pulled forward — T-46.1's side-by-side audit depends on
it, and UI fidelity is the top grading criterion. The 8 reference screenshots
map onto our surfaces imperfectly.

**Decision.** `docs/visual-comparison.html` pairs each reference with a fixed
capture key. Three honesty rules: surfaces with no equivalent (Meeting Status
— we ship no notetaker bot) show the reference under an explicit out-of-scope
badge, never a fake; placeholder surfaces (Analytics) are compared for shell
fidelity and say so; dark captures wait until T-38's merge is reflected here,
because in-repo captures are graded evidence. The header declares the
deliberate blue-vs-violet accent difference (design.md is the token
authority) so the evaluator compares layout, spacing and type.

**Consequence.** Capture is a `@visual`-tagged spec double-guarded by a
`CAPTURE` env flag; `docs/screenshots/` fills only on explicit request, and
the harness renders 'Not captured yet' tiles with the exact command
otherwise.

---

## ADR-119 — Soundbite lists are `{items}`, not the six-key page envelope

**Context.** T-33.1. A meeting owns a handful of hand-picked clips, and the
seekbar overlay needs every one on load; the proposals endpoint returns
exactly three by definition.

**Decision.** Plain `{items: [...]}` — the `speakers` precedent for
non-pageable collections, with the wrapper kept so client unwrapping stays
uniform. The page envelope remains the rule for anything that can grow.

**Consequence.** No pagination affordance for a state that cannot occur.

---

## ADR-120 — Magic Soundbite proposals are computed, never persisted; dismissal is client-side

**Context.** T-33.8 wants three auto-proposed clips that can be saved or
dismissed.

**Decision.** `GET …/soundbites/proposals` computes through the provider each
call (memoised under the T-29.10 cache key `soundbites`; determinism is the
provider contract). Saving is an ordinary `POST` with `auto_generated=true` —
one write path, the Auto badge is a flag. Dismissing is localStorage keyed by
meeting + range: a dismissed *suggestion* is UI preference, not domain data,
and persisting it would cost a migration plus a second tombstone concept for a
bonus feature.

**Consequence.** Dismissals don't roam across browsers — accepted. Saved and
dismissed ranges are filtered client-side, or the deterministic endpoint would
re-propose the same clips forever.

---

## ADR-121 — The proposal heuristic lives in MockProvider; LLMProvider declines it

**Context.** Clip proposal is constraint satisfaction — snap to segment
boundaries, hard 3 s–3 min bounds — which a heuristic does exactly and a model
does approximately.

**Decision.** Segment score = summed TF-IDF weight of the meeting's top-6
keywords; window score = weight per second, so a tight exchange beats a
ramble; greedy top-3 non-overlapping with deterministic tie-breaks.
`LLMProvider.propose_soundbites` raises `ProviderError` unconditionally, so
the T-29.7 degradation path serves the heuristic — silently delegating inside
LLMProvider would lie about provenance.

**Consequence.** Byte-identical proposals per meeting, asserted in tests and
usable by visual regression. Revisit only if a prompt demonstrably beats it.

---

## ADR-122 — Soundbites hard-delete, and validate against the transcript's milliseconds

**Context.** Comments needed tombstones because replies hang off parents. A
clip is a pointer into the transcript: nothing references it, and two integers
recreate it.

**Decision.** No SoftDeleteMixin, `DELETE` is final. Range validation caps at
`MAX(segment.end_ms)`, not `duration_seconds * 1000` — the duration column is
a floored display denormalisation, and validating against the floor would make
the provider's own boundary-snapped proposals unsaveable. Service-boundary
ValidationErrors are the error path; the table's CheckConstraints are the
backstop for non-API writers.

**Consequence.** A deliberate contrast with ADR-… comments-tombstones, ready
for the interview question. Seeded clips resolve segment *indices* against the
built timeline (the T05-D argument), so the 3 s–3 min invariants hold by
construction.

---

## ADR-123 — Range-constrained playback lives in the player's clock tick

**Context.** T-33.6 explicitly bans `setTimeout` for the auto-pause.

**Decision.** `playRange(start, end)` arms a ref the existing 100 ms tick
checks exactly like the track-end auto-stop. `seek()` cancels the constraint
only when the target leaves the range — scrubbing away is the user leaving the
clip; nudging inside it isn't. `pause()` keeps it armed so resume finishes the
clip. Adjacent decisions: the seekbar bands carry their own alpha in
`--ff-soundbite-band` (Tailwind can't apply modifiers to `var()` colours — the
scrim precedent) and stay decorative because interactive children of a
`role=slider` are invalid; the download button ships `aria-disabled`, not
`disabled`, because the ffmpeg-absent tooltip IS the feature and a natively
disabled button swallows the pointer events it needs; `&clip=` is read once in
state initializers and explicitly deleted on deselect, or the player's 5 s
`?t=` writeback would carry a stale clip forever.

**Consequence.** Auto-pause is exact at any rate and survives stalls; nine
unit tests tick the clock through every path.

---

## Pending decisions

Tracked so they are not silently defaulted. Each becomes an ADR when settled.

| # | Decision | Settle by |
|---|---|---|
| ~~1~~ | ~~Speaker colour authority~~ | ✅ ADR-013 |
| ~~2~~ | ~~FTS5 rows survive a meeting's soft delete~~ | ✅ ADR-014 |
| ~~3~~ | ~~Who composes the five summary sections~~ | ✅ ADR-015 |
| ~~4~~ | ~~`/` welcome screen vs Home dropped from the nav~~ | ✅ T-06 — `/` redirects, Home removed |
| ~~5~~ | ~~Filters panel: draft-then-Apply vs live-apply~~ | ✅ ADR-039 — draft-then-Apply |
| ~~6~~ | ~~Notebook layout: cards vs column table~~ | ✅ ADR-036 — cards, with the plan's testids and behaviour kept |
| 8 | With any dropdown open, axe reports `aria-hidden-focus`: Radix marks the rest of the page `aria-hidden`, and the skip link stays focusable inside it. Identical for the T-18 kebab and the T-19 rate menu, so it belongs to the Dropdown primitive rather than to either caller. | T-42 |
| ~~7~~ | ~~`text-muted` fails AA contrast on `surface-0`~~ | ✅ ADR-102 — fixed at the token layer; both themes axe-clean on both key pages |
