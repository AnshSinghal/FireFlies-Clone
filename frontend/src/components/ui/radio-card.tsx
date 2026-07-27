'use client'

/**
 * RadioCardGroup — a pick-one group rendered as bordered cards (T-34.2).
 *
 * Exists BESIDE `RadioGroup` (controls.tsx) rather than replacing it: that one
 * is a plain dot-and-label list and hardcodes its per-item testids as
 * `radio-<value>`, while a card group carries an icon, a one-line description,
 * and caller-named testids — `export-format-pdf` is specced by PLAN.md
 * (T-34.12), not derivable from the value alone. Same Radix parts underneath,
 * so arrow-key roving and `aria-checked` behave identically.
 */

import * as RadioPrimitive from '@radix-ui/react-radio-group'
import { Check } from 'lucide-react'
import { useId, type ReactNode, type RefObject } from 'react'

import { cn } from '@/lib/utils/cn'

export interface RadioCardOption<V extends string = string> {
  value: V
  label: string
  /** One line under the label — what picking this actually gets you. */
  description: string
  icon?: ReactNode
}

interface RadioCardGroupProps<V extends string> {
  value: V
  onValueChange: (value: V) => void
  options: ReadonlyArray<RadioCardOption<V>>
  /** Accessible name for the group. */
  label: string
  /** Per-item testid: `${testIdPrefix}-${value}`. */
  testIdPrefix: string
  /**
   * Attached to the CHECKED card, so a modal's `initialFocusRef` can land
   * focus on the current choice — with Radix's roving tabindex that is the
   * only tabbable item in the group anyway.
   */
  focusRef?: RefObject<HTMLButtonElement | null>
}

export function RadioCardGroup<V extends string>({
  value,
  onValueChange,
  options,
  label,
  testIdPrefix,
  focusRef,
}: RadioCardGroupProps<V>) {
  const groupId = useId()

  return (
    <RadioPrimitive.Root
      value={value}
      // Radix hands back a plain string; the options array is the source of
      // truth for what values exist, so the narrowing is safe by construction.
      onValueChange={(next) => onValueChange(next as V)}
      aria-label={label}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {options.map((option) => {
        const labelId = `${groupId}-${option.value}-label`
        const descriptionId = `${groupId}-${option.value}-desc`

        return (
          <RadioPrimitive.Item
            key={option.value}
            value={option.value}
            ref={option.value === value ? focusRef : undefined}
            /*
             * `aria-labelledby` pointing INTO the button, same decision as
             * Checkbox in controls.tsx: Radix renders `<button role="radio">`,
             * and axe reports `button-name` as critical when a button's only
             * name lives in an external label.
             */
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            data-testid={`${testIdPrefix}-${option.value}`}
            className={cn(
              'group relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'data-[state=unchecked]:border-subtle data-[state=unchecked]:bg-surface-0 data-[state=unchecked]:hover:border-strong',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
            )}
          >
            {option.icon && (
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-muted transition-colors duration-fast group-data-[state=checked]:text-accent"
              >
                {option.icon}
              </span>
            )}

            {/* `pr-5` keeps the label clear of the check indicator's corner. */}
            <span className="min-w-0 pr-5">
              <span id={labelId} className="block text-body-strong text-primary">
                {option.label}
              </span>
              <span id={descriptionId} className="block text-sm text-muted">
                {option.description}
              </span>
            </span>

            <RadioPrimitive.Indicator className="absolute right-2.5 top-2.5 text-accent">
              <Check size={14} strokeWidth={2.5} />
            </RadioPrimitive.Indicator>
          </RadioPrimitive.Item>
        )
      })}
    </RadioPrimitive.Root>
  )
}
