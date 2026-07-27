'use client'

/**
 * The settings sub-nav, extracted from `SettingsView` for T-36.6.
 *
 * Tags is a REAL route (`/settings/tags`) rather than another `?tab=` panel —
 * it has its own data, its own mutations and its own testids, and PLAN.md
 * specs it at that path. So the nav takes `active` from its caller instead of
 * reading `?tab=` itself: the query param cannot see across routes.
 */

import {
  Bell,
  CreditCard,
  Mail,
  Mic,
  Palette,
  Radio,
  SlidersHorizontal,
  Tag,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/chip'
import { cn } from '@/lib/utils/cn'

export interface SettingsTab {
  id: string
  label: string
  icon: LucideIcon
  /** Real routes carry their own href; `?tab=` panels derive one. */
  href?: string
  soon?: boolean
}

export const APPEARANCE_TAB: SettingsTab = { id: 'appearance', label: 'Appearance', icon: Palette }

// The deferred groups carry the REAL product's names — the reference
// screenshots (docs/reference/fireflies/07-08.png) show Recording & Privacy,
// Compliance Notification, Email Assistant, AI settings, Live meeting and
// Account in this order, and a side-by-side against invented names reads as
// not having looked.
export const SETTINGS_TABS: SettingsTab[] = [
  APPEARANCE_TAB,
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'tags', label: 'Tags', icon: Tag, href: '/settings/tags' },
  { id: 'recording', label: 'Recording & Privacy', icon: Mic, soon: true },
  { id: 'compliance', label: 'Compliance Notification', icon: Bell, soon: true },
  { id: 'email-assistant', label: 'Email Assistant', icon: Mail, soon: true },
  { id: 'ai-settings', label: 'AI settings', icon: Wand2, soon: true },
  { id: 'live-meeting', label: 'Live meeting', icon: Radio, soon: true },
  { id: 'account', label: 'Account', icon: CreditCard, soon: true },
]

export function SettingsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Settings sections" className="md:w-56 md:shrink-0">
      {/*
        `shrink-0` on each item belongs to the MOBILE form of this list — below
        `md` it is a horizontal scroller, where an item that shrinks is an item
        whose label wraps. On the desktop column it made the two longest labels
        overflow the 224px rail, so their `Soon` badges sat past the x where the
        other four aligned and the right edge read as ragged (reference 07
        right-aligns its badge). Hence `md:shrink` and the truncating label.
      */}
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {SETTINGS_TABS.map((tab) => (
          <li key={tab.id} className="shrink-0 md:shrink">
            <Link
              href={tab.href ?? `/settings?tab=${tab.id}`}
              data-testid={`settings-tab-${tab.id}`}
              aria-current={active === tab.id ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-md px-3 text-body transition-colors duration-fast',
                active === tab.id
                  ? 'bg-accent-subtle text-accent-strong'
                  : 'text-secondary hover:bg-surface-hover hover:text-primary',
              )}
            >
              <tab.icon size={16} strokeWidth={1.75} className="shrink-0" />
              {/*
                `md:truncate` rather than a wider rail: it sets the same three
                properties `whitespace-nowrap` does plus the ellipsis, so it
                wins cleanly, and a longer label added later cannot re-break
                the alignment. With `flex-1` the badge lands hard against the
                right edge on every row.
              */}
              <span className="flex-1 whitespace-nowrap md:truncate">{tab.label}</span>
              {tab.soon && <Badge variant="neutral">Soon</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
