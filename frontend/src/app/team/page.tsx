import { Users } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'
import { TeamTable } from '@/features/placeholders/team-table'
import { COMING_SOON_COPY } from '@/lib/coming-soon/copy'

export const metadata: Metadata = { title: 'Team' }

export default function Page() {
  return (
    <ComingSoon
      title={COMING_SOON_COPY.team.title}
      description={COMING_SOON_COPY.team.description}
      icon={Users}
      detail={COMING_SOON_COPY.team.detail}
      feature="team"
    >
      <TeamTable />
    </ComingSoon>
  )
}
