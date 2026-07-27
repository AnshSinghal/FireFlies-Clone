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
 *
 * `localhost`, NOT `127.0.0.1`, to match the `NEXT_PUBLIC_API_URL` the config
 * hands the browser. They resolve to the same host but are different ORIGINS
 * to anything comparing strings — which `35-network` does, and which caught
 * this the moment it started asserting on origins.
 */
export const API_BASE =
  process.env.E2E_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8140'}`
