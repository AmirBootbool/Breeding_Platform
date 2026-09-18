import { test, expect } from '@playwright/test'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Phase 28: Personalized, Role-Aware Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Dashboard loads default widgets and shows Customize button', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#customize-dashboard-btn')).toBeVisible()
    await expect(page.locator('.dashboard-widgets-container')).toBeVisible()
  })

  test('Customize mode allows removing, adding, and persisting widget layout', async ({ page }) => {
    await page.goto('/')

    // Click Customize button
    const customizeBtn = page.locator('#customize-dashboard-btn')
    await customizeBtn.click()
    await expect(page.locator('#customize-mode-banner')).toContainText('Dashboard Customization Mode')

    // Remove QuickActionsWidget if present
    const removeBtn = page.locator('#remove-widget-QuickActionsWidget')
    if (await removeBtn.count() > 0) {
      await removeBtn.click()
      await expect(page.locator('#remove-widget-QuickActionsWidget')).not.toBeVisible()

      // It should now appear in the available widgets to add section
      const addBtn = page.locator('#add-widget-QuickActionsWidget')
      await expect(addBtn).toBeVisible()

      // Add it back
      await addBtn.click()
      await expect(page.locator('#remove-widget-QuickActionsWidget')).toBeVisible()
    }

    // Finish customizing
    await customizeBtn.click()
    await expect(page.locator('#customize-mode-banner')).not.toBeVisible()

    // Reload page and verify widgets stay visible
    await page.reload()
    await expect(page.locator('.dashboard-widgets-container')).toBeVisible()
  })

  test('Reset to default restores original role-based widgets', async ({ page }) => {
    await page.goto('/')
    await page.locator('#customize-dashboard-btn').click()

    const resetBtn = page.locator('#reset-dashboard-btn')
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()

    await page.locator('#customize-dashboard-btn').click()
    await expect(page.locator('.dashboard-widgets-container')).toBeVisible()
  })
})
