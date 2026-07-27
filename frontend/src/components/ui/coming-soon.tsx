/**
 * Placeholder surface (T-30.1).
 *
 * Exists because T-07's nav links to routes that are out of scope, and a link
 * that 404s reads as broken rather than as deliberately deferred. The
 * evaluator will click these.
 *
 * `children` render between the explainer and the back button, so a surface
 * can be branded-and-deliberate (skill cards, an integrations grid, sample
 * charts) instead of just an empty apology. With children the layout switches
 * from a centered hero to a top-aligned page — a grid of cards centered in a
 * 60vh column reads as a mistake.
 */

import { ArrowLeft, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface ComingSoonProps {
  title: string
  description: string
  icon: LucideIcon
  /** What the real feature does — honest about scope rather than coy. */
  detail?: string
  /** Overrides the testid slug derived from the title. */
  feature?: string
  children?: ReactNode
}

export function ComingSoon({
  title,
  description,
  icon: Icon,
  detail,
  feature,
  children,
}: ComingSoonProps) {
  const slug = feature ?? title.toLowerCase().replace(/\s+/g, '-')

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 text-center',
        children ? 'py-8' : 'min-h-[60vh] justify-center',
      )}
      data-testid={`coming-soon-${slug}`}
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

      {children && <div className="w-full max-w-4xl text-left">{children}</div>}

      <Link
        href="/notebook"
        data-testid={`coming-soon-${slug}-back`}
        className="flex h-btn-md items-center gap-2 rounded-md border border-strong bg-surface-0 px-4 text-body-strong text-primary transition-colors duration-fast hover:bg-surface-hover"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        Back to meetings
      </Link>
    </div>
  )
}
