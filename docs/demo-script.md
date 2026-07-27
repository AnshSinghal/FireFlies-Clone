# Demo script — five minutes, exact clicks

**Budget: 5:00.** Ten beats, timed. The times below are what the walkthrough actually took when
rehearsed end to end against a production build (T‑46.10) with narration on top of each click.

Beat 3 is the one that is graded hardest — transcript ↔ player bidirectional sync. It gets 55
seconds, more than any other beat, and it is performed **slowly**. If you are running long, cut from
beats 6 and 10, never from 3.

---

## Before you start (not part of the five minutes)

```bash
make seed-demo          # reset, seed and validate; prints the summary table
make dev                # or run backend + frontend directly
```

**Unset `SEED_ANCHOR_DATE` first.** `.env.example` pins it to `2026-07-26T09:00:00Z` so the
Playwright suite's frozen clock and the seeded dates agree. If you copied that file to `.env`, the
seeder anchors on that instant and beat 1's `Today` / `Yesterday` headings become plain dates on
every other day. Leave it empty for a demo and the seeder uses the real clock.

Then, in the browser you will present from:

- **Reset the theme to Light** — the app follows the OS by default (`ff.theme` → `system`), so a
  dark laptop starts the demo in dark and beat 8 has nothing to show.
- Open `/notebook` once and let it load, so beat 1 is not the first request the server ever sees.
- Close devtools. A console panel on screen invites a question you have not budgeted for — the
  answer, if it comes up, is that the sweep in T‑46.2 is at zero errors and zero warnings on every
  route in both themes.
- Have a second tab on `http://localhost:8000/docs` and a terminal in `e2e/` ready for beat 10.

**The hero meeting is `Q3 Product Roadmap Sync`** (id 1, Sarah Chen, `9 min` in the list and
`09:06` on the player clock, 5 open action items, tagged `engineering` `product` `roadmap`). Every
beat from 2 to 6 happens inside it.

Both numbers are correct and they are supposed to differ — ADR-148. A meeting's *length* is
labelled the way the reference labels it (`9 min`); a *position* in the recording keeps second
precision (`09:06`). If an evaluator asks why the two disagree, that is the answer, and it is worth
having ready because it looks like a bug for about two seconds.

---

## The ten beats

| # | Beat | Time | Running |
|---|---|---|---|
| 1 | Notebook — list, hover, search, filter, sort | 0:40 | 0:40 |
| 2 | The hero meeting — five summary sections | 0:25 | 1:05 |
| 3 | **Transcript ↔ player, both directions** | 0:55 | 2:00 |
| 4 | Outline timestamp; keyword → find bar | 0:20 | 2:20 |
| 5 | Action item → the Notebook badge | 0:20 | 2:40 |
| 6 | The annotation rail — highlight, bookmark, soundbite, comment, Fred, export | 1:00 | 3:40 |
| 7 | Upload a `.vtt` → preview → created meeting | 0:30 | 4:10 |
| 8 | Dark mode | 0:12 | 4:22 |
| 9 | Global search → snippet → the exact line | 0:28 | 4:50 |
| 10 | `/docs` and the green Playwright run | 0:10 | 5:00 |

Beat 6 is new relative to `PLAN.md`'s outline: comments, highlights, bookmarks, soundbites, export
and AskFred all shipped after that list was written (T‑31 → T‑37). Nothing the plan listed was
dropped — its beats 1–5 are unchanged, its 6 (upload), 7 (dark mode) and 8 (global search) are
beats 7, 8 and 9 here, and its 9 (`/docs`) and 10 (the Playwright run) are folded into beat 10,
because the suite runs in the background while you answer the first question.

---

### 1 · Notebook — the list, hover, search, filter, sort · 0:40

Start on **`/notebook`**.

1. **Say what it is** while the eye takes in the list: eight meetings, grouped by day, `Today` and
   `Yesterday` as headings rather than dates.
2. **Hover the first row.** The row lifts, the kebab and the `Details` affordance appear. Nothing
   moves — the actions were always occupying that space.
3. **Type `pricing`** into the search field. Matches highlight in the titles; the URL becomes
   `?q=pricing`. Say the sentence: *every filter is in the URL, so any view is a link you can send.*
4. **Clear the search.** Click **`Filters`** → **`Host`** → tick **`Sarah Chen`** → **`Apply`**.
   Two meetings. The active-filter chip appears above the list.
5. **Clear filters**, then open the sort menu and pick **`Longest first`**. `Design Review — Mobile
   Onboarding` goes to the top at 17:02.
6. **Press Back.** The sort undoes. This is the point: browser history is real history here, not a
   dead end.

> Cuttable if running long: the host filter (step 4). Keep search and Back.

---

### 2 · Open the hero meeting — the five summary sections · 0:25

1. Click **`Q3 Product Roadmap Sync`**.
2. The Notepad opens split: **Summary left, Transcript right**, player docked under the transcript.
3. Scroll the summary once, naming the five sections in order — they are the product's names, not
   invented ones:

   **Keywords** → **Meeting Overview** → **Meeting Outline** → **Bullet-Point Notes** →
   **Action Items**

4. Point at **Keywords**: six chips, `usage-based billing` first. Say that each one is clickable —
   you use that in beat 4.

---

### 3 · Transcript ↔ player · 0:55 · **do this slowly**

This is the beat the evaluation is built around. Narrate each direction separately and pause after
each so it is unmistakable.

**Direction one — transcript drives the player.**

1. Scroll the transcript to the line at **`01:44`** — Sarah Chen, *"So the proposal is usage-based
   billing for enterprise."* Pick a line with **no coloured highlight on it**; clicking a
   highlighted phrase opens that highlight's popover instead (beat 6's material, not this one).
   The two seeded highlights sit at `01:03` and `03:08`, so avoid those.
2. **Click the line.** The playhead jumps to that line's timestamp; the seekbar moves; the time
   readout changes. Say: *one click, and the audio is at that sentence.*

**Direction two — the player drives the transcript.**

3. **Press Play** (or `Space`).
4. **Stop talking and let it run for ten seconds.** The active line carries an accent wash and the
   list auto-scrolls to keep it in view, line after line. This is the moment; silence sells it.
5. **Press Play again to pause**, mid-sentence, and point out that the active line stayed put.
6. Scroll the transcript away from the playhead by hand — the auto-follow yields to you and a
   `Jump to current` affordance appears. Click it; you are back.

Two sentences of technique, no more: the playhead is a context the transcript subscribes to, and
the list is virtualised, so a 300-line transcript re-renders one row per tick rather than all of
them.

---

### 4 · Outline timestamp, and a keyword into the find bar · 0:20

1. In **Meeting Outline**, click the timestamp on **`API rate-limit incident review`** (`04:25`).
   The player seeks and the transcript scrolls to the chapter — the same sync, from a third surface.
2. In **Keywords**, click **`usage-based billing`**. The transcript find bar opens **pre-filled**,
   every occurrence is marked, the match count appears, and the URL gains `?find=usage-based+billing`.
3. Press `Enter` twice to walk the matches, then `Esc` to close.

---

### 5 · Tick an action item, then the Notebook badge · 0:20

1. Scroll to **Action Items**. Six items grouped by assignee, one already done.
2. **Tick `Build the revenue projection model for the usage-based pricing change`.** It moves to
   done instantly — optimistic — and the label goes from `1 of 6 completed` to `2 of 6 completed`.
3. **Click `Back to meetings`.** The hero row's badge now reads **`4 open`** rather than `5 open`.

Say the sentence: *the badge is derived from the same cache the checkbox wrote to, so it moved
without a refetch of the list.*

---

### 6 · The annotation rail · 1:00

Back into the hero meeting. Everything here shipped after the plan's outline was written; take them
in one sweep and do not linger.

1. **Highlight.** At `02:02`, select the phrase *"sixty days' notice and a calculator on the
   pricing page"*. The selection toolbar appears: `Copy`, `Highlight`, `Comment`, `Soundbite`.
   Click **`Highlight`**, pick **green**. The wash lands immediately. (Do not re-use the amber
   phrase at `01:03` — it is already highlighted, and selecting over a highlight is a different
   interaction.)
2. **Bookmark.** Focus a transcript line and press **`B`**. A tick appears on the seekbar.
3. **Open the rail** (left edge, five icons) → **`Bookmarks`**. Two tabs: `Bookmarks` and
   `Highlights`, both populated. Click an entry — it seeks. Close the flyout.
4. **Soundbite.** Rail → **`Soundbites`**: two clips, one of them auto-suggested. Say that a clip is
   a trimmed range with a title, and that a suggestion is the model proposing one.
5. **Comment.** Rail → **`Comments`** — empty, which is honest: the seed ships no comments. Select a
   transcript line, **`Comment`**, type `@Marcus can you own this?` — the mention autocomplete
   appears — and post it. The thread anchors to the line.
6. **AskFred.** Click **`Ask Fred`** in the header. Type **`What did they say about pricing?`** and
   send. The answer comes back with **citations**; click citation 1 and the player seeks to the line
   it was drawn from. Say: *grounded, and the grounding is clickable — the mock provider is
   deterministic, and swapping in a real one is a provider class, not a rewrite.*
7. **Export.** Kebab → **`Export`**. Choose sections, watch the size estimate update, copy as
   Markdown. Close.

> Cuttable if running long: steps 2 and 4. Keep the highlight, the comment and AskFred's citation.

---

### 7 · Upload a `.vtt` → preview → the created meeting · 0:30

1. Sidebar → **`Upload`**.
2. Drop a `.vtt` file on the dropzone (have one on the desktop — three or four cues is plenty).
3. **The preview is the point.** It names the parser that matched (`WebVTT cues`), the segment
   count, and the speakers it found — and the speakers are **editable before anything is written**.
   Say: *correcting a speaker is cheap here and expensive after import.*
4. Click **`Create meeting`**. You land on the new meeting, transcript rendered, ready to play.

---

### 8 · Dark mode · 0:12

1. Click the **avatar**, top right.
2. Click **`Dark`**. The whole app repaints — surfaces, borders, the highlight washes, the
   waveform. **The menu stays open**, so:
3. Click **`Light`** and come straight back.

One sentence: *every colour is a semantic token, so dark mode is a second value per token and no
component knows which theme it is in.*

---

### 9 · Global search → a snippet → the exact line · 0:28

1. Press **`⌘K`** (or click the topbar search) and type **`grandfathered`**.
2. Results group **by meeting**, with a snippet per hit and the matched term marked.
3. **Click a snippet.** You land in that meeting, on that line, with the player already positioned
   there — beat 3's sync arriving from a fourth entry point.

Worth one sentence: full-text search is SQLite **FTS5** with triggers on the segment table, and the
query joins back to `meetings` so a soft-deleted meeting cannot surface.

---

### 10 · `/docs` and the green run · 0:10

1. Switch to the **`/docs`** tab — the OpenAPI surface, every endpoint, one pagination envelope and
   one error envelope throughout.
2. Switch to the terminal already sitting in `e2e/` and start the suite:

   ```bash
   npx playwright test
   ```

   Let it run while you take the first question. It boots its own servers, migrates and seeds a
   dedicated database, and runs read-only tests before mutating ones.

---

## Known snags, and what to do about them

Found while rehearsing. None is a bug; all three will trip you if you have not seen them.

| Snag | What happens | What to do |
|---|---|---|
| Clicking a **highlighted phrase** in the transcript | Opens the highlight popover instead of seeking | In beat 3, pick a line with no wash on it |
| The **avatar menu stays open** after picking a theme | A second click on the avatar *closes* it | In beat 8, click `Light` directly — do not reopen |
| **No comments are seeded** | The Comments flyout is empty on a fresh database | Beat 6 creates one live; it demos better anyway |

## If you have ninety seconds more

In priority order: **Tags** (`/settings/tags` — rename, merge, recolour, and the count that follows
the merge), **bulk selection** in the Notebook (select two rows → tag both at once), and
**transcript editing** (double-click a line, correct it, watch the `edited` marker appear).

## If you are cut to two minutes

Beats 2, 3 and 9. Open the hero meeting, do the sync in both directions slowly, then show that
global search lands you on an exact line. That is the product.
