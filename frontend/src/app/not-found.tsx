import { FileQuestion } from 'lucide-react'
import Link from 'next/link'

/**
 * Branded 404 (T-06.8 / test T06-H).
 *
 * `/meeting/does-not-exist` must land here, not on a stack trace.
 */
export default function NotFound() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
      data-testid="not-found"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle">
        <FileQuestion size={24} strokeWidth={1.75} className="text-accent" />
      </span>

      <div className="space-y-1">
        <h1 className="text-h2 text-primary">Page not found</h1>
        <p className="text-body text-secondary">
          This meeting doesn&apos;t exist, or it was deleted.
        </p>
      </div>

      <Link
        href="/notebook"
        className="flex h-btn-md items-center rounded-md bg-accent px-4 text-body-strong text-inverse transition-colors duration-fast hover:bg-accent-hover"
      >
        Back to meetings
      </Link>
    </div>
  )
}
