'use client'

/**
 * Tooltip (T-10.2).
 *
 * A tooltip is a SUPPLEMENT, never the only place a control's name lives — it
 * does not exist for touch users and is not reliably announced. So `IconButton`
 * requires `aria-label` separately and this only adds the visible hint.
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

/** Mounted once, near the root, so every tooltip shares one delay timer. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    // 400ms: long enough that sweeping the pointer across a toolbar does not
    // flash six tooltips, short enough to feel like an answer.
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Suppresses the tooltip without unmounting the trigger — for a control whose label is already visible. */
  disabled?: boolean
}

export function Tooltip({ content, children, side = 'top', disabled }: TooltipProps) {
  if (disabled) return <>{children}</>

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          data-testid="tooltip"
          className="z-popover max-w-64 rounded-md bg-primary px-2 py-1 text-xs text-inverse shadow-md"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-primary" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
