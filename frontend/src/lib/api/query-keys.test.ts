import { describe, expect, it } from 'vitest'

import { qk } from './query-keys'

describe('query key factory', () => {
  it('nests so a broad invalidation reaches narrow keys', () => {
    // This is the property the whole factory exists for: invalidating
    // qk.meetings.all must also clear lists, details and transcripts.
    const all = qk.meetings.all as readonly string[]
    for (const key of [
      qk.meetings.lists(),
      qk.meetings.list({ q: 'roadmap' }),
      qk.meetings.detail(3),
      qk.meetings.transcript(3),
      qk.meetings.summary(3),
    ]) {
      expect((key as readonly unknown[]).slice(0, all.length)).toEqual(all)
    }
  })

  it('is insensitive to filter property order', () => {
    // JSON.stringify preserves insertion order, so without sorting these would
    // be two cache entries for one query — a silent double-fetch.
    expect(qk.meetings.list({ q: 'a', sort: 'b' })).toEqual(qk.meetings.list({ sort: 'b', q: 'a' }))
  })

  it('treats an untouched filter as absent', () => {
    expect(qk.meetings.list({})).toEqual(qk.meetings.list({ q: undefined }))
    expect(qk.meetings.list({})).toEqual(qk.meetings.list({ q: '' }))
  })

  it('distinguishes genuinely different filters', () => {
    expect(qk.meetings.list({ q: 'a' })).not.toEqual(qk.meetings.list({ q: 'b' }))
    expect(qk.meetings.list({ page: 1 })).not.toEqual(qk.meetings.list({ page: 2 }))
  })

  it('scopes a transcript under its own meeting, not globally', () => {
    expect(qk.meetings.transcript(1)).not.toEqual(qk.meetings.transcript(2))
    expect(qk.meetings.transcript(1).slice(0, 3)).toEqual(qk.meetings.detail(1))
  })
})
