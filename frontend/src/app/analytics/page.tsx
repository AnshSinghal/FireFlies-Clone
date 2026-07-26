import { BarChart3 } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = { title: 'Analytics' }

export default function Page() {
  return (
    <ComingSoon
      title="Analytics"
      description="Conversation intelligence across your team."
      icon={BarChart3}
      detail="Talk-time ratios, question rates, topic trends and sentiment over time, sliced by team member or account."
    />
  )
}
