'use client'

/**
 * Select (T-10.4), on Radix Select.
 *
 * A native `<select>` renders with the OS's own chrome — a different font, a
 * different height, a different focus ring — and sitting next to a custom
 * `Input` it looks unfinished. That is the entire reason this is custom, so the
 * trigger deliberately reuses `Input`'s exact height, radius and border states.
 */

import * as Primitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useId } from 'react'

import { cn } from '@/lib/utils/cn'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<SelectOption>
  /** Required — an unlabelled select is a mystery box. Visually hidden if `hideLabel`. */
  label: string
  hideLabel?: boolean
  placeholder?: string
  disabled?: boolean
  testId?: string
  className?: string
}

export function Select({
  value,
  onValueChange,
  options,
  label,
  hideLabel,
  placeholder = 'Select…',
  disabled,
  testId,
  className,
}: SelectProps) {
  const labelId = useId()

  return (
    <span className={cn('inline-flex flex-col gap-1.5', className)}>
      {!hideLabel && (
        <span id={labelId} className="text-body-strong text-primary">
          {label}
        </span>
      )}

      <Primitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <Primitive.Trigger
          /*
           * The trigger is a `<button role="combobox">`, so it needs a name of
           * its own — axe reports `button-name` as CRITICAL otherwise. A
           * visible label sitting beside it is not enough; the reference has to
           * be explicit.
           */
          aria-labelledby={hideLabel ? undefined : labelId}
          aria-label={hideLabel ? label : undefined}
          data-testid={testId}
          // Matches Input exactly: h-input, same border states, same radius.
          className={cn(
            'inline-flex h-input items-center justify-between gap-2 rounded-md border border-subtle bg-surface-0 px-3 text-body text-primary transition-colors duration-fast',
            'hover:border-strong focus:border-accent focus:shadow-focus focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
            'data-[placeholder]:text-muted',
          )}
        >
          <Primitive.Value placeholder={placeholder} />
          <Primitive.Icon>
            <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
          </Primitive.Icon>
        </Primitive.Trigger>

        <Primitive.Portal>
          <Primitive.Content
            // `popper` rather than the default `item-aligned`: item-aligned
            // positions the panel over the trigger, which on a filter bar means
            // the control you just used disappears under its own menu.
            position="popper"
            sideOffset={6}
            className="z-popover min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-subtle bg-surface-0 py-1 shadow-lg"
          >
            <Primitive.Viewport className="max-h-64">
              {options.map((option) => (
                <Primitive.Item
                  key={option.value}
                  value={option.value}
                  data-testid={`select-option-${option.value}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-primary outline-none transition-colors duration-fast',
                    'data-[highlighted]:bg-surface-hover',
                  )}
                >
                  {/* Fixed-width slot so the labels line up whether or not a
                      row is the selected one. */}
                  <span className="flex w-4 shrink-0 justify-center">
                    <Primitive.ItemIndicator>
                      <Check size={14} strokeWidth={2.5} className="text-accent" />
                    </Primitive.ItemIndicator>
                  </span>
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </span>
  )
}
