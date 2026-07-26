/**
 * Query key factory (T-06.5).
 *
 * Never inline a key array at a call site. Cache invalidation is the hard part
 * of this app — toggling an action item in the Notepad has to update the
 * Notebook row's "N open" badge and the details drawer (T-24.12) — and that only
 * works if every producer and every invalidator agree on the exact key.
 *
 * The hierarchy is deliberate. Keys nest, so `invalidateQueries({ queryKey:
 * qk.meetings.all })` reaches every list, every detail and every transcript
 * beneath it, while `qk.meetings.detail(3)` touches only one.
 */

export interface MeetingFilters {
  q?: string
  sort?: string
  page?: number
  pageSize?: number
}

export const qk = {
  me: ['me'] as const,

  meetings: {
    all: ['meetings'] as const,

    /** Every list, regardless of filters — for a blanket refresh after a delete. */
    lists: () => [...qk.meetings.all, 'list'] as const,

    /**
     * Filters are part of the key, so two different filter sets are two cache
     * entries rather than one that thrashes. Serialised through a stable
     * function because `{a:1,b:2}` and `{b:2,a:1}` must produce the same key.
     */
    list: (filters: MeetingFilters = {}) => [...qk.meetings.lists(), stableKey(filters)] as const,

    details: () => [...qk.meetings.all, 'detail'] as const,
    detail: (id: number) => [...qk.meetings.details(), id] as const,

    transcript: (id: number) => [...qk.meetings.detail(id), 'transcript'] as const,
    summary: (id: number) => [...qk.meetings.detail(id), 'summary'] as const,
    actionItems: (id: number) => [...qk.meetings.detail(id), 'action-items'] as const,

    facets: () => [...qk.meetings.all, 'facets'] as const,
  },

  search: (query: string) => ['search', query] as const,
} as const

/**
 * A key fragment that does not depend on property order.
 *
 * `JSON.stringify` preserves insertion order, so `{q:'a',sort:'b'}` and
 * `{sort:'b',q:'a'}` would serialise differently and produce two cache entries
 * for the same query. Sorting the entries first removes that whole class of bug.
 * Undefined and empty values are dropped so an untouched filter does not change
 * the key.
 */
function stableKey(filters: MeetingFilters): string {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))

  return entries.length === 0 ? 'default' : JSON.stringify(Object.fromEntries(entries))
}
