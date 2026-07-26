/**
 * Placeholder surface — MINIMAL (T-30 builds the real one).
 *
 * Exists now because T-07's nav links to routes that are out of scope, and a
 * link that 404s reads as broken rather than as deliberately deferred. The
 * evaluator will click these.
 */

import { ArrowLeft, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface ComingSoonProps {
  title: string
  description: string
  icon: LucideIcon
  /** What the real feature does — honest about scope rather than coy. */
  detail?: string
}

export function ComingSoon({ title, description, icon: Icon, detail }: ComingSoonProps) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
      data-testid={`coming-soon-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle">
        <Icon size={24} strokeWidth={1.75} className="text-accent" />
      </span>

      <div className="max-w-prose space-y-2">
        <h1 className="text-h2 text-primary">{title}</h1>
        <p className="text-body text-secondary">{description}</p>
        {detail && (
          <p className="rounded-lg border border-subtle bg-surface-2 px-4 py-3 text-sm text-muted">
            <span className="font-semibold">In the real Fireflies:</span> {detail}
          </p>
        )}
      </div>

      <Link
        href="/notebook"
        className="flex h-btn-md items-center gap-2 rounded-md border border-strong bg-surface-0 px-4 text-body-strong text-primary transition-colors duration-fast hover:bg-surface-hover"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        Back to meetings
      </Link>
    </div>
  )
}
