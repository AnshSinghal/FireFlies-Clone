import { Blocks } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'
import { IntegrationsGrid } from '@/features/placeholders/integrations-grid'
import { COMING_SOON_COPY } from '@/lib/coming-soon/copy'

export const metadata: Metadata = { title: 'Integrations' }

export default function Page() {
  return (
    <ComingSoon
      title={COMING_SOON_COPY.integrations.title}
      description={COMING_SOON_COPY.integrations.description}
      icon={Blocks}
      detail={COMING_SOON_COPY.integrations.detail}
      feature="integrations"
    >
      <IntegrationsGrid />
    </ComingSoon>
  )
}
