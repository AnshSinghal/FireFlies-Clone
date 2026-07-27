'use client'

/**
 * A deferred settings group (T-30.7): representative toggles, visibly
 * disabled, each wearing a `Soon` badge — the same voice as every other
 * placeholder, applied to controls.
 */

import type { LucideIcon } from 'lucide-react'

import { SettingCard, SettingGroup } from './setting-card'

import { Badge } from '@/components/ui/chip'
import { Switch } from '@/components/ui/controls'

// Toggle copy mirrors the reference settings screens (docs/reference/
// fireflies/07-08.png): auto-record and video capture under Recording &
// Privacy, topic tracker and custom vocabulary under AI settings.
const SAMPLE_TOGGLES: Record<string, string[]> = {
  recording: ['Auto-record meetings', 'Capture meeting video'],
  compliance: ['Email participants before the bot joins', 'Announce recording in-call'],
  'email-assistant': ['Auto-draft replies and follow-ups', 'Label my inbox'],
  'ai-settings': ['Topic tracker keywords', 'Custom vocabulary'],
  'live-meeting': ['Live captions during the call', 'Real-time AskFred'],
  account: ['Two-factor authentication', 'Weekly usage summary'],
}

interface SoonPanelProps {
  tab: { id: string; label: string; icon: LucideIcon }
}

export function SoonPanel({ tab }: SoonPanelProps) {
  const Icon = tab.icon

  return (
    <section className="space-y-4" data-testid={`settings-soon-${tab.id}`}>
      <header className="flex items-center gap-2">
        <Icon size={18} strokeWidth={1.75} className="text-muted" />
        <h2 className="text-h3 text-primary">{tab.label}</h2>
        <Badge variant="neutral">Soon</Badge>
      </header>
      <p className="text-sm text-secondary">
        Not part of this build. In the real Fireflies this group configures{' '}
        {tab.label.toLowerCase()} for the whole workspace.
      </p>

      {/*
        Cards here too, so every Settings tab reads the same. These toggles are
        deliberately inert — the panel says so above — but a disabled control in
        a card still shows the shape the real thing would take, which is the
        point of a placeholder that explains itself (T-30).
      */}
      <SettingGroup title={tab.label}>
        {(SAMPLE_TOGGLES[tab.id] ?? []).map((label) => (
          <SettingCard
            key={label}
            title={label}
            trailing={
              <Switch
                checked={false}
                onCheckedChange={() => undefined}
                disabled
                ariaLabel={label}
              />
            }
          />
        ))}
      </SettingGroup>
    </section>
  )
}
