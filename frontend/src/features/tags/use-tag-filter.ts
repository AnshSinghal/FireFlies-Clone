'use client'

/**
 * Clicking a tag chip ANYWHERE filters the notebook by it (T-36.5).
 *
 * On the notebook itself the tag is UNIONED into the current URL state — the
 * user is narrowing the view they already built, and clobbering their other
 * filters would be rude. Anywhere else (the notepad header) it navigates to a
 * fresh notebook filtered to just that tag, which is what "show me everything
 * tagged #sales" means from outside the list.
 */

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { useNotebookParams } from '@/lib/hooks/use-query-params'

export function useTagFilter() {
  const pathname = usePathname()
  const router = useRouter()
  const { filters, setFilter } = useNotebookParams()

  return useCallback(
    (name: string) => {
      if (pathname.startsWith('/notebook')) {
        if (!filters.tags.includes(name)) setFilter({ tags: [...filters.tags, name] })
        return
      }
      router.push(`/notebook?tags=${encodeURIComponent(name)}`)
    },
    [pathname, router, filters.tags, setFilter],
  )
}
