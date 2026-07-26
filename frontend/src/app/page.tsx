/**
 * Scaffold verification surface (T-01).
 *
 * Replaced in T-06/T-12 by a redirect to /notebook (see design.md §1 — and the
 * open question there about whether `/` becomes a real welcome screen instead).
 *
 * Every class below resolves through the token layer. If this page renders with
 * the right colours and type scale, tailwind.config.ts and tokens.css agree.
 */

const CHECKS = [
  { label: 'Next.js 16 · App Router · TypeScript strict', task: null },
  { label: 'Tailwind v3 wired to design tokens', task: null },
  { label: 'Token layer calibrated (light + dark)', task: null },
  { label: 'FastAPI backend · /api/health', task: null },
  { label: 'Database schema', task: 'T-03' },
  { label: 'API contract', task: 'T-04' },
  { label: 'Seed data', task: 'T-05' },
] as const

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-modal-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-display text-primary">Fireflies</h1>
        <p className="mt-2 text-body text-secondary">Scaffold is up. Token layer resolving.</p>
      </div>

      <div className="rounded-lg border border-subtle bg-surface-0 shadow-xs">
        <ul>
          {CHECKS.map((check, i) => (
            <li
              key={check.label}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? 'border-t border-subtle' : ''
              }`}
            >
              <span className="text-body text-secondary">{check.label}</span>
              {check.task === null ? (
                <span className="rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success">
                  Ready
                </span>
              ) : (
                <span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {check.task}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-muted">
        <a className="text-accent hover:text-accent-hover" href="/dev/tokens">
          Token specimen sheet
        </a>{' '}
        ·{' '}
        <a className="text-accent hover:text-accent-hover" href="http://localhost:8000/docs">
          API docs
        </a>
      </p>
    </main>
  )
}
