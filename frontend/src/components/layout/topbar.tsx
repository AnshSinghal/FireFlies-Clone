'use client'

/**
 * Topbar (T-08).
 *
 * `grid-template-columns: auto minmax(0,1fr) auto` rather than flex. The reason
 * is real but this comment used to overstate it, so: the grid stops the search
 * field DRIFTING as data changes. With flex, a longer user name in the right
 * cluster would push the search box left and it would move between users. The
 * grid's middle column is sized by the layout, not by its neighbours' content.
 *
 * What it does NOT do — and an earlier version of this comment claimed it did —
 * is centre the field in the *window*. `auto 1fr auto` centres it in the space
 * left over between the two clusters, which is a different thing whenever the
 * clusters differ in width, and ours do. Measured at 1440px the field's centre
 * sits 69px left of the window's.
 *
 * That is left alone deliberately. `docs/reference/fireflies/02.png` measures
 * the same way — their field centre is 30px left of a 2000px window, the same
 * direction, smaller only because the viewport is wider. Fireflies centres in
 * the leftover space too. Forcing true window-centring needs symmetric side
 * columns, which at 1024px would squeeze the right cluster below its content
 * width to buy a fidelity difference that does not exist.
 */

import { HelpCircle, Menu } from 'lucide-react'
import Link from 'next/link'
import type { RefObject } from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { Tooltip } from '@/components/ui/tooltip'
import { GlobalSearch } from '@/features/search/global-search'

import { AvatarMenu } from './avatar-menu'
import { NewMenu } from './new-menu'
import { NotificationsMenu } from './notifications-menu'

function Logo() {
  // Drawn here rather than shipping Fireflies' trademarked mark. Three offset
  // rounded rectangles suggesting a firefly's trail.
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="9" height="7" rx="2.5" className="fill-brand-mark" />
      <rect x="2" y="13" width="6" height="7" rx="2.5" className="fill-accent" />
      <rect x="13" y="9" width="9" height="11" rx="2.5" className="fill-brand-amber" />
    </svg>
  )
}

interface TopbarProps {
  /** Opens the drawer on mobile. */
  onToggleSidebar: () => void
  /** Collapses the rail on desktop. */
  onCollapse: () => void
  toggleRef?: RefObject<HTMLButtonElement | null>
}

export function Topbar({ onToggleSidebar, onCollapse, toggleRef }: TopbarProps) {
  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-topbar grid h-topbar grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-subtle bg-surface-0 px-4"
    >
      <div className="flex items-center gap-3">
        {/*
          One control, two behaviours, because it is the same affordance at
          different widths: below `md` it opens the drawer, above it collapses the
          rail. Two separate buttons would mean one of them is always dead.
        */}
        <IconButton
          ref={toggleRef}
          label="Toggle sidebar"
          icon={<Menu size={20} strokeWidth={1.75} />}
          onClick={() => {
            if (window.matchMedia('(min-width: 768px)').matches) onCollapse()
            else onToggleSidebar()
          }}
          data-testid="sidebar-toggle"
        />

        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Fireflies home">
          <Logo />
          {/* Wordmark drops below 640px — three fixed-width children do not fit a
              393px viewport, and the mark alone is still recognisable. */}
          <span className="hidden text-h3 text-primary sm:inline">Fireflies</span>
        </Link>
      </div>

      <GlobalSearch />

      <div className="flex shrink-0 items-center gap-2">
        <NewMenu />
        <NotificationsMenu />
        <Tooltip content="Help">
          <Link
            href="/help"
            aria-label="Help"
            data-testid="topbar-help"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary sm:flex"
          >
            <HelpCircle size={18} strokeWidth={1.75} />
          </Link>
        </Tooltip>
        <AvatarMenu />
      </div>
    </header>
  )
}
