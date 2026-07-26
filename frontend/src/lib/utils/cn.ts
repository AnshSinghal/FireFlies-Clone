/**
 * Class-name joiner.
 *
 * Deliberately NOT `tailwind-merge`. That library resolves conflicting
 * utilities at runtime (`px-2 px-4` → `px-4`), which sounds useful but hides
 * the conflict instead of preventing it — and it carries a hand-maintained map
 * of every Tailwind class, which our replaced palette would not match anyway.
 *
 * Components here are written so conflicts do not arise: a variant supplies one
 * complete set of classes rather than a base plus overrides. See the note in
 * `global-search.tsx` for what happens when that rule is broken —
 * `relative`/`absolute` are emitted in Tailwind's own order, so "later in the
 * string" does not win.
 */

/*
 * Deliberately wide. The idiom is `cond && 'class'`, and `cond` is often a
 * ReactNode or a count rather than a boolean — `leading && 'pl-9'` with no
 * leading icon evaluates to `0`, not `false`. Narrowing the type would force a
 * `Boolean(...)` wrapper at every call site to appease the compiler about a
 * value that is discarded anyway.
 */
export type ClassValue = string | number | bigint | boolean | null | undefined

export function cn(...values: ClassValue[]): string {
  // Only strings survive, so a stray `0` or `true` cannot reach the DOM.
  return values
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ')
}
