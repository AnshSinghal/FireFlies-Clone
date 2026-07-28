# Interview notes (T-46.11)

Answers to the questions this build invites, with the file to open while
answering. `docs/decisions.md` is the long form — 138 ADRs written as the
choices were made; this is the short form for the seven most likely questions.

## 1 · Why this schema?

`docs/schema.md`, `backend/app/models/`.

Three decisions carry the rest:

- **Durations are INT milliseconds** (`start_ms`/`end_ms`), never `"00:04:32"`.
  Formatting happens at the presentation edge. A stored string cannot be
  compared, summed, or seeked to, and every feature that came later —
  transcript↔player sync, soundbite ranges, seekbar markers — is arithmetic on
  those integers.
- **Speakers are an indirection, not a string on the segment.** A meeting has
  speakers; segments point at one. Renaming a speaker is one UPDATE rather
  than a scan, and speaker colour has somewhere to live (`color_index`,
  ADR-013: the DB is authoritative, the name hash is the fallback).
- **Soft delete on meetings, hard delete where nothing references the row.**
  Meetings carry `deleted_at` because delete-and-undo is a specced flow;
  soundbites hard-delete because a clip is a pointer into a transcript that
  two integers recreate (ADR-122). The contrast is deliberate — comments
  needed tombstones because replies hang off parents.

The FTS5 trap worth volunteering: triggers fire on `transcript_segments`, so
soft-deleting a *meeting* does not touch its segments. Global search joins back
to `meetings` and filters `deleted_at IS NULL`, or deleted meetings surface in
results (ADR-014).

## 2 · How would you swap SQLite for Postgres?

Most of it is the URL. What actually needs work:

- **FTS5 is SQLite-specific.** Global search would move to `tsvector` +
  `ts_rank`, or to pgvector if the goal is semantic rather than lexical. The
  search service is one module, and `EXPLAIN QUERY PLAN` is asserted in a test
  (T-43.9) precisely so a rewrite has a bar to clear.
- **The `lower(name)` functional unique index** on tags (ADR-125) is portable;
  the `PRAGMA` block (WAL, `foreign_keys=ON`, `busy_timeout`) is not, and
  Postgres needs none of it.
- **Connection pooling becomes real.** The single-instance in-memory rate
  limiter (`core/rate_limit.py`) is already flagged in-file as needing Redis
  the moment there is more than one process — same for any per-instance state.

## 3 · Why virtualise the transcript?

`features/notepad/transcript/transcript-list.tsx`.

A 4-hour meeting is ~5,000 segments; T-42.11 seeds exactly that as a stress
case. Without windowing, every clock tick re-renders thousands of rows and the
sync feature — the most graded interaction — is what degrades first.

`@tanstack/react-virtual`, `overscan: 10`, `estimateSize` replaced by
`measureElement` because segments run one line to six. The subtlety worth
raising: `initialOffset` tells the virtualiser which rows to *render*, not
where to *scroll* — assume otherwise and the DOM sits at the top with correct
rows drawn below the fold, silently losing every remembered position.

## 4 · How does player↔transcript sync avoid re-render storms?

`lib/player/use-player.ts`, `player-context.tsx`, `transcript-list.tsx`.

The clock ticks at 100ms. If every tick re-rendered the list, a 5,000-row
transcript would spend its life in reconciliation. Three defences:

- **Position lives in a ref** (`positionRef`), not only in state, so logic that
  needs the current time does not force a render to read it.
- **`SegmentRow` is memoised by hand with an explicit comparator** (T-20.13).
  The list component deliberately is *not* memoised — the virtualiser returns
  fresh function identities every render by design, and memoising around them
  serves stale measurements. The rows are the many; the list is the one.
- **Auto-scroll keys on the active row INDEX, not on `currentMs`.** Scrolling
  every tick would fight the user's own scrolling.

Range-locked playback (soundbites) is enforced *in that same tick* rather than
with `setTimeout` (ADR-123) — a timer drifts the moment the rate changes, the
media stalls, or the user pauses mid-clip.

## 5 · How would you add real speech-to-text?

The provider abstraction already exists for summaries (`app/ai/`): an ABC,
`MockProvider` (deterministic, the default), `LLMProvider`, and wrappers for
fallback and caching. STT is the same shape one layer earlier:
`TranscriptionProvider.transcribe(media) -> segments`, with Whisper behind it.

Two things make it non-trivial and are worth saying out loud: transcription is
minutes-long, so it needs a job queue and a status the UI can poll — the
existing `processing` meeting state is where that would surface — and
diarisation output has to map onto the `speakers` table rather than inventing
per-segment strings.

## 6 · Where were the N+1s, and how did you find them?

`backend/tests/test_query_budget.py`, `conftest.py:129`.

Found by instrumenting rather than by reading: `assert_max_queries(n)` counts
statements around a request. The list and detail routes are pinned at
`LIST_BUDGET = 11` and `DETAIL_BUDGET = 9`, each with the measured floor in a
comment. The guard earns its keep on *every later feature* — adding tags to
list rows or comment counts to detail had to prove it did not add a query per
row, and the budget is the thing that makes "it feels fast" falsifiable.

## 7 · What would you refactor with another week?

- **Retire the two duplicate spec-number prefixes** and the flat spec layout in
  favour of the POM-per-suite pattern `e2e/pages/` already establishes — the
  POMs currently serve new suites only (ADR-112), which is a deliberate
  half-measure.
- **A database per Playwright worker.** The read-only/mutations split contains
  write races today, and the mutations project runs single-worker because
  files raced each other (60/61 vs 61/61 — measured). Per-worker databases
  would let writers parallelise, at the cost of a backend process each.
- **Lift the export palette back to a generated artifact.** `export/palette.py`
  copies resolved token values because a PDF cannot read CSS custom properties
  (ADR-105); generating it from `tokens.css` at build time would remove the one
  sanctioned place where a hex code lives outside the token layer.
- **Close the last density gap.** Card height is 1.29× the topbar against the
  reference's 1.51 (`docs/ui-audit.md`). The two gap tokens next to it were
  measured and fixed (ADR-149); this one is deliberately still open because
  `72px` is load-bearing — `design.md` §3.7 fixes it, T12-B asserts it, the
  skeleton mirrors it. (This bullet used to end "and the virtualiser sizes items
  from it, so a wrong value breaks scrolling" — my claim, propagated from
  ADR-149, and false: the virtualiser is on the TRANSCRIPT list and estimates
  from its own `ESTIMATED_ROW_PX = 92`; the notebook is not virtualised. The
  real obstacle is that the reference scales to ~79-85px depending on whether
  you transfer through the topbar or the type scale.)

*(A fourth item lived here until 2026-07-27: "revisit `formatMeetingMeta`,
rows show `7:13` where Fireflies shows `30 min` — kept for consistency with the
player clock." It was not a refactor to consider, it was a defect I had argued
myself into keeping. The pinned test I cited as justification was named
`matches the reference screenshots` and asserted `30:00` for 1800 seconds — the
reference's own row. Fixed in ADR-148; the reasoning is dissected in the audit
because the failure mode is worth more than the fix.)*

## 8 · Which bugs did the tests find that reading the code could not?

Four, and the mechanism matters more than the bug in each case.

**The transcript silently stopped at 200 lines.** `useTranscript` fetched one
page and never followed `next_cursor` — its own docstring said
paging-to-exhaustion was coming, and it never arrived. Any meeting over 200
segments showed 200 lines, and the find bar answered `0 of 0` for a word
plainly in the recording, because it searches what the client holds.

*Why nothing caught it:* every seeded meeting tops out at 159 segments. The bug
needed a transcript longer than any fixture in the project to become visible,
so no amount of running the existing suite could have surfaced it. The fix was
to build the fixture — `34-stress.spec.ts` imports a 5,000-segment meeting
through the real ingest path, asserts on it, and deletes it again so the seed
counts a dozen other specs depend on stay put.

**Three of the eight speaker hues were the same violet.** `--ff-speaker-6` and
`-7` were `#6f4ff0` and `#6d4be8` — ΔE 2.5 apart, and both barely separable
from speaker-0. The comment above them said "chosen to be distinguishable at
24px".

*Why nothing caught it:* it is not a contrast failure, so axe is silent, and at
a glance eight violet-ish avatars look like a palette. It took writing the
dichromacy simulation in `33-colour-vision.spec.ts` and printing the worst pair
to see that the worst pair was in *ordinary* vision. Worth knowing: eight hues
cannot all separate under red-green blindness while still looking like a normal
palette, so the real mitigation is that a speaker's name is always rendered
beside their colour — which that spec now asserts directly.

**Nothing in the deployed chain was gzipping, and the nginx config had never
been deployed at all.** `next start` compresses HTML and RSC responses but
serves `/_next/static` untouched, and the entry point had no `gzip` block — so
every visitor downloaded ~2.7× what they needed. Chasing it turned up the
larger problem: `deploy.sh` only ever rebuilt containers, so
`nginx-fireflies.conf` had sat in git looking applied since T-44 while the box
ran whatever was installed by hand.

*Why nothing caught it:* the repo and the box disagreed and nothing compared
them. The measurement that exposed it was a route-JS budget that gzipped the
bytes itself rather than trusting the wire — `responseBodySize` was reporting
raw bytes against a budget denominated in gzipped ones.

**Both built-in sidebar views showed an empty Notebook.** "All Meetings" and
"My Meetings" link to `?channel=<id>`, which went straight to the API's
`channel` filter — and that matches a *stored* channel slug. Neither built-in
is one, so both queries matched nothing.

*Why nothing caught it:* the rail's badges kept reporting 8 and 2 beside the
empty list, because the counts come from a different endpoint that knows what
the views mean. Two of the app's most prominent nav items were dead, under
correct-looking numbers.

The through-line: each one needed an instrument that did not exist yet — a
longer fixture, a colour simulation, a compression-aware measurement, a test
that clicks the nav rather than trusting its badge. Reading the code would not
have produced any of them, and neither would running the suite as it stood.

## 9 · Where is your test suite weakest?

The visual-regression layer, and I can put a number on it.

`97-visual.spec.ts` compares full-page screenshots with
`maxDiffPixelRatio: 0.015`. At 1440×900 that is 1,296,000 pixels, so the
tolerance is about **19,400 differing pixels** before a test fails.

T-46 changed every row's duration from `7:13` to `7 min` — eight rows of
changed glyphs, on the order of 2,400 pixels. The visual suite passed. It was
an intended change, so nothing broke; but a suite that cannot see an intended
text change of that size cannot see an unintended one either, and catching
unintended visual change is the entire reason T-41 exists.

The tolerance is not arbitrary — it absorbs font antialiasing, which genuinely
varies run to run and is the classic source of visual-test flake. But 1.5% of a
full page is the wrong unit for the job: it scales with page area, so the
larger the screenshot the more real change it hides.

**What I would do instead**, in order of how much I trust it:

1. **Shrink the comparison surface.** Element-level shots (`sidebar`, `topbar`,
   the filters panel — which this spec already does for three of them) let the
   ratio stay loose while the absolute pixel budget gets small. A 240×900
   sidebar at 1.5% is ~3,200 pixels, not 19,400.
2. **Switch full-page shots to `maxDiffPixels`, not a ratio.** An absolute
   budget of a few hundred pixels absorbs antialiasing without scaling up with
   the viewport.
3. **Mask the volatile regions** (relative dates, avatar hues) rather than
   buying tolerance for the whole frame to accommodate them.

I did not change the existing budgets during this task, and the reason is worth
stating: it would re-baseline 165 committed snapshots to tighten a threshold
whose flake rate I had not measured. Tightening a test on a hunch and
re-recording every baseline to make it green is how a suite quietly stops
meaning anything. Measure the run-to-run noise floor first, then set the budget
just above it.

**Then I proved the point on myself.** Adding the first visual coverage for
Settings, I wrote it as a full-page shot, watched four baselines go green, and
was one commit away from calling that surface protected. It was not: changing
the card padding from `p-4` to `p-6` — a visible 8px shift on every card —
passed. Settings is mostly whitespace, so five cards moving hide inside 19,400
pixels of tolerance.

Fix number 1 above, applied: shoot the panel instead of the page. Same ratio,
much smaller absolute budget, and the same `p-4` -> `p-6` edit now fails all
four. Verified by breaking it deliberately, watching them fail, and restoring.

**Fix number 2 applied too, and it found three stale baselines.** `PAGE_SHOT`
now carries `maxDiffPixels: 6000` instead of `maxDiffPixelRatio: 0.015`,
calibrated from two measurements rather than intuition: the `p-4` -> `p-6`
defect moves **10,592 pixels**, and repeated runs vary by **0**. The ratio was
the wrong unit — that one defect is 0.026 of a 548×736 element and fails, but
0.008 of a 1440×900 page and passes. One defect, one pixel count, two verdicts.

Switching immediately failed three notepad snapshots at 17,525 pixels — 1.35% of
the frame, sitting just under the old 1.5% budget. They were **stale**, not
noisy: committed before some earlier change and passing ever since because the
tolerance was fractionally wider than the error.

**And a measurement mistake worth owning**, because it is the same class as
everything else in §10. I first "measured" the noise floor by regenerating all
165 baselines three times and reporting that zero files changed. That is not
what it showed. `--update-snapshots` only rewrites baselines that FAIL, so zero
files changed meant *everything passed under the old budget* — not *the render
is byte-identical*. The two readings are indistinguishable unless you know the
flag's semantics, and I reported the stronger one. The real noise floor, checked
properly by comparing fresh baselines twice, is zero — the conclusion survived,
the evidence I gave for it did not.

Two things I would want an interviewer to take from that. **A baseline that has
never failed is not evidence** — adding a screenshot test and seeing green is
the most natural way in the world to conclude a surface is covered, and it is
exactly the move that leaves you unprotected. And I nearly mis-diagnosed it:
the run took 15 seconds, so my first instinct was that the server had not
rebuilt. The config says `reuseExistingServer: false` with `npm run build`, so
the change was live and the tolerance really did absorb it. Stopping at the
plausible explanation would have had me "fix" a caching problem that did not
exist and ship the real weakness intact.

## 10 · Your tests were green all day. What did they miss?

Everything that mattered on 2026-07-28, and the pattern is one I would want to
be asked about because it is not a testing gap — it is a gap between the code
and the documents describing it, which no test in this repo was ever going to
close.

**What was wrong while the suite was green:**

- `design.md` — the file `CLAUDE.md` calls the token authority — specified
  **ten** colours the app does not use. The accent still read `#2A6EF4` blue
  eight weeks after ADR-011 sampled the reference and moved it to `#6A39EF`
  violet. The whole dark palette was the pre-violet blue-grey scale.
- **ADR-012's decision had been reversed in code and never written down.** It
  says ship `--ff-text-muted` at `#8992A2`, 3.14:1, "knowingly not AA, expect
  this to be the one axe exception". The app ships `#667085` at **4.97:1** —
  full AA. An interviewer reading that ADR would be told the product knowingly
  fails a contrast threshold it actually passes.
- `docs/visual-comparison.html` — the page an evaluator opens to compare
  screenshots — told them to **expect a hue difference** that no longer exists,
  apologising for a match the project had earned.

**Why green tests could not catch any of it.** Layout tokens are pinned by
exact assertions: `08-notebook` asserts `toBe(72)` on the row height, so moving
it fails the same afternoon. Colour tokens are only ever property-tested —
`tokens.test.ts` has eleven `toBeGreaterThanOrEqual` contrast assertions and
**zero** assertions on any specific hex. A property test protects the property
and abandons the value. Every one of these drifts *improved* its property, so
the suite went greener while the prose became fiction.

**What I did about it.** `scripts/check_design_tokens.py`, in `make lint`: it
resolves every hex in `design.md` through the token cascade — following
`var()` chains, dark scoped against the dark block — and fails when the two
disagree. Twenty lines. It found the last eight of the ten immediately, in the
dark table my hand-check had missed.

**The part I would volunteer.** I did the same thing myself, in the same day. I
justified deferring a change four times with "the virtualiser sizes its items
from that token" — the virtualiser is on a different list and uses its own
constant. Written once, repeated into three documents, believed because it
sounded like a reason. A wrong reason is more expensive than no reason: it
stops anyone re-examining, including its author. That is why the correction is
recorded in place in all four documents rather than quietly deleted.

## 11 · Which bugs did only *looking* find?

The counterpart to §8. Those were bugs a test caught that reading could not;
these are bugs neither a test nor reading caught, and a rendered screenshot did.

- **Every row's duration read `7:13` where the reference reads `30 min`.** Three
  places already *claimed* to match the reference, including a test literally
  named `matches the reference screenshots` asserting `30:00` for 1800 seconds —
  the reference's own 30-minute row. The suite was green (ADR-148).
- **The Analytics bar chart drew no bars.** Every bar 4px regardless of value,
  because `items-end` sizes columns to content so `height: N%` had no definite
  parent. On the one card captioned "this one is real".
- **Three screenshot races.** Containers are visible while their skeletons
  shimmer, so the dark notepad and the analytics page were photographed
  mid-load, and a sidebar fetch made one capture show two channels where
  another showed five.
- **Two Settings tabs looked like different products** after I converted one to
  cards and not the other.
- **A 13% spacing regression** — raising the card height moved a ratio tuned as
  a *fraction* of it. Tests asserted `toBe(82)` and were right; the visual
  baselines were regenerated, so the wrong spacing became the expected spacing.
- **The sidebar was unusable between 768 and 1279px** — labels clipped out of
  sight and tooltips suppressed, because the component read the user's collapse
  toggle while CSS pinned the width. Six unlabelled icons at a width the suite
  already covered.

**Why the suite could not see any of it.** Every one is a relationship between
two artifacts rather than a property of one: the app versus a reference
screenshot, a token versus the ratio derived from it, a component's belief about
its width versus its actual width. Tests assert what the code does. Visual
baselines assert what it looked like when you last regenerated them — which is
worse than nothing after an unverified change, because it promotes the defect to
the expectation. That is exactly how the spacing regression survived.

**What I did about it** rather than resolving to look harder: three scripts that
compare artifacts to each other — `check_layering.py`, `check_design_tokens.py`,
`check_reference_ratios.py` — in `make lint` and CI, each proven by breaking it
first. And where a check was not possible, a regression test that asserts the
*property a user depends on* rather than pixels: the tablet-rail test asserts the
tooltip, because the visual baseline was byte-identical before and after that fix.

## Things I would rather be asked

- Why the mutations project runs one worker (three "feature bugs" that were
  scheduling: `90-mutations` deleting meetings under `27-tags`).
- Why the selection toolbar clamps and flips (it is `position: fixed` on the
  selection rect; unclamped it leaves the viewport, and no amount of scrolling
  reaches a fixed element).
- Why `dangerouslySetInnerHTML` appears exactly once (the pre-paint theme boot
  script — constant markup, and without it every load flashes white).
