'use client'

/**
 * Client-side providers (T-06.3).
 *
 * Mounted once in the root layout. Everything below here is a client component,
 * which is a deliberate architectural choice rather than an accident — see
 * ADR-005: cache invalidation across the Notebook, the details drawer and the
 * Notepad is the hard part of this app, and TanStack Query solves it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { ToastProvider } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'

function makeQueryClient() {
  return new QueryClient({
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

export function Providers({ children }: { children: ReactNode }) {
  // `useState` with an initialiser, not a bare call — React may render this
  // twice in development, and the initialiser runs only once.
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query provider, so a mutation's onError can raise a toast. */}
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
