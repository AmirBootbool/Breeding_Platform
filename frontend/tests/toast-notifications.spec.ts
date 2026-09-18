import { test, expect } from '@playwright/test'

test.describe('Phase 24: Global Toast Provider & Notification Center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin_user')
    await page.fill('input[type="password"]', 'adminpass')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
  })

  test('Notification bell is visible in TopBar, opens dropdown on click, and handles outside click / Escape', async ({ page }) => {
    // 1. Locate bell button
    const bellBtn = page.locator('.notification-bell-btn')
    await expect(bellBtn).toBeVisible()

    // 2. Click to open dropdown
    await bellBtn.click()
    const dropdown = page.locator('.notification-dropdown')
    await expect(dropdown).toBeVisible()
    await expect(dropdown.locator('h3:has-text("Notifications")')).toBeVisible()

    // 3. Press Escape to close
    await page.keyboard.press('Escape')
    await expect(dropdown).not.toBeVisible()

    // 4. Reopen and click outside to close
    await bellBtn.click()
    await expect(dropdown).toBeVisible()
    await page.click('.topbar-text h1')
    await expect(dropdown).not.toBeVisible()
  })

  test('Global Toast stack renders feedback and dismisses properly', async ({ page }) => {
    // Navigate to Germplasm
    await page.goto('/germplasm')
    await expect(page.getByRole('heading', { name: 'Germplasm Browser' })).toBeVisible()

    // Select row checkboxes if table has items
    const rows = page.locator('table.data-table tbody tr')
    const count = await rows.count()

    if (count > 0) {
      // Click first row checkbox
      const firstCheckbox = rows.first().locator('input[type="checkbox"]')
      await firstCheckbox.check()

      // The floating bulk bar appears
      const exportBtn = page.locator('button:has-text("Export CSV")')
      await expect(exportBtn).toBeVisible()

      // Click Archive
      const archiveBtn = page.locator('button:has-text("Archive")')
      await archiveBtn.click()

      // Confirm dialog appears
      const confirmBtn = page.locator('.confirm-dialog-content button.btn-primary')
      await expect(confirmBtn).toBeVisible()
      await confirmBtn.click()

      // Toast should appear in .toast-stack
      const toast = page.locator('.toast-stack .toast-item')
      await expect(toast.first()).toBeVisible({ timeout: 5000 })

      // Click toast close button
      const closeBtn = toast.first().locator('.toast-close-btn')
      await closeBtn.click()
      await expect(toast).not.toBeVisible()
    }
  })

  test('Notification center shows items and clears unread count on mark read', async ({ page }) => {
    const bellBtn = page.locator('.notification-bell-btn')
    await bellBtn.click()

    const dropdown = page.locator('.notification-dropdown')
    await expect(dropdown).toBeVisible()

    // If there is an unread badge and "Mark read" button
    const markReadBtn = page.locator('[data-testid="mark-all-read-btn"]')
    if (await markReadBtn.isVisible()) {
      await markReadBtn.click()
      const badge = page.locator('[data-testid="notification-badge"]')
      await expect(badge).not.toBeVisible()
    }

    await page.keyboard.press('Escape')
  })
})
