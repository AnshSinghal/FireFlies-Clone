'use client'

/**
 * The create route (T-26.1).
 *
 * A route rather than only a modal state, so `+ New` can deep-link to a tab
 * and an empty state can link somewhere. Closing it returns to the Notebook —
 * the page behind a create dialog is the list the new meeting will join.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { CreateModal, type CreateTab } from '@/features/create/create-modal'

const TABS: CreateTab[] = ['upload', 'paste', 'manual']

function CreatePage() {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(true)

  const requested = params.get('tab')
  const initialTab = TABS.includes(requested as CreateTab) ? (requested as CreateTab) : 'upload'

  return (
    <CreateModal
      open={open}
      initialTab={initialTab}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) router.push('/notebook')
      }}
    />
  )
}

export default function Page() {
  // `useSearchParams` opts the subtree out of prerendering, so the boundary is
  // required — and its fallback is nothing, because the modal is the page.
  return (
    <Suspense fallback={null}>
      <CreatePage />
    </Suspense>
  )
}
