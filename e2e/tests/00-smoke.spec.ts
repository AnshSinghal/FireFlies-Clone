import { expect, test } from '@playwright/test'

import { API_BASE } from '../api-base'

/**
 * Scaffold smoke test (T-01.10).
 *
 * Proves the full stack starts from a cold clone and the two apps can see each
 * other. The real suites arrive in T-40; this exists so the CI Playwright job
 * is a genuine check rather than a green tick over nothing.
 */

test('backend reports healthy', async ({ request }) => {
  const response = await request.get(`${API_BASE}/api/health`)

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'ok', ai_provider: 'mock' })
})

test('API documents itself', async ({ request }) => {
  // /docs is a deliverable in its own right — the README links evaluators to it.
  expect((await request.get(`${API_BASE}/docs`)).status()).toBe(200)
})

test('frontend renders through the token layer', async ({ page }) => {
  // `/` redirects to the Notebook since T-06 (ADR — open decision #4), so this
  // asserts on the destination rather than on the scaffold page it replaced.
  await page.goto('/')
  await expect(page).toHaveURL(/\/notebook$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()

  // The app background must resolve from a token. If the token layer is broken,
  // this is the assertion that notices — a missing custom property renders as
  // transparent, not as the wrong colour.
  const background = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('background-color'),
  )
  expect(background).not.toBe('rgba(0, 0, 0, 0)')

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ff-accent').trim(),
  )
  expect(accent).toBeTruthy()
})
