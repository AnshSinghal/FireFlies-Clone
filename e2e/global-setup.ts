import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Build a deterministic database before the suite runs (T-39.5, needed early
 * by T-06).
 *
 * Every run starts from an identical database. Without that, tests that assert
 * on counts or on "Today" pass or fail depending on what a previous run left
 * behind — and visual-regression baselines in T-41 become meaningless.
 *
 * The anchor date is pinned to the same instant the tests use, so seeded
 * "today" and asserted "Today" are the same day regardless of when the suite
 * actually runs.
 */

const BACKEND = path.resolve(__dirname, '..', 'backend')
const DB_FILE = path.join(BACKEND, 'e2e.db')

export const E2E_ANCHOR = '2026-07-26T09:00:00Z'
export const E2E_DATABASE_URL = 'sqlite:///./e2e.db'

export default function globalSetup(): void {
  /*
   * The database file is NOT deleted here, deliberately.
   *
   * Playwright does not guarantee that globalSetup finishes before webServer
   * starts. Deleting the file out from under a backend that has already opened
   * it leaves the server holding a handle to an unlinked inode — every query
   * then returns nothing, with no error anywhere. That produced a run where
   * five data-dependent tests failed while the API demonstrably returned 200.
   *
   * `seed --reset` wipes the rows through the same file instead, which is
   * correct regardless of who started first. Migrations are idempotent, so
   * running them against an existing database is a no-op.
   */
  void DB_FILE

  const env = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    SEED_ANCHOR_DATE: E2E_ANCHOR,
  }

  const run = (command: string) =>
    execSync(command, { cwd: BACKEND, env, stdio: 'inherit', encoding: 'utf8' })

  // Migrations, not create_all — the same path a deploy takes, and the only one
  // that produces the FTS virtual table and its triggers.
  run('uv run alembic upgrade head')
  run('uv run python -m app.seed.seed --reset --quiet')
  run('uv run python -m app.seed.validate')
}
