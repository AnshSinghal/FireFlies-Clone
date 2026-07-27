/**
 * Where the suite's own backend is listening.
 *
 * ONE definition, because the alternative was fourteen copies of a literal
 * `http://127.0.0.1:8100` spread through the mutation specs — and moving the
 * port (which a shared machine forces sooner or later) then means finding all
 * of them. Reads the same environment variables as `playwright.config.ts`, so
 * overriding the port in one place moves both.
 */
export const API_BASE =
  process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8140'}`
