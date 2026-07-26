import { CircleHelp } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = { title: 'Help & Support' }

export default function Page() {
  return (
    <ComingSoon
      title="Help & Support"
      description="Documentation and support."
      icon={CircleHelp}
      detail="Searchable docs, keyboard shortcuts and a support channel."
    />
  )
}
