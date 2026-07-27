/**
 * Where the suite's own backend is listening.
 *
 * ONE definition. It had grown to four near-copies of the same expression —
 * `fixtures.ts`, `00-smoke`, `98-smoke` and `26-soundbites` — which is worse
 * than one wrong copy, because a spec pointed at a port nothing of ours serves
 * does not fail loudly: it tests whatever else is listening there.
 *
 * `fixtures.ts` re-exports this as `API_URL`, the name the suites import, and
 * `playwright.config.ts` reads the same environment variables. Moving the port
 * means editing this file and the config, and nothing else.
 */
export const API_BASE =
  process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8140'}`
