import { test, expect } from '@playwright/test'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Phase 29: Page Restructuring — Tabs & View Switchers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Genomics page switches tabs and reflects tab in URL query param', async ({ page }) => {
    await page.goto('/genomics')

    // Initial check: Prediction tab active
    await expect(page.locator('.prediction-tab')).toBeVisible()

    // Switch to Datasets tab
    const datasetsBtn = page.getByRole('button', { name: /Genotype Datasets/i })
    await datasetsBtn.click()
    await expect(page).toHaveURL(/tab=datasets/)
    await expect(page.locator('.datasets-tab')).toBeVisible()

    // Switch to MAS tab
    const masBtn = page.getByRole('button', { name: /Marker-Assisted Selection/i })
    await masBtn.click()
    await expect(page).toHaveURL(/tab=mas/)
    await expect(page.locator('.mas-tab')).toBeVisible()

    // Deep link directly to ?tab=datasets
    await page.goto('/genomics?tab=datasets')
    await expect(page.locator('.datasets-tab')).toBeVisible()
  })

  test('Germplasm Browser switches between Table, Cards, and Pedigree views', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table')

    // Switch to Cards view
    await page.locator('#view-mode-grid').click()
    await expect(page.locator('.table-container table')).not.toBeVisible()

    // Switch to Pedigree view
    await page.locator('#view-mode-pedigree').click()
    await expect(page.locator('#germplasm-pedigree-view')).toBeVisible()

    // Switch back to Table view
    await page.locator('#view-mode-table').click()
    await expect(page.locator('.table-container table')).toBeVisible()
  })

  test('Trial Manager detail view renders tabbed sections with URL sync', async ({ page }) => {
    await page.goto('/trials')
    await page.waitForSelector('.table-container table tbody tr')

    // Click first trial row to open detail view
    const firstRow = page.locator('tbody tr').first()
    if (await firstRow.count() > 0) {
      await firstRow.click()

      // Tabs container should be visible
      const tabs = page.locator('.tabs-container')
      await expect(tabs).toBeVisible()

      // Switch to Observations tab
      const obsTab = page.locator('#tab-observations')
      if (await obsTab.count() > 0) {
        await obsTab.click()
        await expect(page).toHaveURL(/tab=observations/)
      }
    }
  })
})
