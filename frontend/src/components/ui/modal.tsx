'use client'

/**
 * Modal (T-10.10), on Radix Dialog.
 *
 * Radix is here for the parts that are genuinely hard and invisible when
 * wrong: the focus trap, restoring focus to the trigger on close, `inert` on
 * the rest of the page, and scroll-lock that compensates for the scrollbar's
 * width so the page does not jump sideways when the modal opens.
 *
 * Hand-rolling those is a day of work and a permanent source of bugs.
 */

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode, type RefObject } from 'react'

import { cn } from '@/lib/utils/cn'

export type ModalSize = 'sm' | 'md' | 'lg'

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-modal-sm',
  md: 'max-w-modal-md',
  lg: 'max-w-modal-lg',
}

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Read out with the title. Omit and the dialog is described by its body alone. */
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  /**
   * Blocks Escape and backdrop dismissal — for a form with unsaved changes,
   * where losing the work to a stray keystroke is the worse failure.
   */
  dismissible?: boolean
  testId?: string
  /**
   * Where focus lands on open. Without it Radix focuses the first tabbable
   * node, which is the close button — harmless, but on a destructive dialog
   * "harmless by accident" is not good enough (see ConfirmDialog).
   */
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  testId = 'modal',
  initialFocusRef,
}: ModalProps) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault()
  }

  /*
   * Where focus goes when the dialog closes (T10-C).
   *
   * Radix restores focus by itself when the dialog is opened through
   * `Dialog.Trigger`. This Modal is CONTROLLED — callers render their own
   * button and flip `open` — so there is no trigger for Radix to remember, and
   * closing dumped focus on `<body>`. A keyboard user who opened a dialog and
   * pressed Escape ended up back at the top of the document.
   *
   * `onOpenAutoFocus` fires BEFORE Radix moves focus into the dialog, so
   * `document.activeElement` is still whatever opened it. That is the one
   * moment the trigger can be captured without the caller passing a ref.
   */
  const restoreRef = useRef<HTMLElement | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="modal-overlay"
          className="fixed inset-0 z-modal bg-scrim backdrop-blur-[2px]"
        />

        <Dialog.Content
          data-testid={testId}
          onOpenAutoFocus={(event) => {
            /*
             * When the opener is a DROPDOWN ITEM (a row kebab's "Delete…"),
             * the item unmounts with its menu while the dialog is open, so it
             * can never take focus back — closing dumped a keyboard user on
             * <body>. The menu names its trigger via `aria-labelledby` (Radix
             * wires the id pair), and that trigger — the kebab the user
             * started at — is the right place to land on close.
             */
            const active = document.activeElement as HTMLElement | null
            const menu = active?.closest('[role="menu"]')
            const triggerId = menu?.getAttribute('aria-labelledby')
            restoreRef.current = (triggerId ? document.getElementById(triggerId) : null) ?? active
            if (!initialFocusRef?.current) return
            event.preventDefault()
            initialFocusRef.current.focus()
          }}
          onCloseAutoFocus={(event) => {
            // `isConnected` because the trigger may have unmounted while the
            // dialog was open — a row's kebab button after the row was deleted.
            // Focusing a detached node silently does nothing and leaves focus
            // on body, so in that case Radix's own fallback is the better answer.
            if (!restoreRef.current?.isConnected) return
            event.preventDefault()
            restoreRef.current.focus()
          }}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            'fixed left-1/2 top-1/2 z-modal w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'ff-modal-enter max-h-[calc(100vh-4rem)] overflow-y-auto rounded-lg border border-subtle bg-surface-0 shadow-lg',
            SIZE[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
            <div className="min-w-0 space-y-1">
              <Dialog.Title className="text-h2 text-primary">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-body text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>

            {dismissible && (
              <Dialog.Close
                data-testid="modal-close"
                aria-label="Close dialog"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
              >
                <X size={18} strokeWidth={2} />
              </Dialog.Close>
            )}
          </div>

          <div className="px-5 py-3">{children}</div>

          {/* Actions right-aligned with the primary rightmost — the last thing
              before the edge is the thing the user is most likely to want. */}
          {footer && (
            <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
