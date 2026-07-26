'use client'

/**
 * ConfirmDialog (T-10.11).
 *
 * Two details carry the weight here:
 *
 * The object's name is BOLDED in the body, so the user can see what they are
 * about to destroy rather than trusting that the right row was selected.
 *
 * `Cancel` is autofocused, not `Delete`. On a destructive dialog the default
 * action should be the safe one — Enter or Space arriving from the keystroke
 * that opened the dialog must not delete anything.
 */

import { AlertTriangle } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import { Button } from './button'
import { Modal } from './modal'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Bolded inside the body sentence — what is about to be acted on. */
  objectName?: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  testId?: string
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  objectName,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)

  /*
   * A ref guard IN ADDITION to the `pending` state, because they answer
   * different questions. `pending` disables the button on the next render;
   * `fired` is true synchronously, so two clicks inside one frame — a
   * double-click, or a keyboard repeat — cannot both get through. T10-J
   * asserts exactly one DELETE request.
   */
  const fired = useRef(false)

  /*
   * Focus lands on CANCEL, not Delete. Enter or Space still travelling from the
   * keystroke that opened the dialog must not destroy anything, and a user who
   * hits Escape-then-Enter out of habit should get the safe outcome.
   */
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = async () => {
    if (fired.current) return
    fired.current = true
    setPending(true)

    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setPending(false)
      fired.current = false
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      testId={testId}
      // Not dismissible while the request is in flight: closing now would leave
      // the user unsure whether the delete happened.
      dismissible={!pending}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => void confirm()}
            loading={pending}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {destructive && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-subtle">
            <AlertTriangle size={18} strokeWidth={2} className="text-danger" aria-hidden="true" />
          </span>
        )}
        <p className="text-body text-secondary">
          {objectName && (
            <>
              <span className="text-body-strong text-primary">{objectName}</span>{' '}
            </>
          )}
          {body}
        </p>
      </div>
    </Modal>
  )
}
