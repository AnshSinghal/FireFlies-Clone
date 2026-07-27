'use client'

/**
 * Popover (T-10.16), on Radix Popover.
 *
 * Distinct from `Dropdown`: a dropdown is a MENU (roving focus, typeahead, one
 * choice then close), a popover is a PANEL (arbitrary content, its own form
 * controls, closes when you say so). Using a menu for the filters panel would
 * make arrow keys jump between checkboxes instead of moving the cursor.
 */

import * as Primitive from '@radix-ui/react-popover'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface PopoverProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  testId?: string
  label: string
  /**
   * Close when focus merely LEAVES the panel (default true).
   *
   * A popover opened from a menu item must set this false: the menu closes on
   * select and restores focus to its trigger, and that programmatic focus move
   * reads as focus-outside — the panel would dismiss itself milliseconds after
   * opening. Explicit dismissal (Escape, an outside CLICK) is unaffected,
   * which is what a panel holding an uncommitted draft actually wants.
   */
  dismissOnFocusOutside?: boolean
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  open,
  onOpenChange,
  className,
  testId,
  label,
  dismissOnFocusOutside = true,
}: PopoverProps) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
          data-testid={testId}
          onFocusOutside={dismissOnFocusOutside ? undefined : (event) => event.preventDefault()}
          className={cn(
            'z-popover w-flyout rounded-lg border border-subtle bg-surface-0 p-3 shadow-lg',
            className,
          )}
        >
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
