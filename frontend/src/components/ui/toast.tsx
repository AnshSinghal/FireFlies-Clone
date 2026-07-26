'use client'

/**
 * Toast system (T-09).
 *
 * The assignment lists "Notifications / toasts" as a Fireflies-experience
 * requirement, and the interesting parts are not the card — they are the timer
 * that pauses on hover, the single toast that mutates through a promise's
 * lifecycle, and the fact that an error never disappears on its own.
 *
 * State lives in `lib/toast/store.ts` as pure functions so the dedup window and
 * eviction order are unit-tested without a DOM. This file owns the React
 * bindings, the timers and the rendering.
 */

import { AlertCircle, CheckCircle, Info, Loader2, TriangleAlert, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  DEFAULT_DURATION,
  EMPTY_TOAST_STATE,
  addToast,
  dismissToast,
  updateToast,
  visibleToasts,
  type Toast,
  type ToastInput,
  type ToastVariant,
} from '@/lib/toast/store'

export type { Toast, ToastVariant } from '@/lib/toast/store'

type Message = string | Omit<ToastInput, 'variant'>

interface PromiseMessages<T> {
  loading: Message
  success: Message | ((value: T) => Message)
  error: Message | ((error: unknown) => Message)
}

interface ToastApi {
  /** The escape hatch, for a toast that needs an explicit variant or duration. */
  show: (input: ToastInput) => number
  success: (message: Message) => number
  error: (message: Message) => number
  info: (message: Message) => number
  warning: (message: Message) => number
  loading: (message: Message) => number
  /** Mutates ONE toast through loading → success/error (T-09.2). */
  promise: <T>(promise: Promise<T>, messages: PromiseMessages<T>) => Promise<T>
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function normalise(message: Message): Omit<ToastInput, 'variant'> {
  return typeof message === 'string' ? { message } : message
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(EMPTY_TOAST_STATE)

  /*
   * The API object must be referentially stable — `useToast()` lands in the
   * dependency array of effects and callbacks all over the app, and an object
   * rebuilt each render would re-fire every one of them. So the setter closes
   * over nothing but `setState`, which React guarantees is stable.
   */
  const dismiss = useCallback((id: number) => setState((s) => dismissToast(s, id)), [])

  const push = useCallback((input: ToastInput) => {
    // The id has to be returned synchronously for `promise` to update it, but
    // it is allocated inside the updater where the current state is known.
    // Reading it out of the closure is the standard escape hatch.
    let id = -1
    setState((s) => {
      const result = addToast(s, input, Date.now())
      id = result.id
      return result.state
    })
    return id
  }, [])

  /*
   * A plain object literal, not a callable function with properties bolted on.
   * `react-hooks/immutability` rejects `fn.success = …` — a value created inside
   * a memo is treated as frozen once built, and the compiler is entitled to
   * assume that. T-09.1 only ever specifies `toast.success` / `.error` / …, so
   * nothing needed the callable shape in the first place.
   */
  const api = useMemo<ToastApi>(() => {
    const settle = (id: number, variant: ToastVariant, message: Message) =>
      setState((s) =>
        updateToast(
          s,
          id,
          {
            ...normalise(message),
            variant,
            // Recomputed from the NEW variant, so the success toast gets its 4s
            // timer and the error toast gets none.
            duration: DEFAULT_DURATION[variant],
            // A loading toast's action (if any) belonged to the pending state.
            action: undefined,
          },
          Date.now(),
        ),
      )

    return {
      show: push,
      success: (m) => push({ ...normalise(m), variant: 'success' }),
      error: (m) => push({ ...normalise(m), variant: 'error' }),
      info: (m) => push({ ...normalise(m), variant: 'info' }),
      warning: (m) => push({ ...normalise(m), variant: 'warning' }),
      loading: (m) => push({ ...normalise(m), variant: 'loading' }),
      dismiss,

      promise: async <T,>(promise: Promise<T>, messages: PromiseMessages<T>) => {
        const id = push({ ...normalise(messages.loading), variant: 'loading' })

        try {
          const value = await promise
          settle(
            id,
            'success',
            typeof messages.success === 'function' ? messages.success(value) : messages.success,
          )
          return value
        } catch (error) {
          settle(
            id,
            'error',
            typeof messages.error === 'function' ? messages.error(error) : messages.error,
          )
          // Rethrown: `promise` is a display concern and must not swallow the
          // failure the caller's own error handling depends on.
          throw error
        }
      },
    }
  }, [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport state={state} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: TriangleAlert,
  loading: Loader2,
}

/** Left edge, icon. The variant is carried by colour AND by icon shape, never colour alone. */
const VARIANT_STYLE: Record<ToastVariant, { edge: string; icon: string }> = {
  success: { edge: 'bg-success', icon: 'text-success' },
  error: { edge: 'bg-danger', icon: 'text-danger' },
  info: { edge: 'bg-accent', icon: 'text-accent' },
  warning: { edge: 'bg-warning', icon: 'text-warning' },
  loading: { edge: 'bg-surface-2', icon: 'text-muted' },
}

function ToastViewport({
  state,
  onDismiss,
}: {
  state: typeof EMPTY_TOAST_STATE
  onDismiss: (id: number) => void
}) {
  const { visible, overflow } = visibleToasts(state)
  const regionRef = useRef<HTMLDivElement>(null)

  // Escape dismisses the newest toast, but only while focus is inside the
  // region (T-09.8) — a global Escape would fight the modal and the search field.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const newest = visible.at(-1)
    if (!newest) return
    event.stopPropagation()
    onDismiss(newest.id)
  }

  return (
    /*
     * `role="region"` with a label, always mounted (T-09.7). A live region only
     * announces changes to a subtree that already existed — mounting the region
     * together with the first toast announces nothing at all.
     *
     * Bottom-centre below `sm` because a 380px card pinned to the right edge of
     * a 393px viewport has nowhere to go.
     */
    <div
      ref={regionRef}
      role="region"
      aria-label="Notifications"
      data-testid="toast-container"
      onKeyDown={onKeyDown}
      className="pointer-events-none fixed inset-x-4 bottom-6 z-toast flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {overflow > 0 && (
        <div
          data-testid="toast-overflow"
          className="pointer-events-none rounded-full bg-surface-2 px-2.5 py-1 text-xs text-secondary shadow-sm"
        >
          +{overflow} more
        </div>
      )}

      {visible.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const Icon = ICONS[toast.variant]
  const style = VARIANT_STYLE[toast.variant]

  const [paused, setPaused] = useState(false)

  const duration = toast.duration
  /*
   * The countdown restarts whenever the toast becomes a DIFFERENT toast —
   * `toast.promise` mutates loading → success in place, and the success
   * variant's 4s timer must start fresh rather than inherit the loading
   * variant's (which was `null`, i.e. never).
   */
  const timerKey = `${toast.variant}|${toast.message}|${duration}`
  const [timer, setTimer] = useState({ key: timerKey, remaining: duration ?? 0 })

  if (timer.key !== timerKey) {
    // Adjusting state DURING RENDER, which is React's documented answer to
    // "reset state when a prop changes". The effect version renders one frame
    // with the stale countdown and then re-renders — the cascading render
    // react-hooks/set-state-in-effect exists to prevent.
    setTimer({ key: timerKey, remaining: duration ?? 0 })
  }

  /*
   * An interval rather than a setTimeout, because the timer has to be pausable
   * (T-09.6) — and pausing a setTimeout means tracking elapsed time by hand
   * anyway. Ticking a remainder down does both jobs, and gives the progress bar
   * something to read.
   */
  useEffect(() => {
    if (duration === null || paused) return

    const TICK = 50
    const interval = setInterval(() => {
      setTimer((current) => {
        const remaining = current.remaining - TICK
        if (remaining <= 0) {
          clearInterval(interval)
          // Dismissing inside a state updater would be a render-phase side
          // effect; the microtask defers it past commit.
          queueMicrotask(() => onDismiss(toast.id))
          return { ...current, remaining: 0 }
        }
        return { ...current, remaining }
      })
    }, TICK)

    return () => clearInterval(interval)
  }, [duration, paused, onDismiss, toast.id])

  const progress = duration ? Math.max(0, Math.min(1, timer.remaining / duration)) : 0

  return (
    <div
      data-testid="toast"
      data-toast-variant={toast.variant}
      /*
       * Errors interrupt (`assertive`); everything else waits for a pause in
       * speech (`polite`). Announcing "Changes saved" over the top of what
       * someone is reading is the accessibility equivalent of a modal.
       */
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Pausing on keyboard focus too — otherwise tabbing to the Undo button
      // races the timer that is about to remove it.
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="ff-toast-enter pointer-events-auto relative w-toast max-w-full overflow-hidden rounded-lg border border-subtle bg-surface-0 shadow-lg"
    >
      {/* The 4px variant edge. A sibling rather than a border so the card's own
          1px border stays continuous behind it. */}
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${style.edge}`} />

      <div className="flex items-start gap-3 py-3 pl-5 pr-3">
        <Icon
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
          className={`mt-px shrink-0 ${style.icon} ${toast.variant === 'loading' ? 'animate-spin' : ''}`}
        />

        <div className="min-w-0 flex-1">
          <p className="text-body text-primary">
            {toast.message}
            {toast.count > 1 && (
              // `text-secondary`, not `text-muted`: the counter is meaningful
              // text and has to clear AA on its own (ADR-012 excuses metadata,
              // not this).
              <span data-testid="toast-count" className="ml-1.5 text-sm text-secondary">
                ×{toast.count}
              </span>
            )}
          </p>
          {toast.description && (
            <p className="mt-0.5 text-sm text-secondary">{toast.description}</p>
          )}
        </div>

        {toast.action && (
          <button
            type="button"
            data-testid="toast-action"
            onClick={() => {
              toast.action?.onClick()
              onDismiss(toast.id)
            }}
            className="shrink-0 rounded-sm px-2 py-1 text-body-strong text-accent transition-colors duration-fast hover:bg-surface-hover"
          >
            {toast.action.label}
          </button>
        )}

        <button
          type="button"
          data-testid="toast-dismiss"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="-mr-1 mt-px shrink-0 rounded-sm p-1 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {duration !== null && (
        // Hairline remaining-time bar (T-09.6). Decorative — the text already
        // says everything, and a progressbar role would be announced on every tick.
        <span
          aria-hidden="true"
          data-testid="toast-progress"
          className={`absolute bottom-0 left-0 h-px origin-left ${style.edge}`}
          style={{ width: '100%', transform: `scaleX(${progress})` }}
        />
      )}
    </div>
  )
}
