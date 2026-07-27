'use client'

/**
 * Integrations grid (T-30.3).
 *
 * Lettermarks drawn with CSS, deliberately: shipping Zoom's or Salesforce's
 * actual logo files is a licensing bug, not a nice touch ("Do not ship
 * third-party trademarked logo files"). Greyscale keeps them reading as
 * inactive.
 *
 * `Connect` is a real, enabled button that explains itself via the
 * coming-soon toast (T30-C) — the same rule MenuItem's `soon` rows settled
 * (T-09.10): an inert `aria-disabled` control is indistinguishable from a
 * broken one, and screen readers + Playwright both refuse to click it. The
 * muted styling carries the "not active" signal; the click carries the why.
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
