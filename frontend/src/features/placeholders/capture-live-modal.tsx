'use client'

/**
 * Live-bot placeholder (T-30.6).
 *
 * The `+ New` menu offers "Capture live meeting" because the real product's
 * primary entry point is sending the bot to a call — omitting it entirely
 * would misrepresent the product. The modal accepts a link and then says,
 * plainly, that the real-time bot is out of scope; the Send button is hard
 * disabled because unlike `Connect` on /integrations there is nothing further
 * to explain — the explanation is already on screen.
 */

import { Radio } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { COMING_SOON_COPY } from '@/lib/coming-soon/copy'

interface CaptureLiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CaptureLiveModal({ open, onOpenChange }: CaptureLiveModalProps) {
  const [link, setLink] = useState('')

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={COMING_SOON_COPY.liveBot.title}
      description={COMING_SOON_COPY.liveBot.description}
      testId="capture-live-modal"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" disabled data-testid="capture-live-send">
            Send Fireflies
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Meeting link"
          placeholder="https://zoom.us/j/…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          data-testid="capture-live-link-input"
        />
        <p className="flex items-start gap-2 rounded-lg border border-subtle bg-surface-2 px-4 py-3 text-sm text-muted">
          <Radio size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">In the real Fireflies:</span>{' '}
            {COMING_SOON_COPY.liveBot.detail}
          </span>
        </p>
      </div>
    </Modal>
  )
}
