'use client'

/**
 * Dropdown menu (T-10.12), on Radix DropdownMenu.
 *
 * Radix supplies the parts that are tedious and easy to get subtly wrong:
 * roving focus, typeahead, `Escape`, click-outside, and collision detection
 * that flips the panel when it would otherwise run off the viewport edge
 * (T10-K).
 *
 * `menu.tsx` still exists for the topbar's hand-rolled popovers, which were
 * built in T-08 before this. T-12's row kebab uses THIS one; the topbar moves
 * across when it next changes, rather than being churned for its own sake.
 */

import * as Primitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { useToast } from '@/components/ui/toast'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import { cn } from '@/lib/utils/cn'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  testId?: string
  className?: string
}

export function Dropdown({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  testId,
  className,
}: DropdownProps) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          align={align}
          side={side}
          sideOffset={6}
          // `avoidCollisions` is Radix's default; naming it makes clear that
          // T10-K's "flips near the viewport edge" is a requirement and not a
          // happy accident.
          avoidCollisions
          collisionPadding={8}
          data-testid={testId}
          className={cn(
            'z-popover min-w-56 rounded-lg border border-subtle bg-surface-0 py-1 shadow-lg',
            className,
          )}
        >
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}

interface DropdownItemProps {
  children: ReactNode
  icon?: ReactNode
  /** Right-aligned hint, e.g. `⌘K`. Presentational — the shortcut is bound elsewhere. */
  shortcut?: string
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  testId?: string
  /** Navigates. Rendered as a real anchor so ⌘-click and middle-click work. */
  href?: string
  /**
   * Renders a `Soon` badge and raises the coming-soon toast on select.
   *
   * Clickable-and-explains rather than inert, for the same reason as
   * `MenuItem`: a row that silently does nothing leaves the user unable to
   * tell "not built" from "broken".
   */
  soon?: boolean
}

export function DropdownItem({
  children,
  icon,
  shortcut,
  onSelect,
  disabled,
  danger,
  testId,
  href,
  soon,
}: DropdownItemProps) {
  const toast = useToast()

  const label = (
    <>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {soon && (
        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
          Soon
        </span>
      )}
      {shortcut && <span className="shrink-0 text-xs text-muted">{shortcut}</span>}
    </>
  )

  return (
    <Primitive.Item
      disabled={disabled}
      onSelect={() => {
        if (soon) {
          toast.info(TOAST_MESSAGES.comingSoon)
          return
        }
        onSelect?.()
      }}
      // `asChild` when there is an href, so the item IS the anchor rather than
      // wrapping one — a div that calls router.push() is not a link.
      asChild={Boolean(href)}
      data-testid={testId}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-body outline-none transition-colors duration-fast',
        // Radix sets data-highlighted for BOTH pointer and keyboard focus, so
        // hover and arrow-key navigation cannot drift apart visually.
        'data-[highlighted]:bg-surface-hover',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        danger
          ? 'text-danger data-[highlighted]:bg-danger-subtle'
          : 'text-primary data-[highlighted]:text-primary',
      )}
    >
      {href ? (
        <Link href={href}>
          {icon && (
            <span className={cn('shrink-0', danger ? 'text-danger' : 'text-muted')}>{icon}</span>
          )}
          {label}
        </Link>
      ) : (
        <>
          {icon && (
            <span className={cn('shrink-0', danger ? 'text-danger' : 'text-muted')}>{icon}</span>
          )}
          {label}
        </>
      )}
    </Primitive.Item>
  )
}

export function DropdownSeparator() {
  return <Primitive.Separator className="my-1 h-px bg-surface-2" />
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <Primitive.Label className="px-3 pb-1 pt-2 text-label uppercase text-muted">
      {children}
    </Primitive.Label>
  )
}

/** A nested submenu — `Export ▸`, `Move to channel ▸` (T-12.11, T-18.6). */
export function DropdownSub({
  label,
  icon,
  children,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Primitive.Sub>
      <Primitive.SubTrigger className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-body text-primary outline-none transition-colors duration-fast data-[highlighted]:bg-surface-hover">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span aria-hidden="true" className="shrink-0 text-muted">
          ›
        </span>
      </Primitive.SubTrigger>
      <Primitive.Portal>
        <Primitive.SubContent
          sideOffset={4}
          className="z-popover min-w-48 rounded-lg border border-subtle bg-surface-0 py-1 shadow-lg"
        >
          {children}
        </Primitive.SubContent>
      </Primitive.Portal>
    </Primitive.Sub>
  )
}

/**
 * A pick-one group inside a menu — playback speed, sort order (T-19.6).
 *
 * Radix's radio parts rather than plain items with a hand-drawn tick: they set
 * `role="menuitemradio"` and `aria-checked`, so a screen reader announces the
 * current choice instead of reading seven identical-sounding numbers.
 */
export function DropdownRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <Primitive.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </Primitive.RadioGroup>
  )
}

export function DropdownRadioItem({
  value,
  children,
  testId,
}: {
  value: string
  children: ReactNode
  testId?: string
}) {
  return (
    <Primitive.RadioItem
      value={value}
      data-testid={testId}
      // `pl-8` reserves the indicator's column on EVERY row, so the labels stay
      // in one line rather than shifting as the selection moves.
      className={cn(
        'relative flex cursor-pointer items-center py-2 pl-8 pr-3 text-body text-primary outline-none',
        'transition-colors duration-fast data-[highlighted]:bg-surface-hover',
      )}
    >
      <Primitive.ItemIndicator className="absolute left-3 text-accent">
        <Check size={14} strokeWidth={2.5} />
      </Primitive.ItemIndicator>
      {children}
    </Primitive.RadioItem>
  )
}
