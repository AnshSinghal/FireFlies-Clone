import type { ReactNode } from 'react'

/**
 * One setting, as a bordered card — the anatomy read off
 * `docs/reference/fireflies/07.png` and confirmed on `08.png` (T-46.1, item 10).
 *
 * Fireflies renders each setting as its own card inside a section group, and
 * the two control positions are NOT the same:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  Auto-record meetings              [toggle]  │   trailing, aligned to the title
 *   │  Fireflies notetaker will join…              │
 *   │  ┌────────────────────────────────────────┐  │
 *   │  │ Record all calendar events…         ▾  │  │   full width, its own row
 *   │  └────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────┘
 *
 * An earlier draft of the audit said "control right" for everything. That is
 * true of switches and false of dropdowns, and building from it would have
 * produced a third layout matching neither document. Hence two slots rather
 * than one: `trailing` sits beside the title, `control` spans the card below
 * the description.
 *
 * The label lives HERE, not in the control. Both primitives already support
 * that without changing their defaults — `Select` takes `hideLabel` and
 * `Switch` takes `ariaLabel` with no visible label — so the accessible name
 * survives while the visible one moves into the card. Nothing about the
 * Notebook toolbar's inline selects changes.
 */
export function SettingCard({
  title,
  description,
  trailing,
  control,
  testId,
}: {
  title: string
  description?: string
  /** Aligned to the title. For switches and badges. */
  trailing?: ReactNode
  /** Full width, on its own row under the description. For selects. */
  control?: ReactNode
  testId?: string
}) {
  return (
    <div className="rounded-md border border-subtle bg-surface-0 p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body font-medium text-primary">{title}</p>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>

      {control ? <div className="mt-3">{control}</div> : null}
    </div>
  )
}

/**
 * A titled group of cards, as `Recording` and `Customization` are in the
 * reference. The heading sits outside the cards, on their left edge.
 */
export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-secondary">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
