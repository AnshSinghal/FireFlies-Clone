'use client'

/**
 * Left rail — STRUCTURAL PLACEHOLDER.
 *
 * T-07 builds the real thing: exact 36px item heights, the CHANNELS section,
 * collapse with persistence, tooltips, and the active-state prefix matching
 * that keeps "Meetings" lit on a detail page. This exists so the shell has the
 * right geometry and something to navigate with.
 */

import { BarChart3, LayoutGrid, Settings, Upload, Video, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Keeps the parent lit on a child route — /meeting/3 lights "Meetings". */
  matchPrefix?: string
  soon?: boolean
}

/*
 * No "Home" item — resolves open decision #4 from T-01.
 *
 * PLAN.md A1 has `/` redirect to `/notebook`, and T-07.5 gives Home exact-match
 * active logic. Both cannot hold: a redirected route can never be the current
 * path, so the item would be permanently inert. Real Fireflies does have a Home
 * dashboard, but building it is out of scope, and a nav item that never
 * highlights reads as a bug rather than as a deferred feature.
 */
const PRIMARY: NavItem[] = [
  { id: 'meetings', label: 'Meetings', href: '/notebook', icon: Video, matchPrefix: '/meeting' },
  { id: 'uploads', label: 'Uploads', href: '/upload', icon: Upload },
  { id: 'apps', label: 'AI Apps', href: '/apps', icon: LayoutGrid, soon: true },
  { id: 'analytics', label: 'Analytics', href: '/analytics', icon: BarChart3, soon: true },
]

const FOOTER: NavItem[] = [{ id: 'settings', label: 'Settings', href: '/settings', icon: Settings }]

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/'
  return (
    pathname.startsWith(item.href) || (!!item.matchPrefix && pathname.startsWith(item.matchPrefix))
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        data-testid={`sidebar-item-${item.id}`}
        className={`mx-2 flex h-9 items-center gap-3 rounded-md px-3 text-body transition-colors duration-fast ${
          active
            ? 'bg-accent-subtle font-semibold text-accent-strong'
            : 'text-secondary hover:bg-surface-hover hover:text-primary'
        }`}
      >
        <Icon size={20} strokeWidth={1.75} className={active ? 'text-accent' : 'text-muted'} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.soon && (
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted">Soon</span>
        )}
      </Link>
    </li>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      data-testid="sidebar"
      // Hidden below 768px, where the rail width is zero — T-07.11 replaces
      // this with an off-canvas drawer. `overflow-hidden` stops labels spilling
      // out of the 64px rail at the tablet breakpoint before T-07 hides them
      // properly.
      className="hidden flex-col overflow-hidden border-r border-subtle bg-surface-0 py-3 md:flex"
    >
      <ul>
        {PRIMARY.map((item) => (
          <NavLink key={item.id} item={item} active={isActive(pathname, item)} />
        ))}
      </ul>

      {/* Pinned to the bottom — Settings floating mid-list is on the ❌ list. */}
      <ul className="mt-auto border-t border-subtle pt-3">
        {FOOTER.map((item) => (
          <NavLink key={item.id} item={item} active={isActive(pathname, item)} />
        ))}
      </ul>
    </nav>
  )
}
