'use client'

/**
 * Integrations grid (T-30.3).
 *
 * Lettermarks drawn with CSS, deliberately: shipping Zoom's or Salesforce's
 * actual logo files is a licensing bug, not a nice touch ("Do not ship
 * third-party trademarked logo files"). Greyscale keeps them reading as
 * inactive.
 *
 * `Connect` is aria-disabled but still clickable ON PURPOSE — T30-C wants a
 * click to raise the coming-soon toast, and a hard-disabled button that
 * swallows the click would leave the user guessing. Explaining beats
 * ignoring.
 */

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { INTEGRATIONS } from '@/lib/coming-soon/copy'
import { TOAST_MESSAGES } from '@/lib/toast/messages'

export function IntegrationsGrid() {
  const toast = useToast()

  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="integrations-grid">
      {INTEGRATIONS.map((integration) => (
        <li
          key={integration.id}
          data-testid={`integrations-card-${integration.id}`}
          className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-0 p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-body-strong text-muted grayscale"
          >
            {integration.mark}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-primary">{integration.name}</p>
            <p className="truncate text-sm text-secondary">{integration.blurb}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-disabled="true"
            className="shrink-0 text-muted"
            data-testid={`integrations-connect-${integration.id}`}
            onClick={() => toast.info({ message: TOAST_MESSAGES.comingSoon })}
          >
            Connect
          </Button>
        </li>
      ))}
    </ul>
  )
}
