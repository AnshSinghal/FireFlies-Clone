/**
 * AI Apps placeholder (T-30.2).
 *
 * Six disabled skill cards instead of an empty page: the surface shows what
 * the feature IS, which is the whole point of a deliberate placeholder.
 * Static content, so this stays a server component.
 */

import {
  BadgeDollarSign,
  ClipboardCheck,
  LayoutGrid,
  Mail,
  NotebookPen,
  Radar,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/chip'
import { ComingSoon } from '@/components/ui/coming-soon'
import { APP_SKILLS, COMING_SOON_COPY } from '@/lib/coming-soon/copy'

export const metadata: Metadata = { title: 'AI Apps' }

const SKILL_ICONS: Record<(typeof APP_SKILLS)[number]['id'], LucideIcon> = {
  'sales-call-analysis': BadgeDollarSign,
  'interview-scorecard': ClipboardCheck,
  'meeting-prep-brief': NotebookPen,
  'topic-tracker': Radar,
  'daily-digest': Mail,
  'custom-skill': Wand2,
}

export default function Page() {
  return (
    <ComingSoon
      title={COMING_SOON_COPY.apps.title}
      description={COMING_SOON_COPY.apps.description}
      icon={LayoutGrid}
      detail={COMING_SOON_COPY.apps.detail}
      feature="apps"
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="apps-skill-grid">
        {APP_SKILLS.map((skill) => {
          const Icon = SKILL_ICONS[skill.id]
          return (
            <li
              key={skill.id}
              data-testid={`apps-skill-${skill.id}`}
              // Visibly disabled: muted content plus the badge, not opacity
              // tricks that read as a rendering bug.
              className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface-0 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2">
                  <Icon size={18} strokeWidth={1.75} className="text-muted" />
                </span>
                <Badge variant="neutral" testId={`apps-skill-${skill.id}-soon`}>
                  Soon
                </Badge>
              </div>
              <p className="text-body-strong text-primary">{skill.name}</p>
              <p className="text-sm text-secondary">{skill.description}</p>
            </li>
          )
        })}
      </ul>
    </ComingSoon>
  )
}
