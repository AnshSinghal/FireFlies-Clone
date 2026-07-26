/**
 * Toast state as pure functions (T-09.1, T-09.2, T-09.5).
 *
 * Deduplication windows, eviction order and in-place promise mutation are the
 * parts of a toast system that actually have edge cases, and none of them need
 * a DOM. Keeping them here means they are unit-tested directly instead of
 * through a component that also has to be rendered, timed and clicked.
 *
 * Every function takes `now` rather than calling `Date.now()`, so the
 * dedup-window tests assert on real boundaries instead of sleeping.
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'warning' | 'loading'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  variant: ToastVariant
  message: string
  description?: string
  action?: ToastAction
  /** Milliseconds until auto-dismiss. `null` means it stays until dismissed. */
  duration: number | null
  /** Dedup counter, rendered as `×2`. Always ≥ 1. */
  count: number
  createdAt: number
}

export interface ToastInput {
  variant?: ToastVariant
  message: string
  description?: string
  action?: ToastAction
  duration?: number | null
}

export interface ToastState {
  toasts: Toast[]
  nextId: number
}

export const EMPTY_TOAST_STATE: ToastState = { toasts: [], nextId: 1 }

/**
 * Errors NEVER auto-dismiss. A message the user has to act on that disappears
 * before it can be read is worse than no message — they know something went
 * wrong and have no idea what. Loading toasts are resolved by `toast.promise`,
 * not by a timer.
 */
export const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: null,
  loading: null,
}

/** Rendered at once. Beyond this the stack covers the content it describes. */
export const MAX_VISIBLE = 3

/** Identical toasts inside this window collapse into a counter. */
export const DEDUPE_WINDOW_MS = 1000

function isDuplicate(toast: Toast, input: ToastInput, variant: ToastVariant, now: number): boolean {
  return (
    toast.variant === variant &&
    toast.message === input.message &&
    now - toast.createdAt < DEDUPE_WINDOW_MS
  )
}

/**
 * Add a toast, or collapse it into an identical recent one.
 *
 * Double-clicking Delete fires two mutations and would otherwise stack two
 * identical toasts — which reads as "it deleted two things".
 */
export function addToast(
  state: ToastState,
  input: ToastInput,
  now: number,
): { state: ToastState; id: number } {
  const variant = input.variant ?? 'info'

  const duplicate = state.toasts.find((t) => isDuplicate(t, input, variant, now))
  if (duplicate) {
    return {
      id: duplicate.id,
      state: {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === duplicate.id
            ? // `createdAt` advances so a burst keeps collapsing rather than
              // splitting once the window since the FIRST one elapses.
              { ...t, count: t.count + 1, createdAt: now }
            : t,
        ),
      },
    }
  }

  const toast: Toast = {
    id: state.nextId,
    variant,
    message: input.message,
    description: input.description,
    action: input.action,
    duration: input.duration === undefined ? DEFAULT_DURATION[variant] : input.duration,
    count: 1,
    createdAt: now,
  }

  return { id: toast.id, state: { toasts: [...state.toasts, toast], nextId: state.nextId + 1 } }
}

export function dismissToast(state: ToastState, id: number): ToastState {
  return { ...state, toasts: state.toasts.filter((t) => t.id !== id) }
}

/**
 * Mutate a toast in place (T-09.2).
 *
 * `toast.promise` needs the loading toast to *become* the success or error one.
 * Dismissing and adding would slide one card out and another in for what the
 * user experienced as a single action.
 */
export function updateToast(
  state: ToastState,
  id: number,
  patch: Partial<Omit<Toast, 'id' | 'count'>>,
  now: number,
): ToastState {
  return {
    ...state,
    toasts: state.toasts.map((t) =>
      t.id === id
        ? {
            ...t,
            ...patch,
            // Restart the dedup window: the toast now says something different,
            // so a later identical message should not fold into it by accident.
            createdAt: now,
          }
        : t,
    ),
  }
}

/**
 * The newest `MAX_VISIBLE`, plus how many are hidden behind them.
 *
 * Newest rather than oldest, because the most recent action is the one the user
 * is waiting on.
 */
export function visibleToasts(state: ToastState): { visible: Toast[]; overflow: number } {
  const visible = state.toasts.slice(-MAX_VISIBLE)
  return { visible, overflow: state.toasts.length - visible.length }
}
