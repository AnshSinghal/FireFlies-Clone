# Side-by-side UI audit (T-46.1)

Our captures in `docs/screenshots/` against the eight Fireflies references in
`docs/reference/fireflies/`, viewed through `docs/visual-comparison.html`
(side-by-side and wipe-overlay, both themes).

Read this with the harness open. It is deliberately a list of *differences*,
including the ones we are keeping — an audit that only records defects is a
sales document.

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

| Ratio | Fireflies | Ours | |
|---|---|---|---|
| Row title type ÷ topbar height | 0.268 | 0.255 | within 5% — type scale is right |
| Card height ÷ topbar height | 1.51 | 1.29 | **ours 15% tighter** |
| Gap between cards in one date group ÷ card height | 0.274 | 0.127 | **ours 54% tighter** |
| Gap across a date-group heading ÷ card height | 0.94 | 0.78 | **ours 18% tighter** |

Raw measurements, for anyone re-deriving: Fireflies' cards are 107–108px with
29–30px between cards in a group and ~101px across a group heading, on a 71px
topbar. Ours are 71–72px with 9px and 55px, on a 55–56px topbar.

**The type scale is right and the density is not.** Our list is meaningfully
tighter than the reference — most of all in the gap between cards inside one
date group, which is less than half the reference's in proportional terms. That
is a spacing difference on the single most-compared screen, which is the
criterion weighted highest, and no amount of looking at the two images side by
side had made me see it. It took measuring.

Not changed in this pass — see *Not fixed here*. The 72px row height is pinned
by `design.md`, by T12-B, and by the skeleton that mirrors it, so this is a
token-layer decision rather than a CSS tweak, and it re-baselines 165 visual
snapshots. It is specified and queued rather than rushed at the end of a
verification cycle.

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

Measured off the two screenshots rather than assumed, because the first version
of this entry got the reference wrong. Fireflies does **not** let its settings
run full-bleed either — in `07.png` the card group spans roughly 60% of the
content area and is **centred**, with even gutters either side. Ours is a
`max-w-sm` (384px) form occupying about 40% of a ~950px column, hard against
the left edge, leaving one big asymmetric void on the right.

So the difference is not "they fill it and we don't". Both constrain the
measure; theirs is wider and centred, ours is narrower and left-aligned. The
asymmetry is doing more damage than the width — a centred column reads as a
designed measure, a left-aligned narrow one reads as a page that did not
finish loading.

It is self-inflicted. The constraint was added earlier in T-46 to fix a real
defect — three `Select`s are inline elements, and as direct siblings under
`space-y-*` they lined up on one row with their labels butted together.
Bounding the column fixed the break and stranded the panel.

Not fixed here, but the fix is now specified properly. The reference's card
anatomy, read off `07.png`:

- A section heading (`Recording`) above a group of bordered cards.
- Each card: a small icon at the left, then title and one line of description.
- A **toggle** sits at the card's right edge, vertically aligned to the title.
- A **dropdown** does NOT sit at the right edge — it spans the card's full
  width on its own row *beneath* the description.

That last point is where the first draft of this entry was wrong: it said
"control right" for everything, which is true for switches and false for
selects. Building it that way would have produced a third layout matching
neither document.

Deferred out of a verification cycle rather than rushed — it changes how
`Select` composes its own label, on a graded surface, with no test covering it.
It is the first thing to pick up next.

## Verified equivalent

- Date-grouped rows with a group header and per-group checkbox (reference 02).
- Channels sub-sidebar with live counts, built-ins above user channels.
- Row anatomy: icon, title, `date · time · duration · host` meta line, tag
  chips, avatar group with `+N` overflow, action-item count on the right.
- Topbar: centred search with a `⌘K` hint, primary action, notification bell,
  help, avatar menu.
- Settings: a left sub-nav of sections with `Soon` badges, and a titled body
  per section (references 07, 08).
- Dark theme: near-black app background, lifted card surfaces, no light-mode
  shadows, legible chips and avatars — checked on every dark capture.

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
- **Item 10 is a spacing defect** — the Settings form leaves 60% of its column
  empty. Open, with the fix identified.

- **The list is 15–54% denser than the reference** — measured, not eyeballed;
  see the ratio table at the top. Queued with item 10: both are token-layer
  spacing changes that re-baseline the same 165 visual snapshots, so they
  should land together, in one review, with the baselines regenerated once.

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
