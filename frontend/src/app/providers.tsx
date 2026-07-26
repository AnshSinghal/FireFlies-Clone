'use client'

/**
 * Client-side providers (T-06.3, T-09.11).
 *
 * Mounted once in the root layout. Everything below here is a client component,
 * which is a deliberate architectural choice rather than an accident — see
 * ADR-005: cache invalidation across the Notebook, the details drawer and the
 * Notepad is the hard part of this app, and TanStack Query solves it.
 */

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

import { ToastProvider, useToast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

type Notifier = (message: string, retry?: () => void) => void

/*
 * The QueryClient is constructed before any React tree exists, so its
 * MutationCache cannot hold a reference to the toast API — the provider that
 * owns it has not mounted yet, and inverting the nesting is not an option
 * (a toast raised from a mutation needs the query client above it).
 *
 * So the cache calls through a slot that `ToastBridge` fills on mount. Before
 * that moment the call is a no-op, which is correct: nothing can have failed
 * yet.
 */
let notifyError: Notifier | null = null

function makeQueryClient() {
  return new QueryClient({
    /*
     * No mutation can fail silently (T-09.11). A mutation that wants to present
     * its own failure opts out with `meta: { silent: true }`.
     *
     * A default rather than something each mutation remembers, because the
     * failure mode of forgetting is invisible — the user clicks, nothing
     * happens, and nothing says why.
     */
    mutationCache: new MutationCache({
      onError: (error, variables, _context, mutation) => {
        if (mutation.options.meta?.silent) return

        // The API's own message when it sent one; the generic line otherwise.
        // A raw NetworkError string is not something to show a user.
        const message =
          error instanceof ApiError && error.message ? error.message : TOAST_MESSAGES.saveFailed

        // `Retry` re-runs the exact mutation with the exact variables (T-09.3).
        // Only offered when retrying could plausibly work — a 404 or a
        // validation error will fail identically, and a button that cannot
        // succeed is worse than no button.
        const retryable = !(error instanceof ApiError) || error.isRetryable
        notifyError?.(message, retryable ? () => void mutation.execute(variables) : undefined)
      },
    }),

    defaultOptions: {
      queries: {
        // Data this app shows changes on human timescales. Thirty seconds
        // avoids a refetch on every navigation without ever feeling stale.
        staleTime: 30_000,
        gcTime: 5 * 60_000,

        // A demo that refetches every time you alt-tab back looks janky, and
        // the flash of a loading state is worse than slightly old data.
        refetchOnWindowFocus: false,

        retry: (failureCount, error) => {
          // Never retry a 404, a 410 or a validation error — the answer will
          // not change, and three attempts just delay the message.
          if (error instanceof ApiError && !error.isRetryable) return false
          return failureCount < 1
        },
      },
      mutations: {
        // Mutations are user-initiated and often not idempotent. A silent retry
        // of a failed POST is how you get two meetings from one click.
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  // On the server, always a fresh client — a module-level singleton would leak
  // one user's cache into another's request.
  if (typeof window === 'undefined') return makeQueryClient()

  // In the browser, one client for the app's lifetime. Recreating it on a
  // re-render would throw away every cached query.
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

/** Fills the notifier slot the MutationCache calls through. Renders nothing. */
function ToastBridge() {
  const toast = useToast()

  useEffect(() => {
    // A genuine "subscribe an external system to React state" effect: the
    // QueryClient is the external system.
    notifyError = (message, retry) =>
      toast.error({
        message,
        action: retry ? { label: 'Retry', onClick: retry } : undefined,
      })
    return () => {
      notifyError = null
    }
  }, [toast])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  // `useState` with an initialiser, not a bare call — React may render this
  // twice in development, and the initialiser runs only once.
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query provider, so a mutation's onError can raise a toast. */}
      <ToastProvider>
        <ToastBridge />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}
