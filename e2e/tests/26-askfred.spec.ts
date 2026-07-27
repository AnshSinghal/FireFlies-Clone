import type { Page } from '@playwright/test'

import { delayRoute, expect, test } from '../fixtures'

/**
 * AskFred (T-37, cases T37-E → T37-K).
 *
 * The pytest half (T37-A..D) already proved the endpoint: real citations, the
 * guardrail, the 429, history truncation. This half proves the CONVERSATION —
 * that a question becomes an answer you can click back into the transcript.
 *
 * Budget note: the endpoint shares the real 10/minute AI rate limit, so this
 * file spends its questions deliberately — six real asks across the suite,
 * and the failure test stubs the route instead of burning one.
 */

const ASK = (url: URL) => url.pathname.endsWith('/ask')

/** A question whose terms are verbatim in the hero transcript, so retrieval
 *  always grounds it (the same reason `17-find` searches for "pricing"). */
const GROUNDED_QUESTION = 'What did they say about pricing?'

async function openAskFred(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })
  await page.getByTestId('notepad-askfred').click()
  await expect(page.getByTestId('askfred-panel')).toBeVisible()
}

test.describe('AskFred', () => {
  test('T37-E · opening the panel offers suggested questions', async ({
    page,
    seededMeeting,
  }) => {
    await openAskFred(page, seededMeeting.path)

    // All four openers, phrased for any meeting rather than this one.
    await expect(page.getByTestId('askfred-suggested-0')).toHaveText(
      'What were the main decisions?',
    )
    await expect(page.getByTestId('askfred-suggested-1')).toHaveText('What are the next steps?')
    await expect(page.getByTestId('askfred-suggested-2')).toBeVisible()
    await expect(page.getByTestId('askfred-suggested-3')).toBeVisible()

    // No conversation yet — the input is the only other affordance.
    await expect(page.getByTestId('askfred-input')).toBeVisible()
    await expect(page.getByTestId('askfred-send')).toBeDisabled()
  })

  test('T37-F · a suggestion sends, thinks, and answers', async ({ page, seededMeeting }) => {
    // The mock provider answers in single-digit milliseconds — too fast for
    // the thinking state to be observable without holding the response.
    await delayRoute(page, ASK, 700)
    await openAskFred(page, seededMeeting.path)

    await page.getByTestId('askfred-suggested-0').click()

    // The question becomes message 0 immediately; suggestions leave.
    await expect(page.getByTestId('askfred-message-0')).toHaveText(
      'What were the main decisions?',
    )
    await expect(page.getByTestId('askfred-suggested-0')).toHaveCount(0)
    await expect(page.getByTestId('askfred-thinking')).toBeVisible()

    // Then the answer lands and the thinking state leaves with it.
    await expect(page.getByTestId('askfred-message-1')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('askfred-thinking')).toHaveCount(0)
  })

  test('T37-G · a citation chip seeks the player and reveals the segment', async ({
    page,
    seededMeeting,
  }) => {
    await openAskFred(page, seededMeeting.path)

    const answered = page.waitForResponse(
      (response) => ASK(new URL(response.url())) && response.ok(),
    )
    await page.getByTestId('askfred-input').fill(GROUNDED_QUESTION)
    await page.getByTestId('askfred-send').click()

    const body = (await answered).request().postDataJSON() as { question: string }
    expect(body.question).toBe(GROUNDED_QUESTION)

    const { citations } = (await (await answered).json()) as {
      citations: Array<{ segment_id: number; start_ms: number }>
    }
    expect(citations.length).toBeGreaterThan(0)
    const cited = citations[0]!

    await page.getByTestId('askfred-citation-0').click()

    // The player seeked to the citation (and plays from it — allow drift).
    const seconds = Math.floor(cited.start_ms / 1000)
    await expect
      .poll(async () => Number(await page.getByTestId('player-seekbar').getAttribute('aria-valuenow')))
      .toBeGreaterThanOrEqual(seconds)

    // And the transcript revealed the cited line — the reveal scroll is the
    // "flash": the row it lands on wears the active-line tint.
    await expect(page.getByTestId(`transcript-segment-${cited.segment_id}`)).toBeInViewport({
      timeout: 10_000,
    })
  })

  test('T37-H · follow-ups carry the conversation', async ({ page, seededMeeting }) => {
    await openAskFred(page, seededMeeting.path)

    const first = page.waitForResponse((r) => ASK(new URL(r.url())) && r.ok())
    await page.getByTestId('askfred-input').fill(GROUNDED_QUESTION)
    await page.getByTestId('askfred-send').click()
    await first
    await expect(page.getByTestId('askfred-message-1')).toBeVisible({ timeout: 15_000 })

    // The second REQUEST BODY is the assertion (the spec's own wording):
    // the prior question and its answer ride along as history.
    const second = page.waitForRequest((r) => ASK(new URL(r.url())) && r.method() === 'POST')
    await page.getByTestId('askfred-input').fill('Who raised that?')
    await page.getByTestId('askfred-send').click()

    const history = ((await second).postDataJSON() as {
      history: Array<{ role: string; text: string }>
    }).history
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history[0]).toEqual({ role: 'user', text: GROUNDED_QUESTION })
    expect(history[1]?.role).toBe('assistant')

    await expect(page.getByTestId('askfred-message-3')).toBeVisible({ timeout: 15_000 })
  })

  test('T37-I · New chat clears the thread and brings the suggestions back', async ({
    page,
    seededMeeting,
  }) => {
    await openAskFred(page, seededMeeting.path)

    await page.getByTestId('askfred-suggested-1').click()
    await expect(page.getByTestId('askfred-message-1')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('askfred-new-chat').click()

    await expect(page.getByTestId('askfred-message-0')).toHaveCount(0)
    await expect(page.getByTestId('askfred-suggested-0')).toBeVisible()
  })

  test('T37-J · a failed ask gets a Retry on that message only, and Retry works', async ({
    page,
    seededMeeting,
  }) => {
    await openAskFred(page, seededMeeting.path)

    // Fail the FIRST attempt at the network edge; the endpoint never hears it.
    let failNext = true
    await page.route(ASK, async (route) => {
      if (failNext) {
        failNext = false
        await route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'Stubbed failure.', details: {} } },
        })
        return
      }
      await route.fallback()
    })

    await page.getByTestId('askfred-input').fill(GROUNDED_QUESTION)
    await page.getByTestId('askfred-send').click()

    // The error bubble carries the retry; the user turn above it does not.
    const retry = page.getByTestId('askfred-retry-1')
    await expect(retry).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('askfred-retry-0')).toHaveCount(0)

    await retry.click()

    // The failed pair collapses into a fresh attempt: question, then answer —
    // no duplicate question bubble, no stale error.
    await expect(page.getByTestId('askfred-message-0')).toHaveText(GROUNDED_QUESTION)
    await expect(page.getByTestId('askfred-message-1')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('askfred-retry-1')).toHaveCount(0)
    await expect(page.getByTestId('askfred-message-2')).toHaveCount(0)
  })

  test('T37-K · the mock provider announces itself', async ({ page, seededMeeting }) => {
    await openAskFred(page, seededMeeting.path)

    // From /api/health, so it is honest BEFORE the first answer.
    await expect(page.getByTestId('askfred-mode-badge')).toHaveText('Extractive mode')
  })
})
