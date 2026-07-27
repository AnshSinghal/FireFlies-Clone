/**
 * Where the suite's own backend is listening.
 *
 * ONE definition. It started as fourteen copies of a literal
 * `http://127.0.0.1:8100` spread through the mutation specs, and briefly
 * became three near-copies that disagreed about the port — which is worse,
 * because a spec pointed at a port nothing of ours is serving does not fail
 * loudly, it tests whatever else is listening there.
 *
 * `fixtures.ts` re-exports this as `API_URL`, which is the name the suites
 * import; `playwright.config.ts` reads the same environment variables. Moving
 * the port means editing this file and the config, and nothing else.
 */
export const API_BASE =
  process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8140'}`
