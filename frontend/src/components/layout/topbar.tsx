'use client'

/**
 * Topbar — STRUCTURAL PLACEHOLDER for search and the menus.
 *
 * T-08 builds the real thing: the global search dropdown, the `+ New` menu,
 * notifications and the avatar menu. What lives here now is the sidebar toggle
 * (T-07.6), the logo and the current user.
 */

import { Menu, Search } from 'lucide-react'
import Link from 'next/link'
import type { RefObject } from 'react'

import { useCurrentUser } from '@/lib/api/me'
import { useCommandPalette } from '@/lib/hooks/use-command-palette'

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
  const { data: user } = useCurrentUser()
  const { open } = useCommandPalette()

  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-topbar flex h-topbar items-center gap-3 border-b border-subtle bg-surface-0 px-4"
    >
      {/*
        One control, two behaviours, because it is the same affordance at
        different widths: below `md` it opens the drawer, above it collapses the
        rail. Two separate buttons would mean one of them is always dead.
      */}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => {
          if (window.matchMedia('(min-width: 768px)').matches) onCollapse()
          else onToggleSidebar()
        }}
        aria-label="Toggle sidebar"
        data-testid="sidebar-toggle"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>

      <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Fireflies home">
        <Logo />
        {/* Wordmark drops below 640px — three fixed-width children do not fit a
            393px viewport, and the mark alone is still recognisable. */}
        <span className="hidden text-h3 text-primary sm:inline">Fireflies</span>
      </Link>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={open}
          data-testid="topbar-search"
          aria-label="Search meetings"
          className="flex h-9 w-full max-w-search items-center gap-2 rounded-md bg-surface-2 px-3 text-left text-body text-muted transition-colors duration-fast hover:bg-surface-hover"
        >
          <Search size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search meetings, transcripts, and more…</span>
          <kbd className="hidden shrink-0 rounded-sm border border-subtle bg-surface-0 px-1.5 py-0.5 text-xs text-muted lg:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {user && (
          <span
            className="flex h-avatar-md w-avatar-md items-center justify-center overflow-hidden rounded-full bg-surface-2"
            data-testid="topbar-avatar"
            title={user.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a static
                local SVG; next/image's optimisation pass does nothing for
                vector art and delays first paint. */}
            <img src={user.avatar_url ?? ''} alt={user.name} width={32} height={32} />
          </span>
        )}
      </div>
    </header>
  )
}
