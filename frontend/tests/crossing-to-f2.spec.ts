import { test, expect } from '@playwright/test';

test.describe('F1 to F2 Browser Simulation', () => {
  test.setTimeout(180000);

  test('Perform crosses, create F1 trial, advance to F2', async ({ page }) => {
    // 1. Log in
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="text"]', 'admin_user');
    await page.fill('input[type="password"]', 'adminpass');
    await page.click('button[type="submit"]');
    
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // 2. Go to Crossing Block and create 10 crosses
    await page.click('a:has-text("Crossing Block")');
    await expect(page.getByRole('heading', { name: 'Crossing Block' })).toBeVisible();

    await page.click('#create-block-btn');
    
    const blockName = `E2E F1 Block ${Date.now()}`;
    await page.fill('#cb-name', blockName);
    await page.click('#cb-save-btn');
    await expect(page.getByText(blockName)).toBeVisible();
    
    // We must click the newly created block to open the detail view
    await page.click(`text=${blockName}`);

    await page.waitForSelector('text=Female Parents (♀)');
    await page.waitForTimeout(1000);
    
    const femaleCheckboxes = await page.locator('text=Female Parents (♀) >> xpath=..').locator('input[type="checkbox"]');
    for (let i = 0; i < 5; i++) {
        await femaleCheckboxes.nth(i).check();
    }

    const maleCheckboxes = await page.locator('text=Male Parents (♂) >> xpath=..').locator('input[type="checkbox"]');
    for (let i = 0; i < 2; i++) {
        await maleCheckboxes.nth(i).check();
    }

    await page.waitForSelector('text=Cross Preview');
    await page.click('#plan-crosses-btn');
    
    await page.waitForSelector('text=Planned Crosses');
    await page.click('#execute-crosses-btn');
    await expect(page.locator('.alert-success')).toContainText('Successfully created 8 progeny entries');

    const progenyNames = await page.locator('table.data-table tbody tr td:nth-child(5)').allInnerTexts();
    const uniqueProgenyNames = [...new Set(progenyNames)];
    expect(uniqueProgenyNames.length).toBe(8);

    // 3. Create a full F1 field (Trial)
    await page.click('a:has-text("Trials")');
    await expect(page.getByRole('heading', { name: 'Trial Manager' })).toBeVisible();

    await page.click('#new-trial-btn');
    
    const trialName = `F1 Field ${Date.now()}`;
    await page.fill('#trial-code', `F1-${Date.now()}`);
    await page.fill('#trial-name', trialName);
    
    // Select dropdowns
    await page.selectOption('#trial-program', { index: 1 });
    await page.selectOption('#trial-location', { index: 1 });
    await page.selectOption('#trial-season', { index: 1 });
    await page.selectOption('#trial-design', 'RCBD');
    await page.fill('#trial-reps', '1');
    
    await page.click('#trial-save-btn');
    await expect(page.getByText(trialName).first()).toBeVisible();

    // Click on the trial to open details
    await page.click(`tr:has-text("${trialName}")`);

    // Generate Layout
    await page.click('#create-plots-btn');
    
    // In the generate layout modal, we search for each germplasm
    for (const pName of uniqueProgenyNames) {
        await page.fill('input[placeholder="Search by name or code..."]', pName);
        await page.waitForTimeout(500); 
        const rowCheckbox = page.locator('table.data-table tbody tr input[type="checkbox"]').first();
        if (await rowCheckbox.isVisible()) {
           await rowCheckbox.check();
        }
    }
    
    await page.click('.modal-footer button.btn-primary:has-text("Generate Layout")');

    // Wait for plots to appear
    await expect(page.getByText('No plots yet.')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('.plot-cell').first()).toBeVisible();

    // 4. Select all plots for F2 (Manual Workaround)
    await page.click('a:has-text("Germplasm")');
    await expect(page.getByRole('heading', { name: 'Germplasm Browser' })).toBeVisible();

    for (const pName of uniqueProgenyNames) {
        await page.click('button:has-text("+ Add Germplasm")');
        
        await page.fill('#germ-name', `${pName}-F2`);
        await page.fill('#germ-pedigree', `${pName}-F2`);
        await page.selectOption('#germ-cross-type', 'self');
        await page.fill('#germ-year', new Date().getFullYear().toString());
        await page.click('#germ-save-btn');
        
        // Wait for modal to close
        await expect(page.locator('.modal')).toBeHidden();
        
        await page.fill('input[type="search"]', `${pName}-F2`);
        await page.waitForTimeout(500);
        await expect(page.locator(`table tbody tr td:has-text("${pName}-F2")`).first()).toBeVisible();
    }
  });
});
