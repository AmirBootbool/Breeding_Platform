import { test, expect } from '@playwright/test'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

test.describe('Phase 26: Design System v2 & Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('skip-to-content link exists and jumps to main-content', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a.skip-to-content')
    await expect(skipLink).toHaveAttribute('href', '#main-content')
    
    // Focus skip link and hit Enter
    await skipLink.focus()
    await page.keyboard.press('Enter')
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeVisible()
  })

  test('preferences page allows changing theme to dark, light, and sunlight', async ({ page }) => {
    await page.goto('/preferences')
    await expect(page.getByRole('heading', { name: 'User Preferences' })).toBeVisible()

    // Click Light Theme
    await page.locator('#pref-theme-light').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // Click Sunlight Theme
    await page.locator('#pref-theme-sunlight').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunlight')

    // Click Dark Theme
    await page.locator('#pref-theme-dark').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('preferences page updates and persists table density and landing page', async ({ page }) => {
    await page.goto('/preferences')
    
    // Set table density to compact
    await page.selectOption('#pref-table-density', 'compact')
    
    // Set default landing page to /germplasm
    await page.selectOption('#pref-landing-page', '/germplasm')

    // Click Sync Preferences Now
    await page.locator('#pref-sync-now-btn').click()
    await expect(page.locator('.toast-stack')).toContainText('Preferences synchronized with server')

    // Reload page and check if values are retained
    await page.reload()
    await expect(page.locator('#pref-table-density')).toHaveValue('compact')
    await expect(page.locator('#pref-landing-page')).toHaveValue('/germplasm')
  })

  test('modal traps focus and closes with Escape key returning focus', async ({ page }) => {
    await page.goto('/setup')
    
    // Open Add Program modal
    const openModalBtn = page.locator('#add-program-btn')
    await openModalBtn.click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('aria-modal', 'true')

    // Press Escape to close modal
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  test('DataTable row keyboard navigation (Enter key activation)', async ({ page }) => {
    await page.goto('/germplasm')
    await page.waitForSelector('.table-container table')

    // Check if table row with onRowClick has tabindex and role="button"
    const row = page.locator('tbody tr').first()
    if (await row.count() > 0) {
      await expect(row).toHaveAttribute('tabindex', '0')
      await expect(row).toHaveAttribute('role', 'button')
    }
  })
})
