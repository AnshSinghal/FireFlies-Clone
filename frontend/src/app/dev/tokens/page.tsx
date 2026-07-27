'use client'

/**
 * Token specimen sheet (T-02.11).
 *
 * Renders every token as a swatch or specimen with its resolved value and, for
 * text pairings, its live contrast ratio. This is the visual-regression
 * baseline and the fastest way to catch a wrong value — a bad hex shows up here
 * in two seconds instead of twenty minutes into building a feature.
 *
 * Dev-only: `notFound()` in production keeps it out of the shipped app.
 */

import { notFound } from 'next/navigation'

import { DEV_SURFACES_ENABLED } from '@/lib/dev-surfaces'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SPEAKER_COLOR_COUNT } from '@/lib/utils/speaker-color'

// ── Token inventory ─────────────────────────────────────────────────────────

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: 'Accent',
    tokens: [
      '--ff-accent',
      '--ff-accent-hover',
      '--ff-accent-pressed',
      '--ff-accent-strong',
      '--ff-accent-subtle',
      '--ff-accent-border',
    ],
  },
  { title: 'Brand', tokens: ['--ff-brand-mark', '--ff-brand-amber'] },
  {
    title: 'Surfaces',
    tokens: ['--ff-surface-0', '--ff-surface-1', '--ff-surface-2', '--ff-surface-hover'],
  },
  { title: 'Borders', tokens: ['--ff-border-subtle', '--ff-border-strong'] },
  {
    title: 'Text',
    tokens: ['--ff-text-primary', '--ff-text-secondary', '--ff-text-muted', '--ff-text-inverse'],
  },
  {
    title: 'Status',
    tokens: [
      '--ff-success',
      '--ff-success-subtle',
      '--ff-success-strong',
      '--ff-warning',
      '--ff-warning-subtle',
      '--ff-danger',
      '--ff-danger-subtle',
    ],
  },
  { title: 'Highlight', tokens: ['--ff-highlight', '--ff-highlight-active'] },
]

const TYPE_SPECIMENS = [
  { cls: 'text-display', label: 'display', note: '28/36/700 · page H1' },
  { cls: 'text-h2', label: 'h2', note: '20/28/600 · panel + modal titles' },
  { cls: 'text-h3', label: 'h3', note: '16/24/600 · summary sections' },
  { cls: 'text-title-row', label: 'title-row', note: '15/22/600 · meeting title' },
  { cls: 'text-transcript', label: 'transcript', note: '15/26/400 · looser leading' },
  { cls: 'text-body', label: 'body', note: '14/22/400 · default' },
  { cls: 'text-body-strong', label: 'body-strong', note: '14/22/500' },
  { cls: 'text-sm', label: 'sm', note: '13/18/400 · metadata' },
  { cls: 'text-xs', label: 'xs', note: '12/16/500 · badges' },
  { cls: 'text-label', label: 'label', note: '12/16/600 · .04em uppercase' },
] as const

/**
 * Written out in full rather than composed as `rounded-${r}`. Tailwind scans
 * source files as plain text, so a class assembled at runtime is never
 * generated and the swatch silently renders unstyled.
 */
const RADII = [
  { label: 'rounded-sm', cls: 'rounded-sm' },
  { label: 'rounded-md', cls: 'rounded-md' },
  { label: 'rounded-lg', cls: 'rounded-lg' },
  { label: 'rounded-full', cls: 'rounded-full' },
] as const

const SHADOWS = [
  { label: 'shadow-xs', cls: 'shadow-xs' },
  { label: 'shadow-sm', cls: 'shadow-sm' },
  { label: 'shadow-md', cls: 'shadow-md' },
  { label: 'shadow-lg', cls: 'shadow-lg' },
] as const
const DURATIONS = [
  { token: '--ff-dur-fast', label: 'fast · 120ms' },
  { token: '--ff-dur-base', label: 'base · 200ms' },
  { token: '--ff-dur-slow', label: 'slow · 320ms' },
]

// ── Contrast helpers (mirror of the assertions in tokens.test.ts) ───────────

function parseRgb(value: string): [number, number, number] | null {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m?.[1] || !m[2] || !m[3]) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrastOf(fg: string, bg: string): number | null {
  const a = parseRgb(fg)
  const b = parseRgb(bg)
  if (!a || !b) return null
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function toHex(value: string): string {
  const rgb = parseRgb(value)
  if (!rgb) return value
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// ── Page ────────────────────────────────────────────────────────────────────

/*
 * Rendered per request, not at build time.
 *
 * `notFound()` below is the gate, and it worked — no dev content ever reached
 * production. But this route was statically generated, so the gate ran during
 * the BUILD and its output was baked into a static page, which the server then
 * served with a 200 like any other asset. Measured on the deployment:
 * /dev/tokens answered 200 with a not-found body while an unknown route
 * answered a correct 404.
 *
 * A soft 404 is the failure mode where the truth requires reading the page.
 * Anyone checking whether dev surfaces shipped runs `curl -I` and sees 200.
 * Forcing dynamic moves the gate to request time, where it can set a status.
 */
export const dynamic = 'force-dynamic'

export default function TokensPage() {
  if (!DEV_SURFACES_ENABLED) notFound()

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [resolved, setResolved] = useState<Record<string, string>>({})

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    // Read the CSSOM back on the next frame rather than synchronously. Two
    // reasons: the attribute flip must be applied before getComputedStyle
    // reports the new values, and reading inside a callback is the pattern
    // react-hooks/set-state-in-effect asks for — this is a subscription to an
    // external system (the CSSOM), not derived React state.
    const frame = requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement)
      const next: Record<string, string> = {}
      for (const group of COLOR_GROUPS) {
        for (const token of group.tokens) {
          next[token] = styles.getPropertyValue(token).trim()
        }
      }
      for (let i = 0; i < SPEAKER_COLOR_COUNT; i += 1) {
        next[`--ff-speaker-${i}`] = styles.getPropertyValue(`--ff-speaker-${i}`).trim()
      }
      setResolved(next)
    })

    return () => cancelAnimationFrame(frame)
  }, [theme])

  return (
    <main className="min-h-screen bg-surface-1 px-8 py-10" data-testid="tokens-page">
      <header className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-display text-primary">Design tokens</h1>
          <p className="mt-1 text-sm text-muted">
            Calibrated against docs/reference/fireflies · values marked [D] are derived
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          data-testid="tokens-theme-toggle"
        >
          {theme === 'light' ? 'Dark' : 'Light'} theme
        </Button>
      </header>

      {/* ── Colour ────────────────────────────────────────────────────────── */}
      {COLOR_GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {group.tokens.map((token) => (
              <Swatch key={token} token={token} value={resolved[token] ?? ''} />
            ))}
          </div>
        </Section>
      ))}

      {/* ── Speaker palette ───────────────────────────────────────────────── */}
      <Section title="Speaker palette">
        <p className="mb-3 text-sm text-secondary">
          Assigned by FNV-1a hash of the speaker&apos;s name, so a person keeps their colour across
          the transcript, outline and avatars.
        </p>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: SPEAKER_COLOR_COUNT }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="h-avatar-lg w-avatar-lg rounded-full ring-2 ring-surface"
                style={{ backgroundColor: `var(--ff-speaker-${i})` }}
                data-testid={`token-speaker-${i}`}
              />
              <code className="text-xs text-muted">
                {toHex(resolved[`--ff-speaker-${i}`] ?? '')}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Typography ────────────────────────────────────────────────────── */}
      <Section title="Type scale">
        <div className="rounded-lg border border-subtle bg-surface-0 p-6">
          {TYPE_SPECIMENS.map(({ cls, label, note }) => (
            <div
              key={label}
              className="flex items-baseline gap-6 border-b border-subtle py-3 last:border-b-0"
            >
              <code className="w-32 shrink-0 text-xs text-muted">{label}</code>
              <p className={`${cls} flex-1 text-primary`}>The quick brown fox jumps</p>
              <span className="tnum shrink-0 text-xs text-muted">{note}</span>
            </div>
          ))}
          <div className="mt-4 border-t border-subtle pt-4">
            <p className="text-xs text-muted">Tabular numerals — digits must not shift width</p>
            <p className="tnum text-transcript text-primary">00:00 · 11:11 · 42:18 · 1:05:32</p>
          </div>
        </div>
      </Section>

      {/* ── Shape & elevation ─────────────────────────────────────────────── */}
      <Section title="Radius">
        <div className="flex flex-wrap gap-4">
          {RADII.map(({ label, cls }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={`h-20 w-20 border border-strong bg-surface-0 ${cls}`} />
              <code className="text-xs text-muted">{label}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation">
        <div className="flex flex-wrap gap-6">
          {SHADOWS.map(({ label, cls }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={`h-20 w-28 rounded-lg bg-surface-0 ${cls}`} />
              <code className="text-xs text-muted">{label}</code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Motion & focus ────────────────────────────────────────────────── */}
      <Section title="Motion">
        <div className="flex flex-wrap gap-4">
          {DURATIONS.map(({ token, label }) => (
            <div
              key={token}
              className="rounded-md border border-subtle bg-surface-0 px-4 py-3 text-sm text-secondary transition-colors hover:bg-accent-subtle hover:text-accent"
              style={{ transitionDuration: `var(${token})` }}
            >
              {label} — hover me
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Under prefers-reduced-motion every transition collapses to 0.01ms.
        </p>
      </Section>

      <Section title="Focus ring">
        <p className="mb-3 text-sm text-secondary">
          Tab through these. Every one must show the same 4px accent ring.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <div className="w-40">
            <Input placeholder="Input" aria-label="Focus ring sample input" />
          </div>
          <a href="#top" className="self-center text-body-strong text-accent">
            A link
          </a>
        </div>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-label uppercase text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ token, value }: { token: string; value: string }) {
  const [onLight, setOnLight] = useState<number | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const surface = getComputedStyle(document.documentElement)
        .getPropertyValue('--ff-surface-0')
        .trim()
      setOnLight(value && surface ? contrastOf(value, surface) : null)
    })
    return () => cancelAnimationFrame(frame)
  }, [value])

  const isText = token.includes('text-') || token === '--ff-accent'

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface-0">
      <div
        className="h-14 w-full border-b border-subtle"
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="px-3 py-2">
        <code className="block truncate text-xs text-primary">{token.replace('--ff-', '')}</code>
        <div className="flex items-center justify-between">
          <code className="text-xs text-muted">{toHex(value)}</code>
          {isText && onLight !== null && (
            <span className="tnum text-xs text-muted">{onLight.toFixed(1)}:1</span>
          )}
        </div>
      </div>
    </div>
  )
}
