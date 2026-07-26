import { describe, expect, it } from 'vitest'

import {
  DEDUPE_WINDOW_MS,
  DEFAULT_DURATION,
  EMPTY_TOAST_STATE,
  MAX_VISIBLE,
  addToast,
  dismissToast,
  updateToast,
  visibleToasts,
  type ToastState,
} from './store'

const T0 = 1_000_000

/** Add several toasts in sequence, each at `T0 + index * gap`. */
function addAll(
  inputs: Array<Parameters<typeof addToast>[1]>,
  { gap = 5000, from = EMPTY_TOAST_STATE }: { gap?: number; from?: ToastState } = {},
): ToastState {
  return inputs.reduce((state, input, i) => addToast(state, input, T0 + i * gap).state, from)
}

describe('addToast', () => {
  it('assigns increasing ids', () => {
    const state = addAll([{ message: 'one' }, { message: 'two' }])
    expect(state.toasts.map((t) => t.id)).toEqual([1, 2])
  })

  it('defaults to info', () => {
    const { state } = addToast(EMPTY_TOAST_STATE, { message: 'hello' }, T0)
    expect(state.toasts[0]!.variant).toBe('info')
  })

  it('gives errors no auto-dismiss at all', () => {
    // The one the whole variant table exists for: a message the user must act
    // on that vanishes before it can be read is worse than no message.
    expect(DEFAULT_DURATION.error).toBeNull()
    expect(DEFAULT_DURATION.loading).toBeNull()
    expect(DEFAULT_DURATION.success).toBe(4000)
    expect(DEFAULT_DURATION.info).toBe(5000)
  })

  it('honours an explicit null duration over the variant default', () => {
    const { state } = addToast(
      EMPTY_TOAST_STATE,
      { message: 'stay', variant: 'success', duration: null },
      T0,
    )
    expect(state.toasts[0]!.duration).toBeNull()
  })
})

describe('deduplication', () => {
  it('collapses an identical toast inside the window into a counter', () => {
    // Double-clicking Delete fires two mutations; two identical toasts read as
    // "it deleted two things".
    let state = addToast(EMPTY_TOAST_STATE, { message: 'Meeting deleted' }, T0).state
    state = addToast(state, { message: 'Meeting deleted' }, T0 + 200).state

    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0]!.count).toBe(2)
  })

  it('returns the existing id so a caller can still update it', () => {
    const first = addToast(EMPTY_TOAST_STATE, { message: 'same' }, T0)
    const second = addToast(first.state, { message: 'same' }, T0 + 100)
    expect(second.id).toBe(first.id)
  })

  it('does not collapse past the window', () => {
    let state = addToast(EMPTY_TOAST_STATE, { message: 'same' }, T0).state
    state = addToast(state, { message: 'same' }, T0 + DEDUPE_WINDOW_MS).state
    expect(state.toasts).toHaveLength(2)
  })

  it('keeps collapsing through a sustained burst', () => {
    // `createdAt` advances on each hit, so a stream of clicks 200ms apart stays
    // one toast rather than splitting once 1s since the FIRST has elapsed.
    let state = EMPTY_TOAST_STATE
    for (let i = 0; i < 10; i++) {
      state = addToast(state, { message: 'burst' }, T0 + i * 200).state
    }
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0]!.count).toBe(10)
  })

  it('treats the same text in different variants as different toasts', () => {
    let state = addToast(EMPTY_TOAST_STATE, { message: 'Saved', variant: 'success' }, T0).state
    state = addToast(state, { message: 'Saved', variant: 'error' }, T0 + 100).state
    expect(state.toasts).toHaveLength(2)
  })

  it('does not collapse different messages', () => {
    const state = addAll([{ message: 'a' }, { message: 'b' }], { gap: 100 })
    expect(state.toasts).toHaveLength(2)
  })
})

describe('updateToast', () => {
  it('mutates in place so a promise toast is one card, not two', () => {
    const { state, id } = addToast(
      EMPTY_TOAST_STATE,
      { message: 'Saving…', variant: 'loading' },
      T0,
    )
    const next = updateToast(state, id, { message: 'Changes saved', variant: 'success' }, T0 + 800)

    expect(next.toasts).toHaveLength(1)
    expect(next.toasts[0]!.id).toBe(id)
    expect(next.toasts[0]!.message).toBe('Changes saved')
    expect(next.toasts[0]!.variant).toBe('success')
  })

  it('restarts the dedup window, so a later identical message is its own toast', () => {
    const { state, id } = addToast(
      EMPTY_TOAST_STATE,
      { message: 'Saving…', variant: 'loading' },
      T0,
    )
    let next = updateToast(state, id, { message: 'Changes saved', variant: 'success' }, T0 + 800)
    // Without the reset this would fold into the toast created at T0.
    next = addToast(next, { message: 'Changes saved', variant: 'success' }, T0 + 1500).state

    expect(next.toasts).toHaveLength(1)
    expect(next.toasts[0]!.count).toBe(2)
  })

  it('leaves other toasts untouched', () => {
    const state = addAll([{ message: 'a' }, { message: 'b' }])
    const next = updateToast(state, 1, { message: 'changed' }, T0)
    expect(next.toasts.map((t) => t.message)).toEqual(['changed', 'b'])
  })

  it('is a no-op for an id that is already gone', () => {
    const state = addAll([{ message: 'a' }])
    expect(updateToast(state, 999, { message: 'x' }, T0).toasts).toEqual(state.toasts)
  })
})

describe('dismissToast', () => {
  it('removes only the named toast', () => {
    const state = addAll([{ message: 'a' }, { message: 'b' }])
    expect(dismissToast(state, 1).toasts.map((t) => t.message)).toEqual(['b'])
  })

  it('never reuses an id after a dismissal', () => {
    // Reused keys would make React animate a new toast as if it were the old one.
    let state = addAll([{ message: 'a' }])
    state = dismissToast(state, 1)
    expect(addToast(state, { message: 'b' }, T0).id).toBe(2)
  })
})

describe('visibleToasts', () => {
  it('renders the newest three and counts the rest', () => {
    const state = addAll([1, 2, 3, 4, 5].map((n) => ({ message: `toast ${n}` })))
    const { visible, overflow } = visibleToasts(state)

    expect(visible).toHaveLength(MAX_VISIBLE)
    expect(overflow).toBe(2)
    // Newest, because the most recent action is the one being waited on.
    expect(visible.map((t) => t.message)).toEqual(['toast 3', 'toast 4', 'toast 5'])
  })

  it('reports no overflow below the cap', () => {
    expect(visibleToasts(addAll([{ message: 'a' }, { message: 'b' }])).overflow).toBe(0)
  })

  it('handles an empty stack', () => {
    expect(visibleToasts(EMPTY_TOAST_STATE)).toEqual({ visible: [], overflow: 0 })
  })
})
