import { expect, test } from '@playwright/test'

/**
 * Placeholder surfaces (T-30, cases T30-A → T30-H).
 *
 * The contract under test: every deferred surface is branded and deliberate —
 * reachable, titled, explained, escapable — and the two functional settings
 * tabs genuinely work.
 */

const PLACEHOLDER_ROUTES = [
  { path: '/apps', feature: 'apps', title: 'AI Apps' },
  { path: '/integrations', feature: 'integrations', title: 'Integrations' },
  { path: '/team', feature: 'team', title: 'Team' },
  { path: '/analytics', feature: 'analytics', title: 'Analytics' },
] as const

test.describe('placeholder surfaces', () => {
  test('T30-A · every placeholder route renders branded, titled, without a 404', async ({
    page,
  }) => {
    for (const route of PLACEHOLDER_ROUTES) {
      const response = await page.goto(route.path)
      expect(response?.status(), `${route.path} must not 404`).toBeLessThan(400)
      await expect(page.getByTestId(`coming-soon-${route.feature}`)).toBeVisible()
      await expect(page).toHaveTitle(new RegExp(route.title))
    }
  })

  test('T30-B · /apps shows six skill cards, each wearing a Soon badge', async ({ page }) => {
    await page.goto('/apps')

    const cards = page.getByTestId('apps-skill-grid').locator('li')
    await expect(cards).toHaveCount(6)
    for (const suffix of [
      'sales-call-analysis',
      'interview-scorecard',
      'meeting-prep-brief',
      'topic-tracker',
      'daily-digest',
      'custom-skill',
    ]) {
      await expect(page.getByTestId(`apps-skill-${suffix}-soon`)).toHaveText('Soon')
    }
  })

  test('T30-C · a disabled Connect explains itself and navigates nowhere', async ({ page }) => {
    await page.goto('/integrations')

    await page.getByTestId('integrations-connect-zoom').click()

    await expect(page.getByTestId('toast')).toContainText('Coming soon')
    await expect(page).toHaveURL(/\/integrations/)
  })

  test('T30-D · settings sub-nav renders; Appearance and Preferences are interactive', async ({
    page,
  }) => {
    await page.goto('/settings')

    await expect(page.getByTestId('settings-tab-appearance')).toBeVisible()
    await expect(page.getByTestId('settings-appearance')).toBeVisible()

    await page.getByTestId('settings-tab-preferences').click()
    await expect(page.getByTestId('settings-preferences')).toBeVisible()

    // Interactive means a control actually responds, not just renders:
    // choosing Dark flips the html attribute the whole app themes from.
    await page.getByTestId('settings-tab-appearance').click()
    await page.getByTestId('settings-theme').getByTestId('radio-dark').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('T30-E · default sort preference is what the Notebook opens with', async ({ page }) => {
    await page.goto('/settings?tab=preferences')
    await page.getByTestId('settings-default-sort').click()
    await page.getByRole('option', { name: 'Title A–Z' }).click()

    await page.goto('/notebook')

    // The preference supplies the DEFAULT: no ?sort= appears in the URL, but
    // the toolbar reflects the choice.
    await expect(page.getByTestId('notebook-sort')).toContainText('Title A–Z')
    expect(new URL(page.url()).searchParams.get('sort')).toBeNull()
  })

  test('T30-F · Sign out explains itself and leaves you signed in', async ({ page }) => {
    await page.goto('/notebook')

    await page.getByTestId('topbar-avatar').click()
    await page.getByTestId('avatar-sign-out').click()

    await expect(page.getByTestId('toast')).toContainText('out of scope')
    // Still "signed in": the avatar is still there and no login page appeared.
    await expect(page.getByTestId('topbar-avatar')).toBeVisible()
    await expect(page).toHaveURL(/\/notebook/)
  })

  test('T30-G · analytics charts are present, fabrications labelled', async ({ page }) => {
    await page.goto('/analytics')

    await expect(page.getByTestId('analytics-meetings-per-week')).toBeVisible()
    await expect(page.getByTestId('analytics-talk-time-sample-badge')).toHaveText('Sample data')
    await expect(page.getByTestId('analytics-sentiment-sample-badge')).toHaveText('Sample data')
    // The real chart carries no such badge — it is not a fabrication.
    await expect(
      page.getByTestId('analytics-meetings-per-week').getByText('Sample data'),
    ).toHaveCount(0)
  })

  test('T30-H · every placeholder page can walk back to the meetings list', async ({ page }) => {
    for (const route of PLACEHOLDER_ROUTES) {
      await page.goto(route.path)
      await page.getByTestId(`coming-soon-${route.feature}-back`).click()
      await expect(page).toHaveURL(/\/notebook/)
    }
  })
})
