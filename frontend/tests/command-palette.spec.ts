import { test, expect } from '@playwright/test'

test.describe('Phase 23: Command Palette & Grouped Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login and authenticate as admin
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin_user')
    await page.fill('input[type="password"]', 'adminpass')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('Grouped navigation renders 4 collapsible sections and persists collapse state', async ({ page }) => {
    // Check that sidebar groups exist
    const breedingGroup = page.locator('.sidebar-group[data-group-id="breeding"]')
    const trialsGroup = page.locator('.sidebar-group[data-group-id="trials"]')
    const analyticsGroup = page.locator('.sidebar-group[data-group-id="analytics"]')
    const adminGroup = page.locator('.sidebar-group[data-group-id="admin"]')

    await expect(breedingGroup).toBeVisible()
    await expect(trialsGroup).toBeVisible()
    await expect(analyticsGroup).toBeVisible()
    await expect(adminGroup).toBeVisible()

    // Collapse the Admin group
    const adminHeader = adminGroup.locator('.sidebar-group-header')
    await adminHeader.click()

    // Items inside admin should now be hidden
    await expect(adminGroup.locator('.sidebar-group-items')).not.toBeVisible()

    // Reload the page and ensure collapse state persists in localStorage
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const adminGroupAfterReload = page.locator('.sidebar-group[data-group-id="admin"]')
    await expect(adminGroupAfterReload.locator('.sidebar-group-items')).not.toBeVisible()

    // Re-expand the Admin group
    await adminGroupAfterReload.locator('.sidebar-group-header').click()
    await expect(adminGroupAfterReload.locator('.sidebar-group-items')).toBeVisible()
  })

  test('Command palette opens via TopBar button and Ctrl+K, filters pages and navigates', async ({ page }) => {
    // 1. Open via TopBar trigger button
    const searchTrigger = page.locator('.topbar-search-trigger')
    await expect(searchTrigger).toBeVisible()
    await searchTrigger.click()

    const palette = page.locator('.cmd-palette-modal')
    await expect(palette).toBeVisible()

    // 2. Type "Germplasm" into input
    const input = page.locator('.cmd-palette-input')
    await input.fill('Germplasm')

    // Expect Germplasm item to be visible and selectable
    const germplasmItem = page.locator('.cmd-item:has-text("Germplasm")').first()
    await expect(germplasmItem).toBeVisible()

    // Press Enter to navigate
    await input.press('Enter')

    // Expect to land on Germplasm page
    await expect(page).toHaveURL(/.*germplasm/)
    await expect(page.getByRole('heading', { name: 'Germplasm Browser' })).toBeVisible()

    // 3. Open via Ctrl+K shortcut
    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()

    // 4. Press Escape to close
    await page.keyboard.press('Escape')
    await expect(palette).not.toBeVisible()
  })

  test('Command palette searches records when query length >= 2', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const palette = page.locator('.cmd-palette-modal')
    await expect(palette).toBeVisible()

    const input = page.locator('.cmd-palette-input')
    await input.fill('Line')

    // Wait for debounced search results or items
    await page.waitForTimeout(400)
    const results = page.locator('.cmd-palette-results')
    await expect(results).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(palette).not.toBeVisible()
  })
})
