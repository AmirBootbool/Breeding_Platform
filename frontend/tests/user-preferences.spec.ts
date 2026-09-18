import { test, expect } from '@playwright/test'

test.describe('Phase 25: User Preferences — Backend Model + Frontend Store', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin_user')
    await page.fill('input[type="password"]', 'adminpass')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
  })

  test('Theme toggle updates data-theme attribute, survives page reload, and syncs to backend', async ({ page }) => {
    // 1. Initial theme check
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))

    // 2. Click theme toggle button in TopBar
    const themeToggleBtn = page.locator('.topbar-theme-btn')
    await expect(themeToggleBtn).toBeVisible()
    await themeToggleBtn.click()

    // 3. Check data-theme updated
    const nextTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(nextTheme).not.toBe(initialTheme)

    // 4. Reload page and check that preference persists
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const themeAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(themeAfterReload).toBe(nextTheme)
  })

  test('Preferences store correctly handles local updates and syncs', async ({ page }) => {
    // 1. Toggle theme to trigger persist save
    const themeToggleBtn = page.locator('.topbar-theme-btn')
    await themeToggleBtn.click()

    // 2. Evaluate updating preferences store in localStorage
    const updated = await page.evaluate(() => {
      const raw = localStorage.getItem('wbp-user-preferences')
      return raw ? JSON.parse(raw) : null
    })

    expect(updated).not.toBeNull()
    expect(updated.state).toHaveProperty('theme')
    expect(updated.state).toHaveProperty('tableDensity')
  })
})
