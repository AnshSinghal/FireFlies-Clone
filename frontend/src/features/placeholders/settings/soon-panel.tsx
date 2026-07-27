'use client'

/**
 * A deferred settings group (T-30.7): representative toggles, visibly
 * disabled, each wearing a `Soon` badge — the same voice as every other
 * placeholder, applied to controls.
 */

import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/chip'
import { Switch } from '@/components/ui/controls'

const SAMPLE_TOGGLES: Record<string, string[]> = {
  recording: ['Auto-record scheduled meetings', 'Save speaker audio separately'],
  notifications: ['Email me each recap', 'Notify on new action items'],
  privacy: ['Meetings default to private', 'Allow sharing by link'],
  'ai-apps': ['Run skills on new meetings', 'Allow custom prompts'],
  billing: ['Annual billing', 'Send invoices to finance'],
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
        Not part of this build. In the real Fireflies this group configures {tab.label.toLowerCase()}
        {' '}for the whole workspace.
      </p>

      <div className="max-w-sm space-y-3">
        {(SAMPLE_TOGGLES[tab.id] ?? []).map((label) => (
          <Switch
            key={label}
            checked={false}
            onCheckedChange={() => undefined}
            disabled
            label={label}
          />
        ))}
      </div>
    </section>
  )
}
