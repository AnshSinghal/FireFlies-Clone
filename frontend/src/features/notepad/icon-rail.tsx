'use client'

/**
 * The Notepad's 56px icon rail and its flyouts (T-18.7).
 *
 * Only one panel is open at a time, and clicking the active item closes it —
 * a rail where every click opens something and nothing closes it leaves the
 * user hunting for an ✕.
 *
 * Below 768px the rail becomes a bottom action bar (T-18.9): a vertical strip
 * of icons costs a sixth of a phone's width for chrome.
 */

import { Bookmark, MessageSquare, Quote, Search, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { StateView } from '@/components/ui/state-view'
import { cn } from '@/lib/utils/cn'

export const RAIL_ITEMS = [
  { id: 'search', label: 'Smart Search', icon: Search },
  { id: 'index', label: 'Index', icon: Sparkles },
  { id: 'soundbites', label: 'Soundbites', icon: Quote },
  { id: 'comments', label: 'Comments', icon: MessageSquare },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
] as const

export type RailItemId = (typeof RAIL_ITEMS)[number]['id']

interface IconRailProps {
  active: RailItemId | null
  onToggle: (id: RailItemId) => void
}

export function IconRail({ active, onToggle }: IconRailProps) {
  return (
    <nav
      aria-label="Meeting tools"
      data-testid="icon-rail"
      className={cn(
        // Bottom bar below `md`, vertical rail above it.
        'flex shrink-0 items-center gap-1 border-subtle bg-surface-1 p-1.5',
        'order-last w-full justify-around border-t md:order-none md:w-icon-rail md:flex-col md:justify-start md:border-r md:border-t-0',
      )}
    >
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = active === item.id

        return (
          <IconButton
            key={item.id}
            label={item.label}
            tooltipSide="right"
            icon={<Icon size={18} strokeWidth={1.75} />}
            onClick={() => onToggle(item.id)}
            aria-pressed={isActive}
            data-testid={`icon-rail-${item.id}`}
            className={cn(
              'rounded-md',
              isActive && 'bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent',
            )}
          />
        )
      })}
    </nav>
  )
}

interface RailFlyoutProps {
  item: RailItemId
  onClose: () => void
  children?: ReactNode
}

export function RailFlyout({ item, onClose, children }: RailFlyoutProps) {
  const meta = RAIL_ITEMS.find((entry) => entry.id === item)

  return (
    <aside
      aria-label={meta?.label}
      data-testid={`rail-flyout-${item}`}
      className="flex w-flyout shrink-0 flex-col border-r border-subtle bg-surface-0"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-subtle px-3">
        <h2 className="text-body-strong text-primary">{meta?.label}</h2>
        <IconButton
          label="Close panel"
          icon={<X size={16} strokeWidth={2} />}
          onClick={onClose}
          data-testid="rail-flyout-close"
          hideTooltip
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {children ?? (
          /*
           * Every rail item opens a real panel with real chrome, and says
           * plainly that its contents are not part of this build. An item that
           * opened nothing would be indistinguishable from a broken one.
           *
           * T-30 to T-34 fill these in.
           */
          <StateView
            variant="empty"
            title={`${meta?.label} isn't part of this build`}
            body="The panel and its place in the layout are here; the feature behind it is not."
            className="border-0 py-8"
          />
        )}
      </div>
    </aside>
  )
}
