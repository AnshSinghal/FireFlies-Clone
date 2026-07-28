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
      {/*
        Larger and darker than the cards it labels, because the reference is
        both and ours was neither (ADR-155). Measured on `07.png` and `08.png`,
        which agree: their section heading's cap is 18–19px against a 14px card
        title, and it is `#18243b` where the card title is `#1e2b42` — so the
        heading is the most prominent thing in the group.

        Ours was `text-sm` muted against a `text-body` primary card title: cap 9
        against 11, and grey against near-black. The hierarchy was inverted on
        both axes at once, which is why the groups read as loose cards with a
        label rather than as titled sections.

        `text-h2` overshoots slightly — 1.43 against their 1.32, where `text-h3`
        would undershoot at 1.14. The exact target is ~18px and the scale has
        16 and 20; overshooting is the safer miss here, because the defect being
        fixed is a heading that was too small to lead its group.
      */}
      <h3 className="text-h2 text-primary">{title}</h3>
      {/*
        The cards sit in a tinted well, not directly on the page. Sampled from
        `07.png`: the page is `#FFFFFF`, the gap BETWEEN two cards is `#F9FAFB`,
        and the card interior is `#FFFFFF` again — so there is a container
        behind them. `--ff-surface-2` already resolves to `#F9FAFB`, so this is
        the reference's own value rather than a near miss.

        Fill only: scanning across its left edge gives 255 → 253 → 249 with no
        border colour, just corner antialiasing. Radius 17px on their 2000px
        capture is 12px at our 1440 (`rounded-lg`), and their 24px padding is
        ~17px, so `p-4`.

        **Dark inverts the depth on purpose.** In light the well is darker than
        the cards and recedes. Dark re-points the grey primitives so the same
        token is LIGHTER than `surface-0`, making the well a raised panel with
        inset cards. That is this scale's stated convention — "elevation
        recedes; surfaces do the lifting" — and the alternative was a bespoke
        dark override, which CLAUDE.md calls a token-layer bug. Left as one
        token in both themes because there is no dark reference screenshot: a
        darker dark value would be invented, not sampled.
      */}
      <div className="space-y-3 rounded-lg bg-surface-2 p-4">{children}</div>
    </section>
  )
}
