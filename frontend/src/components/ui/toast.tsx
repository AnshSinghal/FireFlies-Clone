'use client'

/**
 * Toasts.
 *
 * **Scheduled for T-09, built here** because T-08.6's `Sign out` is specified as
 * "shows an info toast" and the alternative — a temporary inline banner thrown
 * away a task later — would leave that behaviour untested at the point it ships.
 * T-09 extends this with action buttons, promise toasts and the undo pattern;
 * the API below is the subset T-08 needs.
 */

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
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

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  /** Milliseconds before auto-dismiss. `null` keeps it until dismissed. */
  duration: number | null
}

type ToastInput = Omit<Partial<Toast>, 'id' | 'title'> & { title: string }

interface ToastContextValue {
  toasts: readonly Toast[]
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Errors stay until dismissed — auto-hiding the one message the user needs to act on is a bug. */
const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  info: 5000,
  success: 4000,
  warning: 6000,
  error: null,
}

/** Beyond this the stack covers the content it is describing. */
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Monotonic counter rather than Math.random(): ids must be stable for React
  // keys and predictable in tests.
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const variant = input.variant ?? 'info'
      const id = nextId.current++
      const duration = input.duration === undefined ? DEFAULT_DURATION[variant] : input.duration

      setToasts((current) => [...current, { ...input, id, variant, duration }].slice(-MAX_VISIBLE))

      if (duration !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  // Timers outlive the component if the provider unmounts mid-countdown.
  const timersRef = timers
  useEffect(() => {
    const map = timersRef.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [timersRef])

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const

const ICON_COLOUR: Record<ToastVariant, string> = {
  info: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    /*
     * `aria-live="polite"` on a container that is always mounted. Toasts
     * announce only if the live region exists *before* its children change —
     * mounting the region together with the first toast announces nothing.
     *
     * pointer-events-none on the stack, auto on each toast, so the empty column
     * does not swallow clicks on the page beneath it.
     */
    <div
      data-testid="toast-viewport"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-toast max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant]
        return (
          <div
            key={toast.id}
            data-testid="toast"
            data-variant={toast.variant}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3 shadow-lg"
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              className={`mt-0.5 shrink-0 ${ICON_COLOUR[toast.variant]}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-primary">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-sm text-secondary">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-1 shrink-0 rounded-sm p-1 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
