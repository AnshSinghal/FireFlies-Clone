import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Token integrity and contrast (T-02.2, T-02.3, T02-G).
 *
 * These parse tokens.css directly rather than reading computed styles from a
 * browser, so they run in milliseconds and fail with a message naming the exact
 * token. The point is that changing a token to something illegible — or
 * introducing a dangling var() — breaks the build rather than shipping.
 */

const TOKENS_CSS = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8')

/** Pull the declarations out of one CSS block by selector. */
function block(selector: string): Map<string, string> {
  const start = TOKENS_CSS.indexOf(selector)
  if (start === -1) throw new Error(`selector not found: ${selector}`)
  const open = TOKENS_CSS.indexOf('{', start)
  const close = TOKENS_CSS.indexOf('\n}', open)
  const body = TOKENS_CSS.slice(open + 1, close)

  const out = new Map<string, string>()
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name && value) out.set(name, value.trim())
  }
  return out
}

const LIGHT = block(':root')
const DARK = block("[data-theme='dark']")

/** Resolve a token through the primitive→semantic indirection to a literal. */
function resolve(name: string, theme: Map<string, string> = LIGHT, depth = 0): string {
  if (depth > 10) throw new Error(`cyclic token reference at ${name}`)

  const raw = theme.get(name) ?? LIGHT.get(name)
  if (raw === undefined) throw new Error(`undefined token: ${name}`)

  const ref = raw.match(/^var\((--[\w-]+)\)$/)
  return ref?.[1] ? resolve(ref[1], theme, depth + 1) : raw
}

function rgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i)
  if (!m?.[1]) throw new Error(`not a hex colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function ratio(fgToken: string, bgToken: string, theme: Map<string, string>): number {
  return contrast(resolve(fgToken, theme), resolve(bgToken, theme))
}

// T02-D
describe('no hex outside tokens.css', () => {
  const SRC = path.resolve(import.meta.dirname, '..')

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) return walk(full)
      return /\.(ts|tsx|css)$/.test(entry) ? [full] : []
    })
  }

  it('finds no hex literal in any source file', () => {
    // The build output necessarily contains tokens.css inlined plus one
    // hardcoded value from Tailwind's preflight (ADR-007), so grepping the
    // bundle proves nothing. Scanning authored source is the real enforcement.
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file)
      // tokens.css is the sanctioned home for hex; the tests below assert on
      // literals by design.
      if (rel === 'styles/tokens.css' || rel.endsWith('.test.ts')) continue

      const source = readFileSync(file, 'utf8')

      // Blank out comments before scanning — rationale legitimately cites hex
      // values ("preflight hardcodes #9ca3af"), and those are not violations.
      // Block comments are replaced newline-for-newline so reported line
      // numbers still point at the real line.
      const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))

      stripped.forEach((code, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(code)) {
          offenders.push(`${rel}:${i + 1}  ${(source.split('\n')[i] ?? '').trim()}`)
        }
      })
    }

    expect(offenders, `hex literals must live in tokens.css:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('token structure', () => {
  it('resolves every semantic token to a literal', () => {
    for (const name of LIGHT.keys()) {
      expect(() => resolve(name), `token ${name}`).not.toThrow()
    }
  })

  it('has no dangling var() references in the dark theme', () => {
    for (const name of DARK.keys()) {
      expect(() => resolve(name, DARK), `dark token ${name}`).not.toThrow()
    }
  })

  it('defines all eight speaker hues in both themes', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(resolve(`--ff-speaker-${i}`)).toMatch(/^#[0-9a-f]{6}$/i)
      expect(resolve(`--ff-speaker-${i}`, DARK)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('keeps semantics pointing at primitives, not at raw hex', () => {
    // The whole point of the two-layer split: a semantic that hardcodes a hex
    // cannot be re-pointed by the dark theme.
    const semantics = [
      '--ff-accent',
      '--ff-surface-0',
      '--ff-surface-1',
      '--ff-surface-2',
      '--ff-text-primary',
      '--ff-text-secondary',
      '--ff-text-muted',
      '--ff-border-subtle',
      '--ff-success',
      '--ff-danger',
    ]
    for (const name of semantics) {
      expect(LIGHT.get(name), `${name} must reference a primitive`).toMatch(/^var\(--ff-/)
    }
  })
})

// T02-G
describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('contrast — %s theme', (_label, theme) => {
  it('body and heading text clears AA (4.5:1)', () => {
    expect(ratio('--ff-text-primary', '--ff-surface-0', theme)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('--ff-text-secondary', '--ff-surface-0', theme)).toBeGreaterThanOrEqual(4.5)
  })

  it('text on the accent fill clears AA', () => {
    expect(ratio('--ff-text-inverse', '--ff-accent', theme)).toBeGreaterThanOrEqual(4.5)
  })

  it('primary text stays legible on every surface step', () => {
    for (const surface of ['--ff-surface-0', '--ff-surface-1', '--ff-surface-2']) {
      expect(ratio('--ff-text-primary', surface, theme), surface).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('muted text clears AA', () => {
    /*
     * 4.5, not the 3 this asserted until 2026-07-28.
     *
     * ADR-012 decided to ship #8992A2 at 3.14:1 — deliberately below AA, to stay
     * close to Fireflies' own #97A1B3 (2.60:1) — and set this floor to match.
     * That decision was later reversed in code and never written down: the
     * shipped value is #667085, which is 4.97:1 light and 5.94:1 dark.
     *
     * A floor of 3 cannot notice a regression back to 3.14 — the exact value it
     * was written to defend. The guard outlived the decision it was guarding,
     * and passed more comfortably every year for it.
     */
    expect(ratio('--ff-text-muted', '--ff-surface-0', theme)).toBeGreaterThanOrEqual(4.5)
  })

  it('accent-on-surface is usable for links and icons (3:1)', () => {
    expect(ratio('--ff-accent', '--ff-surface-0', theme)).toBeGreaterThanOrEqual(3)
  })

  it('the active-nav pairing is legible', () => {
    expect(ratio('--ff-accent-strong', '--ff-accent-subtle', theme)).toBeGreaterThanOrEqual(4.5)
  })

  it('status colours are readable on their own tints', () => {
    expect(ratio('--ff-success-strong', '--ff-success-subtle', theme)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('--ff-danger', '--ff-danger-subtle', theme)).toBeGreaterThanOrEqual(3)
  })

  it('search highlights keep their text readable', () => {
    expect(ratio('--ff-text-primary', '--ff-highlight', theme)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('--ff-text-primary', '--ff-highlight-active', theme)).toBeGreaterThanOrEqual(4.5)
  })
})
