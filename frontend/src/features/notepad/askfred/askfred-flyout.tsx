'use client'

/**
 * AskFred's chrome (T-37.3).
 *
 * A right-side flyout on desktop and a bottom sheet on phones — the two forms
 * the spec allows. NOT a rail flyout: the icon rail's five items are the
 * canonical Fireflies set (A2.2), and Fred is opened from the header instead.
 */

import { X } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'

import { AskFredPanel } from './askfred-panel'

export function AskFredFlyout({ meetingId, onClose }: { meetingId: number; onClose: () => void }) {
  return (
    <aside
      aria-label="Ask Fred"
      data-testid="askfred-flyout"
      className={
        // Below `md` the notepad body stacks and the rail becomes a bottom
        // bar; a side panel there would be a sliver. Fixed bottom sheet
        // instead, under modals (z-drawer < z-modal) so dialogs still win.
        'fixed inset-x-0 bottom-0 z-drawer flex h-[60vh] flex-col border-t border-subtle bg-surface-0 shadow-lg ' +
        'md:static md:z-auto md:h-auto md:w-flyout md:shrink-0 md:border-l md:border-t-0 md:shadow-none'
      }
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-subtle px-3">
        <h2 className="text-body-strong text-primary">Ask Fred</h2>
        <IconButton
          label="Close panel"
          icon={<X size={16} strokeWidth={2} />}
          onClick={onClose}
          data-testid="askfred-close"
          hideTooltip
        />
      </div>

      <div className="min-h-0 flex-1 p-3">
        <AskFredPanel meetingId={meetingId} />
      </div>
    </aside>
  )
}
