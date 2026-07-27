'use client'

/**
 * A row of colour swatches (T-36.6's recolour control).
 *
 * A primitive with zero domain knowledge: it takes CSS colour VALUES — in this
 * app always `var(--ff-…)` references, never hex — and reports the picked
 * index. Radio semantics, because picking a colour is choosing one of a set,
 * and a screen reader should hear "colour 3 of 8, selected" rather than eight
 * anonymous buttons.
 */

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

interface ColorSwatchPickerProps {
  /** CSS colour values, e.g. `var(--ff-speaker-0)`. Index = identity. */
  colors: readonly string[]
  /** The selected index, or null when nothing is explicitly chosen. */
  value: number | null
  onChange: (index: number) => void
  /** Names the group for assistive tech. */
  label: string
  testId?: string
}

export function ColorSwatchPicker({
  colors,
  value,
  onChange,
  label,
  testId,
}: ColorSwatchPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="flex items-center gap-1.5"
    >
      {colors.map((color, index) => {
        const selected = value === index
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} — colour ${index + 1}`}
            data-testid={testId ? `${testId}-${index}` : undefined}
            onClick={() => onChange(index)}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
              selected ? 'scale-110' : 'hover:scale-110',
            )}
            style={{ backgroundColor: color }}
          >
            {selected && (
              <Check size={14} strokeWidth={3} aria-hidden="true" className="text-inverse" />
            )}
          </button>
        )
      })}
    </div>
  )
}
