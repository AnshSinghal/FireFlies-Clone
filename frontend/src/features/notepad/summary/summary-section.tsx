'use client'

/**
 * One labelled, collapsible section of the summary (T-23.1).
 *
 * Used five times, so the label geometry — the type scale, the 24px above and
 * 12px below — is defined once. Five hand-written headings drift within a
 * single screen, and the drift is what makes a panel look assembled rather
 * than designed.
 *
 * Collapsed state persists PER MEETING: someone who closes the bullet notes on
 * a long meeting has not decided anything about the next one.
 */

import type { ReactNode } from 'react'

import { DisclosureToggle } from '@/components/ui/disclosure'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'

interface SummarySectionProps {
  id: string
  label: string
  meetingId: number
  children: ReactNode
  /** Sits to the right of the label — a count, a badge. */
  trailing?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}

export function SummarySection({
  id,
  label,
  meetingId,
  children,
  trailing,
  collapsible = true,
  defaultOpen = true,
}: SummarySectionProps) {
  const { value: stored, setValue: setStored } = useLocalStorage<boolean>(
    `ff.summary.${meetingId}.${id}`,
    defaultOpen,
  )
  const open = collapsible ? stored : true

  return (
    <section data-testid={`summary-section-${id}`} data-open={open} className="mt-6 first:mt-0">
      <div className="mb-3 flex items-center gap-2">
        {collapsible ? (
          <DisclosureToggle
            label={label}
            open={open}
            onToggle={() => setStored(!open)}
            controls={`summary-body-${id}`}
            data-testid={`summary-toggle-${id}`}
          />
        ) : (
          <h2 className="text-label uppercase text-muted">{label}</h2>
        )}

        {trailing}
      </div>

      {/*
        Unmounted rather than hidden when closed. A collapsed section that still
        rendered its contents would keep the outline's active-chapter effect and
        the notes' layout work running for something nobody can see.
      */}
      {open && <div id={`summary-body-${id}`}>{children}</div>}
    </section>
  )
}
