import type { Metadata } from 'next'
import { Suspense } from 'react'

import { TagsSettingsView } from '@/features/tags/tags-settings-view'

export const metadata: Metadata = { title: 'Tags' }

export default function Page() {
  return (
    // Suspense for the same reason as /settings: the shared settings nav
    // renders inside a client tree that reads navigation hooks.
    <Suspense>
      <TagsSettingsView />
    </Suspense>
  )
}
