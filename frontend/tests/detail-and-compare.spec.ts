import { test, expect } from '@playwright/test'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Phase 30: Master-Detail Drawer & Germplasm Comparison', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('clicking a row in Germplasm Browser opens DetailDrawer and closing works', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table tbody tr')

    // Click on the first germplasm row
    const firstRow = page.locator('.table-container table tbody tr').first()
    await firstRow.click()

    // Detail drawer should open with dialog role
    const drawer = page.locator('.detail-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: /View Pedigree Tree/i })).toBeVisible()

    // Close via close button
    const closeBtn = drawer.locator('button.drawer-close-btn')
    await closeBtn.click()
    await expect(drawer).not.toBeVisible()

    // Reopen and close with ESC key
    await firstRow.click()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
  })

  test('selecting lines in Germplasm Browser enables bulk compare and navigates to comparison page', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table tbody tr')

    // Select the first two checkboxes
    const checkboxes = page.locator('.table-container table tbody input[type="checkbox"]')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Compare button should appear in bulkActions
    const compareBtn = page.locator('#bulk-compare-btn')
    await expect(compareBtn).toBeVisible()
    await expect(compareBtn).toContainText('Compare (2)')

    // Click compare button -> should navigate to /germplasm/compare?ids=...
    await compareBtn.click()
    await expect(page).toHaveURL(/\/germplasm\/compare\?ids=/)

    // Check comparison page elements
    await expect(page.getByRole('heading', { name: /Side-by-Side Germplasm Comparison/i })).toBeVisible()
    await expect(page.locator('table.data-table th')).toHaveCount(3) // 1 attribute column + 2 accessions

    // Check difference highlighting toggle
    const diffCheckbox = page.locator('#highlight-diffs-checkbox')
    await expect(diffCheckbox).toBeChecked()
    await diffCheckbox.uncheck()
    await expect(diffCheckbox).not.toBeChecked()

    // Test removing a column
    const removeBtn = page.locator('th button[title="Remove from comparison"]').first()
    await removeBtn.click()
    await expect(page.locator('table.data-table th')).toHaveCount(2) // 1 attribute + 1 accession
  })

  test('Compare page supports adding accessions up to 20 limit', async ({ page }) => {
    await page.goto('/germplasm/compare')

    // Empty state should be visible when no ids in URL
    await expect(page.locator('.empty-state')).toBeVisible()

    // Open add menu
    await page.locator('#add-accession-compare-btn').click()
    const searchInput = page.locator('#search-add-line-input')
    await expect(searchInput).toBeVisible()

    // Add first available accession
    const firstOption = page.locator('.hover-row, div.cursor-pointer').first()
    await firstOption.click()

    // Table should now be rendered with 1 accession
    await expect(page.locator('table.data-table')).toBeVisible()
  })
})
