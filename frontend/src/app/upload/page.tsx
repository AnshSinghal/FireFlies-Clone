import { Upload } from 'lucide-react'
import type { Metadata } from 'next'

import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = { title: 'Uploads' }

export default function Page() {
  return (
    <ComingSoon
      title="Uploads"
      description="Upload a transcript to create a meeting."
      icon={Upload}
      detail="You drag in an audio or video file and Fireflies transcribes it, then generates a summary and action items automatically."
    />
  )
}
