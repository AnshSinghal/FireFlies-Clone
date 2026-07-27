import type { Page, Request } from "@playwright/test";

import { API_URL, expect, test } from "../fixtures";

/**
 * Network hygiene (T-46.3).
 *
 * Four claims about what a page load costs, each of which is invisible until
 * someone looks: nothing 404s, nothing is fetched twice, nothing reaches for a
 * developer's machine, and the data a route needs is fetched in parallel
 * rather than in a chain.
 *
 * The last one is the only interesting assertion. A waterfall — request B not
 * starting until A has finished, when B never needed A's answer — is the
 * difference between a page that feels instant and one that does not, and it
 * is invisible in every other test we have because all of them wait for the
 * end state.
 */

interface Seen {
  url: string;
  method: string;
  status: number;
  resourceType: string;
  startedAt: number;
  finishedAt: number;
}

/** Everything the page asked for, with timings, from a cold load. */
async function record(page: Page, path: string): Promise<Seen[]> {
  const seen: Seen[] = [];
  const started = new Map<Request, number>();

  page.on("request", (request) => started.set(request, Date.now()));
  page.on("requestfinished", async (request) => {
    const response = await request.response().catch(() => null);
    seen.push({
      url: request.url(),
      method: request.method(),
      status: response?.status() ?? 0,
      resourceType: request.resourceType(),
      startedAt: started.get(request) ?? 0,
      finishedAt: Date.now(),
    });
  });

  await page.goto(path);
  // Settle: no new request across two consecutive polls.
  for (let stable = 0, previous = -1; stable < 2;) {
    await page.waitForTimeout(250);
    stable = seen.length === previous ? stable + 1 : 0;
    previous = seen.length;
  }
  return seen;
}

const ROUTES = [
  "/notebook",
  "/meeting/1",
  "/search?q=pricing",
  "/settings",
] as const;

test.describe("network hygiene · what a page load actually costs", () => {
  for (const route of ROUTES) {
    test(`T46-N · ${route} fetches nothing that 404s`, async ({ page }) => {
      const requests = await record(page, route);

      const broken = requests
        .filter((request) => request.status >= 400)
        .map((request) => `${request.status} ${request.method} ${request.url}`);

      expect(broken, "a failed request on a happy-path load").toEqual([]);
    });
  }

  test("T46-N · no resource is fetched twice on one load", async ({ page }) => {
    /*
     * Two GETs for one URL is a cache header missing, a key changing between
     * renders, or an effect firing twice — all real bugs, and all silent.
     *
     * Scoped to GET: a POST to the same URL twice is a different question, and
     * the mutation specs own it.
     */
    const requests = await record(page, "/notebook");

    const counts = new Map<string, number>();
    for (const request of requests) {
      if (request.method !== "GET") continue;
      counts.set(request.url, (counts.get(request.url) ?? 0) + 1);
    }

    const duplicated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(
        ([url, count]) => `${count}× ${url.replace(/^https?:\/\/[^/]+/, "")}`,
      );

    expect(duplicated).toEqual([]);
  });

  test("T46-N · nothing reaches for an unconfigured origin", async ({
    page,
  }) => {
    /*
     * The classic production bug: a hardcoded `http://localhost:8000` that
     * works on every laptop and fails for everyone else.
     *
     * The suite's own two origins are legitimate — the frontend serves from
     * one and `NEXT_PUBLIC_API_URL` points the client at the other, both on
     * localhost by design. So the check is not "is this localhost" (it always
     * is, here) but "is this an origin nobody configured", which is exactly
     * what a hardcoded URL looks like and what the deployed build, where the
     * API is same-origin, would expose as a cross-origin request.
     */
    const requests = await record(page, "/meeting/1");

    const allowed = new Set([
      new URL(page.url()).origin,
      new URL(API_URL).origin,
    ]);
    const strays = [
      ...new Set(
        requests
          .map((request) => new URL(request.url).origin)
          .filter(
            (origin) => origin.startsWith("http") && !allowed.has(origin),
          ),
      ),
    ];

    expect(strays, `expected only ${[...allowed].join(" and ")}`).toEqual([]);
  });

  test("T46-N · the notepad fetches its panels in parallel, not in a chain", async ({
    page,
  }) => {
    /*
     * The notepad needs four independent things — the meeting, its transcript,
     * its summary and its action items. None depends on another's answer, so
     * they must overlap. Serialised, the page costs four round trips instead
     * of one.
     *
     * Asserted as OVERLAP rather than as elapsed time: a slow runner makes
     * every duration meaningless, but "these two requests were in flight at
     * the same moment" is true or false regardless of how fast the machine is.
     */
    const requests = await record(page, "/meeting/1");

    const api = requests.filter(
      (request) =>
        request.url.includes("/api/v1/meetings/") && request.method === "GET",
    );
    expect(
      api.length,
      "expected several API calls on the notepad",
    ).toBeGreaterThan(2);

    const overlaps = api.some((a) =>
      api.some(
        (b) =>
          a !== b && a.startedAt < b.finishedAt && b.startedAt < a.finishedAt,
      ),
    );

    expect(
      overlaps,
      `no two of ${api.length} notepad requests overlapped — that is a waterfall`,
    ).toBe(true);
  });
});
