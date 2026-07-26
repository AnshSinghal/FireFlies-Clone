'use client'

/**
 * Checkbox, Switch, Radio, Tabs (T-10.16).
 *
 * All four on Radix, all four with a real label element wired to the control.
 * The reason they share a file is that they share one decision: the visual
 * state is driven by `data-state`, which Radix sets identically for pointer
 * and keyboard interaction — so a control can never look focused-but-not-
 * checked because two style sources disagreed.
 */

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as RadioPrimitive from '@radix-ui/react-radio-group'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { Check, Minus } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  disabled?: boolean
  testId?: string
  /** For a checkbox with no visible label — a row selector, say. */
  ariaLabel?: string
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  testId,
  ariaLabel,
}: CheckboxProps) {
  const id = useId()
  const labelId = `${id}-label`

  return (
    <span className="inline-flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        /*
         * `aria-labelledby`, not a bare `<label for>`.
         *
         * Radix renders the control as a `<button role="checkbox">`, and axe
         * reports `button-name` as a CRITICAL violation for a button named only
         * by an external label — browsers and screen readers do not expose that
         * association reliably for buttons the way they do for native inputs.
         * The visible `<label>` stays (it makes the text clickable); the name
         * comes from the explicit reference.
         */
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        data-testid={testId}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-fast',
          'data-[state=unchecked]:border-strong data-[state=unchecked]:bg-surface-0',
          // `indeterminate` shares the checked styling — it means "some", which
          // is closer to on than to off.
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
          'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <CheckboxPrimitive.Indicator className="text-inverse">
          {checked === 'indeterminate' ? (
            <Minus size={12} strokeWidth={3} />
          ) : (
            <Check size={12} strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>

      {label && (
        <label
          id={labelId}
          htmlFor={id}
          className="cursor-pointer select-none text-body text-primary"
        >
          {label}
        </label>
      )}
    </span>
  )
}

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  description?: string
  disabled?: boolean
  testId?: string
  ariaLabel?: string
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  testId,
  ariaLabel,
}: SwitchProps) {
  const id = useId()
  const labelId = `${id}-label`

  return (
    <span className="flex items-start gap-3">
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        // Same reason as Checkbox: Radix renders a `<button role="switch">`.
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        data-testid={testId}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-fast',
          'data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface-0 shadow-sm transition-transform duration-fast data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>

      {label && (
        <span className="min-w-0">
          <label
            id={labelId}
            htmlFor={id}
            className="block cursor-pointer select-none text-body text-primary"
          >
            {label}
          </label>
          {description && <span className="block text-sm text-muted">{description}</span>}
        </span>
      )}
    </span>
  )
}

interface RadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string; description?: string }>
  label: string
  testId?: string
}

export function RadioGroup({ value, onValueChange, options, label, testId }: RadioGroupProps) {
  const groupId = useId()

  return (
    <RadioPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      data-testid={testId}
      className="space-y-2"
    >
      {options.map((option) => {
        const id = `${groupId}-${option.value}`
        return (
          <span key={option.value} className="flex items-start gap-2.5">
            <RadioPrimitive.Item
              id={id}
              value={option.value}
              // Same reason again: `<button role="radio">`.
              aria-labelledby={`${id}-label`}
              data-testid={`radio-${option.value}`}
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-fast',
                'data-[state=unchecked]:border-strong data-[state=unchecked]:bg-surface-0',
                'data-[state=checked]:border-accent data-[state=checked]:bg-surface-0',
              )}
            >
              <RadioPrimitive.Indicator className="block h-2 w-2 rounded-full bg-accent" />
            </RadioPrimitive.Item>
            <span className="min-w-0">
              <label
                htmlFor={id}
                className="block cursor-pointer select-none text-body text-primary"
              >
                {option.label}
              </label>
              {option.description && (
                <span className="block text-sm text-muted">{option.description}</span>
              )}
            </span>
          </span>
        )
      })}
    </RadioPrimitive.Root>
  )
}

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  tabs: ReadonlyArray<{ value: string; label: string; count?: number }>
  children?: ReactNode
  testId?: string
}

export function Tabs({ value, onValueChange, tabs, children, testId }: TabsProps) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} data-testid={testId}>
      {/* The underline is a per-tab border rather than a sliding indicator
          element: one absolutely-positioned bar has to be measured and
          repositioned on every resize, and gets it wrong while fonts load. */}
      <TabsPrimitive.List className="flex items-center gap-1 border-b border-subtle">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            data-testid={`tab-${tab.value}`}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-body-strong transition-colors duration-fast',
              'data-[state=inactive]:border-transparent data-[state=inactive]:text-secondary data-[state=inactive]:hover:text-primary',
              'data-[state=active]:border-accent data-[state=active]:text-accent',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="tnum rounded-full bg-surface-2 px-1.5 text-xs text-secondary">
                {tab.count}
              </span>
            )}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  )
}

export const TabPanel = TabsPrimitive.Content
