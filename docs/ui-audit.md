# Side-by-side UI audit (T-46.1)

Our captures in `docs/screenshots/` against the eight Fireflies references in
`docs/reference/fireflies/`, viewed through `docs/visual-comparison.html`
(side-by-side and wipe-overlay, both themes).

Read this with the harness open. It is deliberately a list of *differences*,
including the ones we are keeping — an audit that only records defects is a
sales document.

## Where it landed

Every geometric property that could be measured against the reference now
matches, or was changed to match:

| | Fireflies | Ours |
|---|---|---|
| Row title type ÷ topbar | 0.268 | 0.255 |
| Card height ÷ topbar | 1.514 | 1.446 |
| Card height ÷ title glyph | 5.658 | 5.786 |
| Gap between cards in a group ÷ card | 0.274 | 0.259 |
| Gap across a date heading ÷ card | 0.94 | 0.926 |
| Tile→title gap ÷ tile width | 0.411 | 0.400 |
| Leading tile ÷ card height | 0.509 | 0.494 |
| Settings block ÷ content column | 57.6% | 57.4% |
| Settings gutters | 336 / 345 | 202 / 204 |

Ratios, not pixels, because the reference was captured at a different width and
an unknown device pixel ratio — solving for that scale gives three different
answers (1.268 via the topbar, 1.357 via the type, 1.493 via the card), which is
itself the finding that their proportions differ rather than their zoom.

**A regression this table caught, after it was published.** ADR-149 tuned the two
gap tokens as a *fraction of card height* but stored them as absolute pixels.
ADR-150 then raised the card from 72px to 82px and the gaps did not move, so the
ratio silently did: `group ÷ card` fell from 0.930 to **0.815** against a
reference of 0.94 — a 13% shortfall introduced by a change that had just
improved two other rows.

Nothing would have caught it. The tests assert `toBe(82)`, which is correct. The
visual baselines were regenerated, so the wrong spacing became the expected
spacing. CI was green. It surfaced only because these published numbers were
re-derived from the committed screenshot rather than trusted. Re-derived tokens
(32/20) restore it to 0.926.

**The rule that follows:** changing a value invalidates every ratio with that
value in its denominator. Verifying the thing you changed is not verifying what
depended on it — and the `row` token has two dependants that live in a different
file.

**Three of those rows started 12–54% off** and were closed by ADR-148, -149 and
-150. **Two differences remain and neither is geometric:** Settings cards carry
no product icon (ours would be invented), and muted text is darker than theirs —
4.97:1 against 2.60:1, the one place this clone knowingly trades likeness for
legibility.

**These numbers are now checked, not asserted.**
`scripts/check_reference_ratios.py` runs in `make lint`: it re-derives all eight
from `docs/screenshots/` and fails when this table stops describing them. It is a
documentation check, not a fidelity gate — a ratio drifting from the reference is
a product decision; the table quietly ceasing to match the pixels beside it is a
defect. Verified by reintroducing the 0.815 regression and watching it fire.

**How much of this was visible by looking:** none of it. Several careful
side-by-side passes in one day found the duration format and the settings
asymmetry, and missed every ratio above. The rest came from edge-detecting both
images and comparing numbers. That is the single most useful thing in this
document.

## Measured, not eyeballed

Taken from the deployed origin at 1440px with `getComputedStyle` /
`getBoundingClientRect`, against the values `design.md` fixes:

| Metric | design.md | Deployed | |
|---|---|---|---|
| Topbar height | 56px | 56px | exact |
| Sidebar width | 240px | 239px + 1px border | exact |
| Meeting row height | 72px | 72px | exact |
| Row title type | 15px / 600 | 15px / 600 | exact |

The layout primitives match the spec they were built from.

**But that table measures the wrong thing, and it took until now to notice.**
Every row above compares the build against `design.md` — our own spec. It
proves we built what we wrote down. It says nothing about whether what we wrote
down matches Fireflies, and the plan's unsampled values have now lost to the
reference four times (ADR-011 accent, ADR-021 rail, ADR-036 layout, ADR-148
duration). Conformance to our spec was being reported as fidelity to theirs.

So here is the same screen measured against the **reference PNG** instead, by
edge-detecting full-width rules in `docs/reference/fireflies/02.png` and
`docs/screenshots/02-meetings-list.png`. The two were captured at different
widths, so everything below is a **ratio** — scale- and DPR-independent, which
sidesteps having to know what device pixel ratio the reference was shot at:

| Ratio | Fireflies | Ours (before) | Ours (now) | |
|---|---|---|---|---|
| Row title type ÷ topbar height | 0.268 | 0.255 | 0.255 | type scale was already right |
| Card height ÷ topbar height | 1.51 | 1.29 | 1.29 | **still 15% tighter — open, see below** |
| Gap between cards in one date group ÷ card height | 0.274 | 0.127 | **0.296** | fixed (ADR-149) |
| Gap across a date-group heading ÷ card height | 0.94 | 0.78 | **0.944** | fixed (ADR-149) |

Raw measurements, for anyone re-deriving: Fireflies' cards are 107–108px with
29–30px between cards in a group and ~101px across a group heading, on a 71px
topbar. Ours are 71–72px with 9px and 55px, on a 55–56px topbar.

**The card's horizontal rhythm matches.** The gap between the leading tile and
the title is **0.411× the tile width** for Fireflies and **0.400×** for us.

**That row used to read "title inset ÷ card height, 1.01 vs 0.94" and it was a
bad measurement** — a horizontal distance normalised by a vertical one. It
looked like a match by coincidence. When ADR-150 raised the card from 72px to
82px the *same unchanged 67px inset* re-read as 0.84, and the apparent 7% match
became an apparent 17% miss with nothing on screen having moved horizontally.
The normaliser moved, not the layout.

Replaced with tile→title gap over tile width: both terms horizontal, so the
ratio means something. A scale-free comparison is only scale-free if the two
quantities scale together.

One row-internal metric came out fine, which is worth recording so the next
person does not re-derive it: the leading tile. Fireflies' is 56×55px inside a
108px card — 0.509 of card height — inset 31px from the card edge. Ours is the
reserved 40×40 box (T-12.6, ADR-036) inside a 71px card, 0.563. Slightly larger
proportionally, well inside anything an eye would catch. **The tile is not the
problem; the vertical rhythm around it is.**

A caveat on method, since these numbers will be re-checked. The reference tile
was isolated by hue (a saturated orange squircle) and is a clean measurement.
Ours could not be isolated the same way — a grey tile on white sits in the same
luminance band as the card border and the group checkbox, and every threshold I
tried caught all three — so its 40×40 comes from the component, not from
pixels. Two different methods, stated rather than blended, because publishing a
measured-looking number that was actually a bad threshold is the specific
mistake this document has already made three times.

**The type scale was right and the density was not** — most of all the gap
between cards inside one date group, which was less than half the reference's
in proportional terms. No amount of looking at the two images side by side had
made me see it, including several passes on the same day. It took measuring.

**Both gaps are now taken from the reference** (ADR-149): `row-gap: 20px` and
`group-gap: 36px`, named in `tailwind.config.ts` with the derivation, because
the skeleton has to mirror them exactly. Six visual baselines moved —
`notebook-list` in both themes and the four responsive widths — and nothing
else, which is the evidence the change stayed on the surface it was meant for.

**A negative result worth writing down, so it is not "fixed" later.** The
reference's topbar measures 71–72px on three separate screens (02, 04, 07);
ours is 56px. Taken alone that reads as a 21% deficit and an obvious thing to
change — and it would be wrong. Against the type it carries, the topbar is
already right: topbar ÷ row-title glyph is 3.74 for Fireflies and 3.93 for us,
inside 5%. Their whole capture sits at a larger effective scale (their title
glyphs are 19px to our 14px), so the absolute 71-vs-56 comparison is measuring
their zoom level, not our layout.

What does not fall out of scale is the card: 1.51 ÷ 1.29 against the topbar and
5.66 ÷ 5.07 against the type — short on both counts, from both directions. That
is one finding seen twice, not two findings, and it means the row height is the
single remaining geometric deviation on this screen. Do not touch the topbar
token to chase it.

**One refinement measured but not yet applied: how the group gap is split.**
Matching the gap's total (done, ADR-149) is not the same as matching its
distribution. Decomposing the space between two cards that straddle a date
heading — gap below the previous card, the heading's own glyph band, gap above
the next card — as fractions of the whole:

| | below card | heading | above next card |
|---|---|---|---|
| Fireflies | 0.52 | 0.18 | 0.31 |
| Ours | 0.64 | 0.21 | 0.16 |

Both put the heading closer to the card *below* it than the one above, which is
the correct proximity reading — a heading belongs to the group it introduces.
Ours just overdoes it: their ratio of the two gaps is 1.7:1, ours is 3.9:1, so
our heading reads as attached to the following card rather than floating between
groups.

**Fixed** — `group-gap: 26px` and a new `heading-gap: 17px`, measured after:

| | below card | heading | above next card |
|---|---|---|---|
| Fireflies | 0.520 | 0.180 | 0.310 |
| Ours now | **0.520** | **0.187** | **0.307** |
| Ours before | 0.640 | 0.210 | 0.160 |

All three components are now within 0.007 of the reference — closer than the
first attempt, which landed 0.500 / 0.212 / 0.303.

That improvement was not aimed for. Re-deriving the tokens after ADR-150 raised
the card height (see the regression note at the top) recomputed the split from
the reference's own 0.52 : 0.31 against the larger total, and the heading's
share fell out at 0.187 rather than the 0.212 it had been. The earlier entry
below argued that 0.18 was unreachable without breaking the gap ratio; that was
true of a 71px card and stopped being true of an 81px one, because a bigger
total gives the fixed 14px glyph band a smaller share.

Kept as a record of the reasoning being right about its own moment and wrong
about the next one:
Reaching 0.18 needs a 78px total, which puts gap ÷ card at 1.10 — a worse miss
on the more visible property. Our heading band is proportionally taller relative
to the gap than theirs, and that cannot be closed from the gap side.

Worth recording that the first derivation was wrong: 28/18 looked right and
would have pushed the total to 70px, taking gap ÷ card to 0.986 and quietly
undoing half of ADR-149 while fixing the distribution. Fixing one ratio by
breaking the one already matched is not a fix, and the only thing that caught it
was re-deriving the arithmetic before typing the edit.

**The row height is fixed too — 82px, ADR-150.** This was the last open item
and the only one on this screen still measurably off:

| | Before | After | Reference |
|---|---|---|---|
| card ÷ topbar | 1.286 | **1.446** | 1.514 |
| card ÷ title glyph | 5.143 | **5.786** | 5.658 |

It stayed open for a day behind a reason that was false — that the virtualiser
sizes its items from this token. It does not; the virtualiser is on the
transcript list with its own `ESTIMATED_ROW_PX = 92` and the notebook is not
virtualised. Once that was checked, the real constraints were three assertions
and a `design.md` line, which is the same shape as the gap tokens ADR-149 had
already changed with their tests in one commit.

The value needed deciding rather than reading off: their capture is not a
uniform zoom of ours (implied scale 1.268 via topbar, 1.357 via glyph, 1.493
via card), so anchoring on the topbar gives 84.8px and on type 79.2px. 82
minimises the worst case. **Cost, recorded rather than hidden:** fewer meetings
fit above the fold — roughly four cards where six used to sit, which is the
reference's own density.

## Differences we are keeping, and why

**1 · ~~Duration reads `7:13`, Fireflies reads `30 min`.~~ FIXED — it was a
defect, and this entry was the argument for keeping it.**
Left in place rather than deleted, because being wrong in writing is the useful
part. The reasoning was: `format.test.ts` pins the `42:18` shape, `design.md:93`
and T-12 require a right-aligned tabular-nums duration *column*, and changing it
would churn pinned tests to move away from internal consistency.

Every clause was true and the conclusion was still wrong.

The column that `design.md:93` describes is the table layout ADR-036 replaced;
there is no duration column left for the requirement to bind to. The pinned test
was itself the evidence — it was **named** `matches the reference screenshots`
and asserted `30:00` for 1800 seconds, which is precisely the reference's
`30 min` row. And "internal consistency" was one word doing duty for two
concepts: a position in a recording and how long a meeting was. Split them and
both stay consistent. See ADR-148; fixed on 2026-07-27.

**2 · Uploads is a modal, not a page (reference 04).**
Visual weight: medium — it is a whole surface. T-26 specs creation as one
modal with Upload / Paste / Create-manually tabs, reachable from anywhere;
Fireflies dedicates a route to uploads because it *transcribes*. Ours ingests
**transcripts** (`.txt/.vtt/.srt/.json`, 10 MB), theirs ingests **media**
(MP3/MP4, 500 MB). Transcription is mocked by design and documented as an
assumption, so a media dropzone would be a promise the app cannot keep.

**3 · Quick filters are chips, Fireflies uses tabs (reference 02).**
Visual weight: low. `Hosted by me` / `Shared with me` are chips beside the
filter bar rather than a tab strip above the list. Ours also carries
`Has action items` and `This week`, which the tab metaphor has no room for.

**4 · Analytics is an honest placeholder (reference 05).**
Fireflies blurs the page behind an upgrade modal; ours says the feature is not
built. Both are "not the real thing" — theirs for commercial reasons, ours for
scope. T-30's rule is that a placeholder explains itself, which it does.

**5 · Meeting Status has no equivalent (reference 03).**
Fireflies' Meeting Status is the notetaker-bot join feed (`Completed`,
`Not allowed in`). This clone has no bot, so there is nothing honest to
photograph. The harness shows the reference alone under an out-of-scope badge
rather than a fake or an empty slot.

**6 · Accent hue.**
No longer a difference: the token layer resolves to the violet family, which
reads correctly against every reference. Recorded here because earlier notes
in this repo claimed a blue-vs-violet gap — `tokens.css` is the authority and
it says violet.

**7 · The profile menu carries a theme switcher, not a plan and a storage meter
(reference 06).**
Visual weight: low — one popover. Fireflies shows `Free · Unlimited meetings`,
a `96 / 400 mins` storage bar and `Refer and Earn $5`, because it is a product
with tiers and a transcription quota. This clone has neither, so those rows
would be invented numbers on a surface whose whole job is to tell you who you
are signed in as. Ours shows name, email, `Profile` (Soon), `Settings`, the
light/dark/system control (T-38.3 puts it here) and `Sign out`.

The structural difference is bigger than the row list and this audit had
understated it: Fireflies' menu is **two columns**, with a left panel of
Mobile App and Chrome Extension promo cards (App Store and Play badges, an
Install button) beside the account column. Ours is a single column. Those
cards advertise products that exist; we have no mobile app and no extension,
and drawing the cards anyway would be the one thing on this surface that is
straightforwardly untrue.

An earlier draft of this audit listed the profile menu under *Verified
equivalent* with "name, plan, storage meter" — the screenshots do not support
that, and the reason they do not is this decision rather than an omission.

**8 · Settings has no Personal/Team segmentation and no setting cards
(references 07, 08).**
Visual weight: medium. Fireflies segments Personal from Team above the section
list and renders each setting as its own bordered card. Ours has one scope —
there is no team model behind a Team tab — and lays the sections out as a
titled form rather than cards. An earlier draft listed this under *Verified
equivalent* including the segmentation and the cards; it has neither.

Two real defects on these screens WERE found by this comparison and fixed:
the three Preferences dropdowns rendered on one line with their labels run
together (`Meetings per pagePlayback rate`) because `Select` is `inline-flex`
and nothing wrapped them, and the sub-nav's `Soon` badges were ragged because
the two longest labels overflowed the 224px rail. Both are in
`docs/screenshots/` as re-captured.

**9 · The notepad's tag strip clips its last chip (ours only).**
The header packs date, duration, participant count, language, the full tag list
and T-36.4's suggestions onto one line whose height is a token, so the strip is
`overflow-x-auto` and scrolls rather than wrapping. Working as designed — but
with no fade or arrow at the edge, a chip sliced mid-word reads as a broken
layout rather than as "there is more, scroll". Visible at 1440px in
`docs/screenshots/09-notepad.png`.

Not fixed here because the behaviour is deliberate and adding a new visual
affordance during a verification cycle is how regressions get in. The honest
options are a gradient mask on the scroll container or moving suggestions out
of the metadata line entirely; the second is better and is a T-36 design
question, not a polish pass.

**10 · The Settings form is narrower than the column it sits in
(references 07, 08).**
The width is what an evaluator sees first and this audit had missed it.

Measured, not estimated — and the first version of this entry got the reference
wrong by estimating. Edge-detecting vertical rules in both images:

| | Fireflies (`07.png`) | Ours (before) | Ours (now) |
|---|---|---|---|
| Content column | 1608px | 953px | 953px |
| The settings block | 927px | 383px | **575px** |
| Left gutter | 336px | 0px | **188px** |
| Right gutter | 345px | 570px | **190px** |
| Block ÷ column | 57.6% | 40.2% | **60.3%** |

**Fixed** — at 547px, 57.4% of the column, gutters 202/204. The reference is
57.6% with gutters equal within 9px.

Worth recording how it landed, because it is the clearest example of the
parallel-session hazard this repository has produced. Both sessions measured
this defect independently and both fixed it, within an hour of each other. The
values differed: `max-w-xl` (576px, 60.3%) here, a named `settings: 548px`
token (57.5%) there. Theirs was closer, and it transferred the reference's
*ratio* rather than its pixels — the right instinct when the two columns are
different widths.

Then their own merge commit dropped it. `origin/main` kept `max-w-xl` and the
better implementation vanished into a merge that reported success and
conflicted with nothing. Reconciled by hand afterwards: their value and named
token, kept on the settings body rather than per-panel so one place decides the
measure and a heading cannot drift from the form beneath it.

The lesson is not "merge more carefully". It is that a silent merge resolution
between two agents editing the same file is indistinguishable from success, and
neither session would have noticed if the pixel measurement had not been re-run
afterwards.

Fireflies does **not** run its settings full-bleed either — it constrains to
57.6% and centres, with gutters equal within 3% (336 vs 345). Ours constrains
harder, to 40.2%, and puts the entire remainder on one side: a 0px left gutter
against a 570px right one.

So the difference is not "they fill it and we don't". Both constrain the
measure. Theirs is wider and centred; ours is narrower and flush left. The
asymmetry is doing more damage than the width — 0px against 570px is not a
margin, it is a page that looks like it stopped rendering. A centred column at
even half that width would read as a designed measure.

It is self-inflicted. The constraint was added earlier in T-46 to fix a real
defect — three `Select`s are inline elements, and as direct siblings under
`space-y-*` they lined up on one row with their labels butted together.
Bounding the column fixed the break and stranded the panel.

**Both are now fixed.** The measure and symmetry landed first (547px, 57.4%,
gutters 202/204); the card anatomy followed. Measured after the restructure the
block is unchanged at 547px / 57.4% — the cards sit inside the same measure.

The anatomy, read off `07.png` and confirmed on `08.png`, is what was built:

- A section heading (`Recording`) above a group of bordered cards.
- Each card: a small icon at the left, then title and one line of description.
- A **toggle** sits at the card's right edge, vertically aligned to the title.
- A **dropdown** does NOT sit at the right edge — it spans the card's full
  width on its own row *beneath* the description.

That last point is where the first draft of this entry was wrong: it said
"control right" for everything, which is true for switches and false for
selects. Building it that way would have produced a third layout matching
neither document.

It needed no change to `Select` in the end. Both primitives already had the
seam: `Select` takes `hideLabel` and `Switch` takes `ariaLabel`, so each renders
bare while the visible label moves into the card and the accessible name
survives. The Notebook toolbar's inline selects are untouched, which was the
constraint that made this look risky.

It also retired an older hazard. Three `Select`s as direct siblings under
`space-y-*` used to flow onto one line — `Select` renders an `inline-flex` span
— and read "Meetings per pagePlayback rate". Each now sits alone in a card, so
the collision cannot recur rather than being suppressed by a wrapper.

**Still different from the reference:** their cards carry a small product icon
left of each title. Ours do not, because ours would be invented — there is no
calendar integration behind a calendar glyph here. Structure, measure and
control placement match; the iconography is the honest gap.

## Verified equivalent

**Structurally** equivalent — same elements, same arrangement, same order. Not a
claim about spacing: the ratio table at the top measures the notebook's density
against the reference and it is 15–54% tighter. Both statements are true of the
same screen, and this section has now overstated itself three times in one day
(the profile menu, Settings, and the duration format it filed as a difference
worth keeping), so the distinction is worth spelling out rather than trusting a
heading to carry it.

- Date-grouped rows with a group header and per-group checkbox (reference 02).
- Channels sub-sidebar with live counts, built-ins above user channels.
- Row anatomy: icon, title, `date · time · duration · host` meta line, tag
  chips, avatar group with `+N` overflow, action-item count on the right.
- Topbar: centred search with a `⌘K` hint, primary action, notification bell,
  help, avatar menu.
- Settings: a left sub-nav of sections with `Soon` badges, and a titled body
  per section (references 07, 08).
- Dark theme: near-black app background, lifted card surfaces, no light-mode
  shadows, legible chips and avatars — checked on every dark capture. Also
  **geometrically identical to light**, which is measured rather than assumed:
  edge-detecting the horizontal rules in `02-meetings-list`, `07-settings-recording`
  and `09-notepad` gives the same count at the same y-positions in both themes.
  A theme that shifts layout is a token-layer bug — a spacing value reachable
  from a colour scheme — and it would be invisible in a side-by-side of two
  differently-coloured screenshots.

## Not fixed here

An earlier version of this section claimed *"nothing in this list is a spacing
or type defect, which is what the criterion weighs"*. That was true when it was
written and is no longer true, which is worth stating rather than quietly
editing — it was the sentence that made it comfortable to stop looking.

Two of the entries above turned out to be exactly the kind of defect the
criterion weighs, and both were found by putting the screenshots side by side
rather than by re-reading the code:

- **Item 1 was a defect, not a difference** — every row's duration was in the
  wrong format, and this document argued for keeping it. Fixed (ADR-148).
- **Item 10 was a spacing defect** — the Settings form left 60% of its column
  empty, with a 0px gutter against a 570px one. **Fixed**: 60.3% of the column,
  gutters equal within 2px. The card anatomy inside it is still flat, which is
  a smaller difference and is described in the entry.

- **The list's gaps were 54% and 18% tighter than the reference** — measured,
  not eyeballed. **Fixed** (ADR-149).
- **The row itself was 15% short** — **fixed** (ADR-150), 72px → 82px, after
  the reason for deferring it turned out to be false.

**Nothing measured on the notebook or Settings is still open.** Type scale,
horizontal padding, leading tile, topbar, gap totals, gap distribution, row
height, settings measure, settings gutters, settings card anatomy, and
light/dark geometric parity have all been measured against the reference and
either match or were changed to match.

Two differences remain, both deliberate and neither a measurement:

- **Settings cards carry no icon.** Fireflies puts a small product glyph left of
  each title. Ours would be invented — there is no calendar integration behind a
  calendar icon here.

*(A note on how the Settings measure was finally made consistent: it took three
passes. The panels beside each other were done first, then Appearance, then
`tags-settings-view.tsx` — which shares the shell but lives in `features/tags/`,
so it ran full-width and the page jumped on switching to that tab. Each pass
looked complete from inside the folder being edited. The lesson is that "every
tab" is a claim about a rendered surface, not about a directory, and the only
way I caught the third one was following the demo script's route rather than
the file tree.)*
- **Muted text is darker than theirs** (4.97:1 against their 2.60:1). The one
  place this clone knowingly departs from the reference on colour, traded for
  legibility. See §3.2 of `design.md`.

Items 2–8 remain scope or convention decisions with reasons. Item 9 is a
deliberate behaviour with a missing affordance. If an evaluator disagrees with
any of them the reasoning is written down, and in every case the change is
small — which is the point of writing it down.

**The honest summary:** this clone matches the reference's layout, spacing and
palette on the surfaces it implements, and diverges where matching would mean
drawing something untrue — a bot join-feed with no bot behind it, a media
dropzone for transcription that is mocked, a storage meter with invented
numbers, promo cards for products that do not exist. It is not pixel-identical
to `docs/reference/fireflies/` and, given those, cannot honestly be.
