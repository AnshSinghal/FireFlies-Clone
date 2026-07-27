import { BarChart3 } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'
import { AnalyticsCharts } from '@/features/placeholders/analytics-charts'
import { COMING_SOON_COPY } from '@/lib/coming-soon/copy'

export const metadata: Metadata = { title: 'Analytics' }

export default function Page() {
  return (
    <ComingSoon
      title={COMING_SOON_COPY.analytics.title}
      description={COMING_SOON_COPY.analytics.description}
      icon={BarChart3}
      detail={COMING_SOON_COPY.analytics.detail}
      feature="analytics"
    >
      <AnalyticsCharts />
    </ComingSoon>
  )
}
