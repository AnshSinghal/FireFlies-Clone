'use client'

/**
 * DatePicker (T-10.4) — a range picker with preset shortcuts.
 *
 * The presets are the point. Nobody filtering a meetings library wants to
 * navigate a calendar to pick "the last 7 days"; they want the phrase. The
 * calendar exists for the case the presets do not cover, which is why `Custom
 * range` is the only entry that reveals it.
 *
 * No date library: the arithmetic here is start-of-day, add-days and
 * end-of-month, all of which `Date` does correctly. Pulling in date-fns for
 * three operations is weight this build does not need.
 */

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils/cn'
import { LOCALE } from '@/lib/utils/format'

import { Button } from './button'
import { Popover } from './popover'

export interface DateRange {
  /** Inclusive, at 00:00 local. */
  from: Date
  /** Inclusive, at 23:59:59.999 local. */
  to: Date
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export interface DatePreset {
  label: string
  /** `null` means "let the user pick" — the only entry that reveals the calendar. */
  range: (now: Date) => DateRange | null
}

/**
 * `now` is a parameter, never `new Date()` inside. Same reason the formatters
 * take one: a preset that reads the clock cannot be tested against a fixed day.
 */
export const DATE_PRESETS: readonly DatePreset[] = [
  { label: 'Today', range: (now) => ({ from: startOfDay(now), to: endOfDay(now) }) },
  {
    label: 'Yesterday',
    range: (now) => ({ from: startOfDay(addDays(now, -1)), to: endOfDay(addDays(now, -1)) }),
  },
  {
    label: 'Last 7 days',
    // Six days back plus today makes seven. Off-by-one here is the classic
    // date-range bug and it is invisible in the UI.
    range: (now) => ({ from: startOfDay(addDays(now, -6)), to: endOfDay(now) }),
  },
  {
    label: 'Last 30 days',
    range: (now) => ({ from: startOfDay(addDays(now, -29)), to: endOfDay(now) }),
  },
  {
    label: 'This month',
    range: (now) => ({
      from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: endOfDay(now),
    }),
  },
  { label: 'Custom range', range: () => null },
]

export function formatRange(range: DateRange | null): string {
  if (!range) return 'Any time'
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const from = range.from.toLocaleDateString(LOCALE, options)
  const to = range.to.toLocaleDateString(LOCALE, options)
  return from === to ? from : `${from} – ${to}`
}

interface DatePickerProps {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
  /** Injectable so tests and the seeded anchor agree on what "Today" means. */
  now?: Date
  testId?: string
}

export function DatePicker({ value, onChange, now = new Date(), testId }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [pendingFrom, setPendingFrom] = useState<Date | null>(null)

  const pick = (preset: DatePreset) => {
    const range = preset.range(now)
    if (range === null) {
      setShowCalendar(true)
      return
    }
    onChange(range)
    setOpen(false)
  }

  const pickDay = (day: Date) => {
    if (!pendingFrom) {
      setPendingFrom(day)
      return
    }
    // Clicking an earlier second date means the user changed their mind about
    // the start, not that they want an inverted range.
    const [from, to] = day < pendingFrom ? [day, pendingFrom] : [pendingFrom, day]
    onChange({ from: startOfDay(from), to: endOfDay(to) })
    setPendingFrom(null)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setShowCalendar(false)
          setPendingFrom(null)
        }
      }}
      label="Choose a date range"
      align="start"
      testId={testId}
      className="w-auto p-0"
      trigger={
        <Button variant="secondary" leftIcon={<CalendarDays size={16} strokeWidth={1.75} />}>
          {formatRange(value)}
        </Button>
      }
    >
      <div className="flex">
        <ul className="w-40 shrink-0 border-r border-subtle py-1">
          {DATE_PRESETS.map((preset) => (
            <li key={preset.label}>
              <button
                type="button"
                onClick={() => pick(preset)}
                data-testid={`date-preset-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
                className="w-full px-3 py-1.5 text-left text-body text-primary transition-colors duration-fast hover:bg-surface-hover"
              >
                {preset.label}
              </button>
            </li>
          ))}
          {value && (
            <li className="border-t border-subtle pt-1">
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                data-testid="date-preset-clear"
                className="w-full px-3 py-1.5 text-left text-body text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
              >
                Any time
              </button>
            </li>
          )}
        </ul>

        {showCalendar && (
          <Calendar
            month={month}
            onMonthChange={setMonth}
            selected={value}
            pendingFrom={pendingFrom}
            onPickDay={pickDay}
          />
        )}
      </div>
    </Popover>
  )
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function Calendar({
  month,
  onMonthChange,
  selected,
  pendingFrom,
  onPickDay,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  selected: DateRange | null
  pendingFrom: Date | null
  onPickDay: (day: Date) => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()

  const first = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  // Monday-first: getDay() is Sunday-first, so Sunday (0) becomes 6.
  const leading = (first.getDay() + 6) % 7

  const cells: Array<Date | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ]

  const isSelected = (day: Date) =>
    selected ? day >= startOfDay(selected.from) && day <= selected.to : false

  return (
    <div className="w-64 p-3" data-testid="date-calendar">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          className="rounded-md p-1 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-body-strong text-primary">
          {month.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          className="rounded-md p-1 text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1 text-center text-xs text-muted">
            {day}
          </span>
        ))}

        {cells.map((day, i) =>
          day === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPickDay(day)}
              aria-pressed={isSelected(day)}
              className={cn(
                'tnum rounded-sm py-1 text-center text-sm transition-colors duration-fast',
                isSelected(day) || pendingFrom?.getTime() === day.getTime()
                  ? 'bg-accent text-inverse'
                  : 'text-primary hover:bg-surface-hover',
              )}
            >
              {day.getDate()}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
