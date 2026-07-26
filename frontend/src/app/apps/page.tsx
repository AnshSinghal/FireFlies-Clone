import { LayoutGrid } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = { title: 'AI Apps' }

export default function Page() {
  return (
    <ComingSoon
      title="AI Apps"
      description="Reusable AI skills that run across your meetings."
      icon={LayoutGrid}
      detail="You pick from skills like Sales Call Analysis or Interview Scorecard, or write your own prompt, and it runs on every matching meeting."
    />
  )
}
