'use client'

/**
 * Toast harness — a DEV surface, like /dev/tokens.
 *
 * The auto-dismiss timing, the hover pause, the three-visible cap and the
 * dedup counter are behaviours of the toast system itself, not of any feature
 * that happens to raise one. Testing them through a real mutation would make
 * every assertion depend on the API's timing as well as the toast's, and would
 * leave whole variants (`warning`, `loading`) with no trigger at all.
 *
 * Not linked from the app's navigation.
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { useToast } from '@/components/ui/toast'
import { TOAST_MESSAGES } from '@/lib/toast/messages'
import type { ToastVariant } from '@/lib/toast/store'

const VARIANTS: ToastVariant[] = ['success', 'error', 'info', 'warning', 'loading']

/** Thin wrapper so each trigger only names itself and its handler. */
function Fire({
  children,
  onClick,
  testId,
}: {
  children: string
  onClick: () => void
  testId: string
}) {
  return (
    <Button variant="secondary" onClick={onClick} data-testid={testId}>
      {children}
    </Button>
  )
}

export default function ToastHarnessPage() {
  const toast = useToast()
  const [failNext, setFailNext] = useState(false)

  return (
    <div className="space-y-8 p-8" data-testid="toast-harness">
      <header className="space-y-1">
        <h1 className="text-display text-primary">Toast harness</h1>
        <p className="text-body text-secondary">
          Dev-only. Drives the toast system directly so its timing can be tested without a mutation.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-h3 text-primary">Variants</h2>
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map((variant) => (
            <Fire
              key={variant}
              testId={`fire-${variant}`}
              onClick={() => toast[variant](`This is a ${variant} toast`)}
            >
              {variant}
            </Fire>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h3 text-primary">Behaviour</h2>
        <div className="flex flex-wrap gap-2">
          <Fire
            testId="fire-five"
            onClick={() => {
              // Five DISTINCT messages — identical ones would dedupe into a
              // single ×5 toast and prove the wrong thing.
              for (let i = 1; i <= 5; i++) toast.info(`Toast number ${i}`)
            }}
          >
            Fire 5 distinct
          </Fire>

          <Fire
            testId="fire-duplicate"
            onClick={() => {
              toast.success(TOAST_MESSAGES.changesSaved)
              toast.success(TOAST_MESSAGES.changesSaved)
            }}
          >
            Fire 2 identical
          </Fire>

          <Fire
            testId="fire-with-action"
            onClick={() =>
              toast.success({
                message: TOAST_MESSAGES.meetingDeleted,
                action: {
                  label: 'Undo',
                  onClick: () => toast.info(TOAST_MESSAGES.meetingRestored),
                },
              })
            }
          >
            With an action
          </Fire>

          <Fire
            testId="fire-delayed"
            onClick={() => {
              // Delayed so focus can be moved elsewhere first — the point of
              // T09-I is that an arriving toast does not steal it.
              setTimeout(() => toast.success('Arrived while you were typing'), 1500)
            }}
          >
            Fire in 1.5s
          </Fire>

          <Fire
            testId="fire-promise"
            onClick={() => {
              const work = new Promise<string>((resolve, reject) =>
                setTimeout(() => (failNext ? reject(new Error('nope')) : resolve('done')), 600),
              )
              void toast
                .promise(work, {
                  loading: 'Saving…',
                  success: TOAST_MESSAGES.changesSaved,
                  error: TOAST_MESSAGES.saveFailed,
                })
                // The promise is rethrown on failure by design; swallowing it
                // here keeps the harness from logging an unhandled rejection.
                .catch(() => {})
            }}
          >
            Promise toast
          </Fire>

          <Checkbox
            checked={failNext}
            onCheckedChange={setFailNext}
            label="make the promise fail"
            testId="promise-should-fail"
          />
        </div>
      </section>
    </div>
  )
}
