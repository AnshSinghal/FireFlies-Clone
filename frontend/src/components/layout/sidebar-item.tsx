'use client'

/**
 * One rail item (T-07).
 *
 * Geometry is MEASURED from the reference screenshots, not taken from the plan:
 *
 *   item height    36px          (measured 35.4)
 *   pitch          40px          → 2px vertical margin
 *   horizontal     12px inset    (measured 12.3 / 11.6 — the plan says 8px)
 *   inner padding  12px          (measured 13.0 from pill edge to icon)
 *   radius         8px
 *
 * The 12px inset is the visible one: at 8px the pill sits noticeably closer to
 * the rail edge than the reference. See ADR-021.
 */

import * as Tooltip from '@radix-ui/react-tooltip'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SidebarItemProps {
  id: string
  label: string
  href: string
  icon: LucideIcon
  active?: boolean
  collapsed?: boolean
  soon?: boolean
  /** Right-aligned count, e.g. a channel's meeting total. */
  count?: number
  /** Overrides the icon entirely — used by channel rows showing # or a lock. */
  iconSlot?: ReactNode
  testId?: string
  onNavigate?: () => void
}

export function SidebarItem({
  label,
  href,
  icon: Icon,
  active = false,
  collapsed = false,
  soon = false,
  count,
  iconSlot,
  testId,
  onNavigate,
}: SidebarItemProps) {
  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      data-active={active || undefined}
      onClick={onNavigate}
      className={[
        // 36px tall, 12px inset from both rail edges, 8px radius.
        'mx-3 flex h-9 items-center gap-3 rounded-md px-3',
        'transition-colors duration-fast',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-accent-subtle font-semibold text-accent-strong'
          : 'text-secondary hover:bg-surface-hover hover:text-primary',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={active ? 'text-accent' : 'text-muted'}>
        {iconSlot ?? <Icon size={20} strokeWidth={1.75} aria-hidden="true" />}
      </span>

      {/*
        Labels are removed from the DOM when collapsed rather than hidden with
        opacity — a 240px label inside a 64px rail wraps mid-animation and the
        rail visibly jitters as it closes.
      */}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-body-strong">{label}</span>

          {soon && (
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
              Soon
            </span>
          )}

          {count !== undefined && <span className="tnum shrink-0 text-xs text-muted">{count}</span>}
        </>
      )}
    </Link>
  )

  // A tooltip repeating a label that is already visible is noise, so it exists
  // only while collapsed (T-07.7).
  if (!collapsed) return <li>{link}</li>

  return (
    <li>
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            data-testid="sidebar-tooltip"
            className="z-popover rounded-md border border-subtle bg-surface-0 px-2 py-1 text-xs text-primary shadow-md"
          >
            {label}
            {soon && <span className="ml-1 text-muted">· Soon</span>}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </li>
  )
}
