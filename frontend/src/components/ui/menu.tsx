'use client'

/**
 * Dropdown menu primitives.
 *
 * The topbar has three popovers (T-08.5 – T-08.7) and they must not each invent
 * their own padding, divider and "Soon" badge. Positioning and dismissal come
 * from `usePopover`; this is the panel and its rows.
 */

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'

interface MenuPanelProps {
  children: ReactNode
  /** Which edge the panel hangs from. Right for the topbar's right cluster. */
  align?: 'left' | 'right'
  className?: string
  testId?: string
  label: string
}

export function MenuPanel({
  children,
  align = 'right',
  className = '',
  testId,
  label,
}: MenuPanelProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      data-testid={testId}
      className={`absolute top-full z-popover mt-2 w-flyout rounded-lg border border-subtle bg-surface-0 py-1 shadow-lg ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}

interface MenuItemProps {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  children: ReactNode
  href?: string
  onSelect?: () => void
  /** Renders a `Soon` badge and makes the row inert. */
  soon?: boolean
  testId?: string
}

export function MenuItem({ icon: Icon, children, href, onSelect, soon, testId }: MenuItemProps) {
  const content = (
    <>
      {Icon && <Icon size={16} strokeWidth={1.75} className="shrink-0 text-muted" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {soon && (
        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
          Soon
        </span>
      )}
    </>
  )

  const shared =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-body text-primary transition-colors duration-fast'

  /*
   * A "Soon" row stays in the DOM and stays announced — it is telling the user
   * the feature exists — but it is a `<span>`, not a button. A disabled button
   * that still looks clickable is worse than a label that clearly is not.
   */
  if (soon) {
    return (
      <span
        role="menuitem"
        aria-disabled="true"
        data-testid={testId}
        className={`${shared} cursor-default text-secondary`}
      >
        {content}
      </span>
    )
  }

  if (href) {
    return (
      <Link
        role="menuitem"
        href={href}
        onClick={onSelect}
        data-testid={testId}
        className={`${shared} hover:bg-surface-hover`}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      data-testid={testId}
      className={`${shared} hover:bg-surface-hover`}
    >
      {content}
    </button>
  )
}

export function MenuDivider() {
  return <hr className="my-1 border-t border-subtle" role="separator" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-label uppercase text-muted">{children}</div>
}
