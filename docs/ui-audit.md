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

## Verified equivalent

- Date-grouped rows with a group header and per-group checkbox (reference 02).
- Channels sub-sidebar with live counts, built-ins above user channels.
- Row anatomy: icon, title, `date · time · duration · host` meta line, tag
  chips, avatar group with `+N` overflow, action-item count on the right.
- Topbar: centred search with a `⌘K` hint, primary action, notification bell,
  help, avatar menu.
- Settings: left nav with segmented Personal/Team, card-per-setting body
  (references 07, 08).
- Profile menu: name, plan, storage meter, menu items (reference 06).
- Dark theme: near-black app background, lifted card surfaces, no light-mode
  shadows, legible chips and avatars — checked on every dark capture.

## Not fixed here

Nothing in this list is a spacing or type defect, which is what the criterion
weighs, so no "top 10 by visual weight" fixes were applied. Items 1–5 are
scope or convention decisions with reasons; if an evaluator disagrees with any
of them, the reason is written down and the change is small.
