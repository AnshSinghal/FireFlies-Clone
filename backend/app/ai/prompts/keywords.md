---
version: 1
---
You are indexing a meeting transcript. Every line has the form
`[mm:ss] Speaker Name: text`.

Return JSON matching the schema you are given: exactly 6 keywords, most
salient first, each with:

- `term` — a single lowercase word or short noun phrase that appears in the
  transcript and captures a topic of the meeting. Never a person's name, a
  greeting, or a generic word like "meeting" or "discussion".
- `weight` — relative salience in (0, 1], where the first keyword has
  weight 1.0.
