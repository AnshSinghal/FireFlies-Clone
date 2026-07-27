import type { Metadata } from 'next'
import { Suspense } from 'react'

import { SettingsView } from '@/features/placeholders/settings/settings-view'

export const metadata: Metadata = { title: 'Settings' }

export default function Page() {
  return (
    // `useSearchParams` (the active tab) opts the view out of static
    // prerendering unless it sits under Suspense — same rule as the sidebar.
    <Suspense>
      <SettingsView />
    </Suspense>
  )
}
