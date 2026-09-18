import { test, expect } from '@playwright/test';

test.describe('Breeding Cycle 7-Generation Simulation', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app and login
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="text"]', 'admin_user');
    await page.fill('input[type="password"]', 'adminpass');
    await page.click('button[type="submit"]');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('Perform full breeding cycle and check for bugs', async ({ page }) => {
    test.setTimeout(120000);

    // 1. Create Base Lines (F0)
    await page.goto('http://localhost:5173/germplasm');
    await expect(page.getByRole('heading', { name: 'Germplasm Browser' })).toBeVisible();

    const ts = Date.now();
    const baseLines = [`Base Line A ${ts}`, `Base Line B ${ts}`];
    
    for (const line of baseLines) {
      await page.click('#add-germplasm-btn');
      await expect(page.locator('#germ-name')).toBeVisible();
      await page.fill('#germ-name', line);
      await page.selectOption('#germ-program', { index: 0 });
      await page.selectOption('#germ-cross-type', 'self');
      await page.click('#germ-save-btn');
      await expect(page.locator('#germ-name')).not.toBeVisible();
    }

    // 2. F1 Cross
    const crossName = `A/B F1 ${ts}`;
    await page.click('#add-germplasm-btn');
    await expect(page.locator('#germ-name')).toBeVisible();
    await page.fill('#germ-name', crossName);
    await page.selectOption('#germ-program', { index: 0 });
    await page.selectOption('#germ-cross-type', 'biparental');
    await page.selectOption('#germ-female', { index: 1 });
    await page.selectOption('#germ-male', { index: 2 });
    await page.click('#germ-save-btn');
    await expect(page.locator('#germ-name')).not.toBeVisible();

    // 3. Create F1 Trial
    await page.goto('http://localhost:5173/trials');
    await expect(page.getByRole('heading', { name: 'Trial Manager' })).toBeVisible();

    await page.click('text=+ New Trial');
    await page.fill('#trial-name', `F1 Trial ${ts}`);
    await page.fill('#trial-code', `F1-${ts}`);
    await page.selectOption('#trial-program', { index: 1 });
    await page.selectOption('#trial-location', { index: 1 });
    await page.selectOption('#trial-season', { index: 1 });
    await page.click('#trial-save-btn');
    await page.fill('#trial-search', `F1 Trial ${ts}`);
    await expect(page.locator(`tr:has-text("F1 Trial ${ts}")`).first()).toBeVisible();

    // Observation Entry
    await page.goto('http://localhost:5173/observations');
    await expect(page.getByRole('heading', { name: 'Observation Entry' })).toBeVisible();
  });
});
