'use client'

/**
 * Settings shell (T-30.7).
 *
 * A left sub-nav mirroring Fireflies' settings groups, with TWO genuinely
 * functional tabs — Appearance and Preferences — and the rest visibly
 * deferred. Two working tabs is what separates "placeholder" from
 * "unfinished".
 *
 * The active tab lives in `?tab=`, not component state: every view in this
 * app is shareable by copying the URL, and Back must undo a tab change the
 * same way it undoes a filter change. Plain links, so the browser does the
 * history work.
 */

import {
  Bell,
  CreditCard,
  Mail,
  Mic,
  Palette,
  Radio,
  SlidersHorizontal,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Badge } from '@/components/ui/chip'
import { cn } from '@/lib/utils/cn'

import { AppearancePanel } from './appearance-panel'
import { PreferencesPanel } from './preferences-panel'
import { SoonPanel } from './soon-panel'

interface SettingsTab {
  id: string
  label: string
  icon: LucideIcon
  soon?: boolean
}

const APPEARANCE_TAB: SettingsTab = { id: 'appearance', label: 'Appearance', icon: Palette }

// The deferred groups carry the REAL product's names — the reference
// screenshots (docs/reference/fireflies/07-08.png) show Recording & Privacy,
// Compliance Notification, Email Assistant, AI settings, Live meeting and
// Account in this order, and a side-by-side against invented names reads as
// not having looked.
const TABS: SettingsTab[] = [
  APPEARANCE_TAB,
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'recording', label: 'Recording & Privacy', icon: Mic, soon: true },
  { id: 'compliance', label: 'Compliance Notification', icon: Bell, soon: true },
  { id: 'email-assistant', label: 'Email Assistant', icon: Mail, soon: true },
  { id: 'ai-settings', label: 'AI settings', icon: Wand2, soon: true },
  { id: 'live-meeting', label: 'Live meeting', icon: Radio, soon: true },
  { id: 'account', label: 'Account', icon: CreditCard, soon: true },
]

export function SettingsView() {
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  // An unknown ?tab= falls back to the first tab rather than a blank panel.
  const activeTab = TABS.find((tab) => tab.id === requested) ?? APPEARANCE_TAB
  const active = activeTab.id

  return (
    <div className="flex flex-col gap-6 py-6 md:flex-row" data-testid="settings-view">
      <nav aria-label="Settings sections" className="md:w-56 md:shrink-0">
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {TABS.map((tab) => (
            <li key={tab.id} className="shrink-0">
              <Link
                href={`/settings?tab=${tab.id}`}
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
                <span className="flex-1 whitespace-nowrap">{tab.label}</span>
                {tab.soon && <Badge variant="neutral">Soon</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {active === 'appearance' && <AppearancePanel />}
        {active === 'preferences' && <PreferencesPanel />}
        {activeTab.soon && <SoonPanel tab={activeTab} />}
      </div>
    </div>
  )
}
