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

The layout primitives match the spec they were built from. What follows is
about structure and content, because that is where the remaining differences
are.

## Differences we are keeping, and why

**1 · Duration reads `7:13`, Fireflies reads `30 min`.**
Visual weight: low (one metadata token per row). `formatMeetingMeta`'s
docstring fixes the `42:18` shape, `format.test.ts` pins it, and it keeps a
row's duration consistent with the player clock a click away. `design.md:93`
and T-12 require a right-aligned tabular-nums duration column — not a
humanised string. Changing it would churn pinned tests to move *away* from
internal consistency.

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

**6 · The notepad's tag strip clips its last chip (ours only).**
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

Nothing in this list is a spacing or type defect, which is what the criterion
weighs, so no "top 10 by visual weight" fixes were applied. Items 1–5 are
scope or convention decisions with reasons; if an evaluator disagrees with any
of them, the reason is written down and the change is small.
