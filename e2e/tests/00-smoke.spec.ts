import { expect, test } from '@playwright/test'

/**
 * Scaffold smoke test (T-01.10).
 *
 * Proves the full stack starts from a cold clone and the two apps can see each
 * other. The real suites arrive in T-40; this exists so the CI Playwright job
 * is a genuine check rather than a green tick over nothing.
 */

const API_URL =
  process.env.E2E_API_URL ?? `http://localhost:${process.env.E2E_BACKEND_PORT ?? '8100'}`

test('backend reports healthy', async ({ request }) => {
  const response = await request.get(`${API_URL}/api/health`)

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'ok', ai_provider: 'mock' })
})

test('API documents itself', async ({ request }) => {
  // /docs is a deliverable in its own right — the README links evaluators to it.
  expect((await request.get(`${API_URL}/docs`)).status()).toBe(200)
})

test('frontend renders through the token layer', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Fireflies' })).toBeVisible()

  // The app background must resolve from --ff-surface-1. If the token layer is
  // broken, this is the assertion that notices — a missing custom property
  // renders as transparent, not as the wrong colour.
  const background = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('background-color'),
  )
  expect(background).not.toBe('rgba(0, 0, 0, 0)')

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ff-accent').trim(),
  )
  expect(accent).toBeTruthy()
})
