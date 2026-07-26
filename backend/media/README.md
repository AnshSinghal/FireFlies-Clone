# Media

## `sample-meeting.m4a`

**This is not a recording of a meeting.** It is filtered brown noise, band-limited to roughly the
frequency range of speech, generated with ffmpeg:

```bash
ffmpeg -f lavfi -i "anoisesrc=color=brown:amplitude=0.06:duration=1080:sample_rate=22050" \
       -af "highpass=f=180,lowpass=f=3400,volume=0.5" \
       -c:a aac -b:a 24k -ac 1 media/sample-meeting.m4a
```

18 minutes, mono, 24 kbps — 3.2 MB, which is small enough to commit.

### Why it exists

Two of the eight seeded meetings reference it so the player has a **real, seekable media element**
rather than only the virtual-clock fallback. The distinction matters for T-19 and T-21: a `<audio>`
element with genuine `buffered` ranges, real `timeupdate` events and working HTTP Range seeking
exercises code paths the virtual clock never touches.

Its length (18:00) comfortably exceeds the longest meeting that references it (17:02), so scrubbing
works across the entire transcript rather than falling off the end partway through.

### Why it is not speech

No suitably-licensed multi-speaker meeting recording of the right length was available, and using
one without clear rights would be worse than using none. PLAN.md T-05.8 is explicit that this is an
acceptable trade: *"a fake player that visibly fakes it is fine; a broken player is not."*

The six meetings that do **not** reference it use `media_type = 'none'` and drive the transcript from
a `requestAnimationFrame` virtual clock (T-19.1). Both paths are supported deliberately, and
`usePlayer` exposes the same interface for each, so the transcript-sync code is identical either way.

### Replacing it

Drop a real audio file in here, keep the filename or update `media` in the relevant fixture under
`app/seed/data/meetings/`, and re-run `make seed-demo`. Nothing else needs to change — provided the
new file is at least as long as the meeting that references it.
