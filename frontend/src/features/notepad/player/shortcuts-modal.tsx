'use client'

/**
 * The `?` shortcuts sheet (T-19.11).
 *
 * Bound to a key that is itself a shortcut, which is circular — so the kebab
 * menu offers it too. A feature only reachable by knowing the thing it exists
 * to teach you is not discoverable.
 */

import { Modal } from '@/components/ui/modal'
import { SHORTCUTS } from '@/lib/player/use-player-shortcuts'

export function ShortcutsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="These work anywhere on this page, except while you are typing."
      size="sm"
      testId="shortcuts-modal"
    >
      <dl className="divide-y divide-subtle">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-body text-secondary">{shortcut.description}</dt>
            <dd>
              <kbd className="rounded-md border border-subtle bg-surface-2 px-2 py-0.5 text-xs text-primary">
                {shortcut.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
