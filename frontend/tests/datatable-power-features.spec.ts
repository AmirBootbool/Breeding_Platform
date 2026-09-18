import { test, expect } from '@playwright/test'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Phase 27: DataTable Power Features (Bulk Actions, Column Control, Saved Views)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Bulk selection reveals toolbar and handles clear', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table tbody tr')

    const checkboxes = page.locator('tbody tr input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count >= 2) {
      await checkboxes.nth(0).click()
      await checkboxes.nth(1).click()

      // Verify bulk actions toolbar is rendered
      const bulkToolbar = page.locator('.bulk-actions-toolbar')
      await expect(bulkToolbar).toBeVisible()
      await expect(bulkToolbar).toContainText('2 items selected')

      // Click Clear
      await bulkToolbar.getByRole('button', { name: /Clear/i }).click()
      await expect(bulkToolbar).not.toBeVisible()
    }
  })

  test('Column control hides/shows columns and persists across reload', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table')

    // Initial check: "Type" column header exists
    await expect(page.locator('th', { hasText: 'Type' }).first()).toBeVisible()

    // Open Columns popover
    const colBtn = page.locator('#columns-btn-germplasm-browser')
    await colBtn.click()

    // Uncheck "Type" column
    const typeCheckbox = page.locator('label', { hasText: 'Type' }).locator('input[type="checkbox"]')
    await typeCheckbox.click()

    // Verify "Type" column is now hidden
    await expect(page.locator('thead th', { hasText: 'Type' })).not.toBeVisible()

    // Reload page
    await page.reload()
    await page.waitForSelector('.table-container table')
    await expect(page.locator('thead th', { hasText: 'Type' })).not.toBeVisible()

    // Reset columns
    await page.locator('#columns-btn-germplasm-browser').click()
    await page.getByRole('button', { name: /Reset to Default/i }).click()
    await expect(page.locator('thead th', { hasText: 'Type' }).first()).toBeVisible()
  })

  test('Saved views can save, apply, and persist view configuration', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table')

    // Type a search filter into the Name search input
    const nameSearch = page.locator('input[placeholder="Search..."]').first()
    await nameSearch.fill('Wheat')

    // Open Saved Views popover
    const viewsBtn = page.locator('#views-btn-germplasm-browser')
    await viewsBtn.click()

    // Name the view
    await page.fill('input[placeholder="e.g. F4 High Protein"]', 'Wheat Accessions View')
    await page.locator('#save-view-confirm-btn').click()

    // Clear the filter
    await page.getByRole('button', { name: '✕ Clear Filters' }).click()
    await expect(nameSearch).toHaveValue('')

    // Open Saved Views popover and apply the saved view
    await viewsBtn.click()
    await page.locator('span', { hasText: 'Wheat Accessions View' }).click()

    // Verify search filter was restored
    await expect(nameSearch).toHaveValue('Wheat')
  })
})
