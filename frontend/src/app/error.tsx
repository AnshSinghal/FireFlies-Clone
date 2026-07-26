'use client'

/**
 * Route error boundary (T-06.8).
 *
 * Branded, with a working Retry — not Next's default overlay, which shows a
 * stack trace and is the single most obviously-broken thing an evaluator can
 * encounter in a deployed demo.
 */

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server-side in production this is where Sentry would go (T-44.10).
    console.error(error)
  }, [error])

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
      data-testid="route-error"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle">
        <AlertTriangle size={24} strokeWidth={1.75} className="text-danger" />
      </span>

      <div className="space-y-1">
        <h1 className="text-h2 text-primary">Something went wrong</h1>
        <p className="text-body text-secondary">
          We couldn&apos;t load this page. This is usually temporary.
        </p>
      </div>

      {/* The digest correlates to the server log without exposing the message. */}
      {error.digest && <code className="text-xs text-muted">Reference: {error.digest}</code>}

      <Button variant="primary" onClick={reset} data-testid="route-error-retry">
        Try again
      </Button>
    </div>
  )
}
