import { Settings } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = { title: 'Settings' }

export default function Page() {
  return (
    <ComingSoon
      title="Settings"
      description="Recording, privacy, AI and account preferences."
      icon={Settings}
      detail="Auto-record rules, meeting language, retention policy, integrations and team permissions."
    />
  )
}
