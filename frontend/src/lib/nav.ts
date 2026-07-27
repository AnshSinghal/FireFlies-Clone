/**
 * Navigation model (T-07.1).
 *
 * Data, not markup. The rail renders by mapping over these, so adding an item
 * is one object rather than a hand-written block that drifts from its
 * neighbours in padding, icon size or active handling — which is exactly how
 * nine sidebar items end up with four different hover behaviours.
 */

import {
  BarChart3,
  Blocks,
  CircleHelp,
  Globe,
  Hash,
  LayoutGrid,
  Lock,
  Settings,
  Upload,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /**
   * Keeps a parent lit on a child route — `/meeting/3` lights "Meetings".
   * Without it a detail page orphans the nav and the app looks lost.
   */
  matchPrefix?: string
  /**
   * A route that exists but is not built (T-30). Still navigable: an item that
   * refuses to respond reads as broken, and an evaluator WILL click it.
   */
  soon?: boolean
}

/*
 * "Home" is deliberately absent — see ADR (open decision #4). PLAN.md A1 has
 * `/` redirect to the Notebook while T-07.5 gives Home exact-match active
 * logic; both cannot hold, because a redirected route is never the current
 * path. Rather than ship a permanently inert item, the redirect is documented
 * and the item removed.
 */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'meetings', label: 'Meetings', href: '/notebook', icon: Video, matchPrefix: '/meeting' },
  { id: 'uploads', label: 'Uploads', href: '/upload', icon: Upload },
  { id: 'apps', label: 'AI Apps', href: '/apps', icon: LayoutGrid, soon: true },
  { id: 'analytics', label: 'Analytics', href: '/analytics', icon: BarChart3, soon: true },
  { id: 'integrations', label: 'Integrations', href: '/integrations', icon: Blocks, soon: true },
  { id: 'team', label: 'Team', href: '/team', icon: Users, soon: true },
]

/** Built-in views. Filters over the same data, not stored channels. */
export const BUILT_IN_CHANNELS: NavItem[] = [
  { id: 'my-meetings', label: 'My Meetings', href: '/notebook?channel=my-meetings', icon: Users },
  {
    id: 'all-meetings',
    label: 'All Meetings',
    href: '/notebook?channel=all-meetings',
    icon: Globe,
  },
]

export const FOOTER_NAV: NavItem[] = [
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
  { id: 'help', label: 'Help & Support', href: '/help', icon: CircleHelp, soon: true },
]

export const CHANNEL_ICONS = { public: Hash, private: Lock } as const

/**
 * Whether an item is the current page (T-07.5).
 *
 * Prefix matching everywhere except `/`, so `/settings/recording` keeps
 * Settings lit and `/meeting/3` keeps Meetings lit. A query string is ignored —
 * `/notebook?channel=x` is still the Notebook.
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const href = item.href.split('?')[0] ?? item.href
  if (href === '/') return pathname === '/'
  return (
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (item.matchPrefix !== undefined && pathname.startsWith(item.matchPrefix))
  )
}

/**
 * Built-in channel views share `/notebook`, so the path alone cannot
 * distinguish them — the `?channel=` value does.
 */
export function isChannelActive(
  pathname: string,
  activeChannel: string | null,
  slug: string,
): boolean {
  return pathname.startsWith('/notebook') && activeChannel === slug
}
