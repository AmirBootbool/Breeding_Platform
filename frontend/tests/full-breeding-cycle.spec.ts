/**
 * full-breeding-cycle.spec.ts
 *
 * End-to-end simulation of a complete wheat breeding pipeline:
 *
 *   Phase 0  – Login
 *   Phase 1  – Create 8 parent germplasm (4 ♀ + 4 ♂ inbred F0 lines)
 *   Phase 2  – Crossing Block: 4 ♀ × 4 ♂ → 16 planned crosses → execute
 *   Phase 3  – F1 Field: create unreplicated trial, generate layout (16 F1 progeny)
 *   Phase 4  – Advance F1 → F2 (SSD, 1 selection/plot) → Send to Field
 *   Phase 5  – Advance F2 → F3 (Single Spike, 6/plot = 96 lines) → Send to Field
 *   Phase 6  – Advance F3 → F4 (SSD, 1/plot) → Send to Field
 *   Phase 7  – Advance F4 → F5 (SSD, 1/plot) → Send to Field
 *   Phase 8  – F6 Yield Trial: RCBD 3 reps, generate layout, enter observations,
 *              verify summary renders
 *   Phase 9  – F7 Yield Trial: select top lines from F6, advance, create RCBD
 *              yield trial, verify plots populated
 *
 * Run:
 *   cd frontend
 *   npx playwright test tests/full-breeding-cycle.spec.ts --reporter=html
 */

import { test, expect, Page } from '@playwright/test'

// ─── Unique suffix so repeated runs don't collide ──────────────────────────
const TS = Date.now()

// ─── Parent names ──────────────────────────────────────────────────────────
const FEMALE_PARENTS = [
  `E2E-F-Amber-${TS}`,
  `E2E-F-Bronze-${TS}`,
  `E2E-F-Copper-${TS}`,
  `E2E-F-Ember-${TS}`,
]

const MALE_PARENTS = [
  `E2E-M-Falcon-${TS}`,
  `E2E-M-Garnet-${TS}`,
  `E2E-M-Halite-${TS}`,
  `E2E-M-Indigo-${TS}`,
]

// ─── Shared state between steps ────────────────────────────────────────────
const ctx = {
  programName:  `E2E Program ${TS}`,
  seasonName:   `E2E Season ${TS}`,
  blockName:    `E2E Block ${TS}`,
  f1TrialCode:  `E2E-F1-${TS}`,
  f1TrialName:  `E2E F1 Field ${TS}`,
  f2TrialName:  `E2E F2 Seed Multiplication ${TS}`,
  f3TrialName:  `E2E F3 Families ${TS}`,
  f4TrialName:  `E2E F4 Field ${TS}`,
  f5TrialName:  `E2E F5 Field ${TS}`,
  f6TrialCode:  `E2E-F6-YT-${TS}`,
  f6TrialName:  `E2E F6 Yield Trial ${TS}`,
  f7TrialName:  `E2E F7 Yield Trial ${TS}`,
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin_user')
  await page.fill('input[type="password"]', 'adminpass')
  await page.click('button[type="submit"]')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 20_000,
  })
}

/** Navigate via sidebar NavLink */
async function goTo(page: Page, label: string) {
  const target = label === 'Trials' ? 'Trial' : label
  await page.click(`a.sidebar-link:has-text("${target}")`)
  await page.waitForLoadState('networkidle')
}

/** Create a dedicated breeding program and season in Setup */
async function createProgramAndSeason(page: Page, programName: string, seasonName: string) {
  await goTo(page, 'Setup')
  // 1. Program
  await expect(page.locator('#add-program-btn')).toBeVisible({ timeout: 15_000 })
  await page.click('#add-program-btn')
  await expect(page.locator('#prog-name')).toBeVisible({ timeout: 8_000 })
  await page.fill('#prog-name', programName)
  await page.click('#prog-save-btn')
  await expect(page.locator('.modal')).not.toBeVisible({ timeout: 12_000 })

  // 2. Season
  await page.click('.tab-btn:has-text("Seasons")')
  await expect(page.locator('#add-season-btn')).toBeVisible({ timeout: 10_000 })
  await page.click('#add-season-btn')
  await expect(page.locator('#season-name')).toBeVisible({ timeout: 8_000 })
  await page.fill('#season-name', seasonName)
  await page.selectOption('#season-program', { label: programName })
  await page.click('#season-save-btn')
  await expect(page.locator('.modal')).not.toBeVisible({ timeout: 12_000 })
}

/** Create one germplasm entry via the Add Germplasm modal */
async function createGermplasm(
  page: Page,
  name: string,
  crossType: 'self' | 'biparental' | 'backcross' | 'doubled_haploid' | 'other' | 'unknown',
  generation: number,
  programName?: string,
) {
  await page.click('#add-germplasm-btn')
  await expect(page.locator('#germ-name')).toBeVisible({ timeout: 8_000 })
  await page.fill('#germ-name', name)
  await page.selectOption('#germ-cross-type', crossType)
  await page.selectOption('#germ-generation', String(generation))
  if (programName) {
    await page.selectOption('#germ-program', { label: programName })
  }
  await page.click('#germ-save-btn')
  // Wait for modal to close
  await expect(page.locator('.modal')).not.toBeVisible({ timeout: 12_000 })
}

/** Open a trial by clicking its row in the Trial Manager table */
async function openTrialByName(page: Page, trialName: string) {
  const backBtn = page.locator('button:has-text("← Back to Trials")')
  if (await backBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await backBtn.click()
  } else {
    await goTo(page, 'Trials')
  }
  await expect(page.locator('#trial-search')).toBeVisible({ timeout: 15_000 })
  await page.fill('#trial-search', trialName)
  await page.waitForTimeout(700)
  const trialRow = page
    .locator(`table.data-table tbody tr:has-text("${trialName}")`)
    .first()
  await expect(trialRow).toBeVisible({ timeout: 15_000 })
  await trialRow.click()
  await expect(page.getByText(trialName).first()).toBeVisible({ timeout: 10_000 })
}

/**
 * In the Selections tab: select-all plots, configure method + count, click Advance.
 * Leaves the page at the "Advancement Complete!" modal open.
 */
async function advanceAllPlotsInActiveTab(
  page: Page,
  method: string,
  selectionsPerPlot: number,
) {
  // Click the Selections tab
  await page.click('.tab-btn:has-text("Selections")')
  await page.waitForTimeout(1000)

  // Click #select-all-plots-btn if present or click the thead checkbox
  const selectAllBtn = page.locator('#select-all-plots-btn')
  if (await selectAllBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await selectAllBtn.click()
  } else {
    const theadCheckbox = page
      .locator('table.data-table thead input[type="checkbox"]')
      .first()
    await expect(theadCheckbox).toBeVisible({ timeout: 10_000 })
    await theadCheckbox.click()
  }
  await page.waitForTimeout(600)

  // Set selection method dropdown
  const methodSelect = page.locator('select:has(option:text-is("Single-Seed-Descent (SSD)"))')
  if (await methodSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const methodVal = method.includes('Spike') ? 'Single Spike' : method.includes('SSD') ? 'SSD' : method
    await methodSelect.selectOption(methodVal)
  }

  // Set selections per plot
  const sppInput = page.locator('input[type="number"][min="1"]').first()
  if (await sppInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await sppInput.fill(String(selectionsPerPlot))
  }

  // Click "▶ Advance N" button (must not be Advance 0)
  const advanceBtn = page.locator('button:has-text("▶ Advance")').first()
  await expect(page.locator('button:has-text("▶ Advance 0")')).not.toBeVisible({ timeout: 10_000 })
  await expect(advanceBtn).toBeEnabled({ timeout: 10_000 })
  await advanceBtn.click()

  // Wait for "Advancement Complete!" modal
  await expect(
    page.getByRole('heading', { name: 'Advancement Complete!' }),
  ).toBeVisible({ timeout: 45_000 })
}

/**
 * In the "Advancement Complete!" modal → click "Send to New Field"
 * → fill SendToTrialModal → submit → waits for redirect to /trials
 */
async function sendToNewField(
  page: Page,
  trialName: string,
  trialCode: string,
  design: string = 'unreplicated',
  numReps: number = 1,
) {
  await page.click('button:has-text("Send to New Field")')
  await expect(page.locator('#send-trial-name')).toBeVisible({ timeout: 12_000 })

  await page.fill('#send-trial-name', trialName)
  await page.fill('#send-trial-code', trialCode)

  // Program: auto-selected on mount; pick first if blank
  const programSel = page.locator('#send-trial-program')
  if ((await programSel.inputValue()) === '') {
    const optCount = await programSel.locator('option').count()
    if (optCount > 1) await programSel.selectOption({ index: 1 })
  }

  // Location: pick first if available
  const locationSel = page.locator('#send-trial-location')
  const locOpts = await locationSel.locator('option').count()
  if (locOpts > 1) await locationSel.selectOption({ index: 1 })

  // Season: pick first if available
  const seasonSel = page.locator('#send-trial-season')
  const sesOpts = await seasonSel.locator('option').count()
  if (sesOpts > 1) await seasonSel.selectOption({ index: 1 })

  // Design type
  await page.selectOption('#send-trial-design', design)

  // Reps (hidden for unreplicated/latin_square)
  if (design !== 'unreplicated' && design !== 'latin_square') {
    const repsInput = page.locator('#send-trial-reps')
    if (await repsInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await repsInput.fill(String(numReps))
    }
  }

  // Submit
  await page.click('#send-trial-submit-btn')

  // Wait for SendToTrialModal to finish and close
  await expect(page.locator('.modal')).not.toBeVisible({ timeout: 45_000 })

  // If we are still inside TrialDetail ("← Back to Trials" button visible), click back
  const backBtn = page.locator('button:has-text("← Back to Trials")')
  if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await backBtn.click()
  } else {
    await goTo(page, 'Trials')
  }

  await expect(page.locator('#trial-search')).toBeVisible({ timeout: 45_000 })

  // Search for the trial name so the table filters to it
  await page.fill('#trial-search', trialName)
  await page.waitForTimeout(700)
  await expect(
    page.locator(`table.data-table tbody tr:has-text("${trialName}")`).first(),
  ).toBeVisible({ timeout: 20_000 })
}

/** Complete the 5-step MapCreationWizard modal */
async function completeMapWizard(page: Page) {
  const nextBtn = page.locator('.modal-footer button:has-text("Next Step")')

  // Step 1: Design selection -> Next
  await expect(nextBtn).toBeVisible({ timeout: 10_000 })
  await expect(nextBtn).toBeEnabled({ timeout: 10_000 })
  await nextBtn.click()
  await page.waitForTimeout(600)

  // Step 2: Deselect founders (rows without ' / ') so only the 16 F1 progeny are placed in the trial
  const founderCheckboxes = page.locator('.modal table.data-table tbody tr:not(:has-text(" / ")) input[type="checkbox"]')
  const founderCount = await founderCheckboxes.count()
  for (let i = 0; i < founderCount; i++) {
    const chk = founderCheckboxes.nth(i)
    if (await chk.isChecked()) {
      await chk.uncheck()
    }
  }
  await page.waitForTimeout(300)

  // Step 2 -> Step 3 -> Step 4 -> Step 5
  for (let s = 2; s <= 4; s++) {
    await expect(nextBtn).toBeVisible({ timeout: 10_000 })
    await expect(nextBtn).toBeEnabled({ timeout: 10_000 })
    await nextBtn.click()
    await page.waitForTimeout(500)
  }

  // Step 5: Click "Generate Field Map"
  const generateBtn = page.locator('.modal-footer button:has-text("Generate Field Map")')
  await expect(generateBtn).toBeVisible({ timeout: 10_000 })
  await expect(generateBtn).toBeEnabled({ timeout: 10_000 })
  await generateBtn.click()

  // Wait for wizard modal to close
  await expect(page.locator('.modal')).not.toBeVisible({ timeout: 35_000 })
}

// ═══════════════════════════════════════════════════════════════════════════
//  THE TEST
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Full Wheat Breeding Cycle — Crossing → F7 Yield Trial', () => {
  test.setTimeout(600_000) // 10-minute budget

  test('Complete 7-generation breeding pipeline', async ({ page }) => {

    // ── Phase 0: Login & Setup ────────────────────────────────────────────
    await test.step('Phase 0: Login and create dedicated breeding program & season', async () => {
      await login(page)
      await createProgramAndSeason(page, ctx.programName, ctx.seasonName)
    })

    // ── Phase 1: Create 8 parent germplasm ─────────────────────────────────
    await test.step('Phase 1: Create 8 parent germplasm (4 ♀ inbred + 4 ♂ inbred F0)', async () => {
      await goTo(page, 'Germplasm')
      await expect(page.getByRole('heading', { name: 'Germplasm Browser' })).toBeVisible()

      for (const name of [...FEMALE_PARENTS, ...MALE_PARENTS]) {
        await createGermplasm(page, name, 'self', 0, ctx.programName)
      }

      // Spot-check: first female parent appears in table
      await page.fill('#germplasm-search', FEMALE_PARENTS[0])
      await page.waitForTimeout(700)
      await expect(
        page.locator(`table.data-table tbody tr td:has-text("${FEMALE_PARENTS[0]}")`).first(),
      ).toBeVisible({ timeout: 10_000 })

      await page.fill('#germplasm-search', '')
      await page.waitForTimeout(400)
    })

    // ── Phase 2: Crossing Block — 16 crosses ───────────────────────────────
    await test.step('Phase 2: Create Crossing Block and execute 16 crosses (4♀ × 4♂)', async () => {
      await goTo(page, 'Crossing Block')
      await expect(
        page.getByRole('heading', { name: 'Crossing Block & Matrix' }),
      ).toBeVisible({ timeout: 10_000 })

      // Create block
      await page.click('#create-block-btn')
      await expect(page.locator('#cb-name')).toBeVisible()
      await page.fill('#cb-name', ctx.blockName)
      await page.selectOption('#cb-program', { label: ctx.programName })
      await page.click('#cb-save-btn')
      await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10_000 })

      // Open the block detail
      await page.click(`table.data-table tbody tr:has-text("${ctx.blockName}")`)
      await page.waitForTimeout(2000) // germplasm loads

      // ── Select 4 female parents ──────────────────────────────────────────
      // The two GermplasmPanel cards have search inputs and checkboxes
      // Female panel is the first card (left side)
      const femaleCard = page.locator('.card').filter({ hasText: 'Female Parents (♀)' }).first()
      const femaleSearch = femaleCard.locator('input[type="search"]')

      for (const name of FEMALE_PARENTS) {
        await femaleSearch.fill(name)
        await page.waitForTimeout(600)
        const chk = femaleCard
          .locator(`label:has-text("${name}") input[type="checkbox"]`)
          .first()
        await expect(chk).toBeVisible({ timeout: 10_000 })
        await chk.check()
      }
      await femaleSearch.fill('')
      await page.waitForTimeout(400)

      // ── Select 4 male parents ────────────────────────────────────────────
      const maleCard = page.locator('.card').filter({ hasText: 'Male Parents (♂)' }).first()
      const maleSearch = maleCard.locator('input[type="search"]')

      for (const name of MALE_PARENTS) {
        await maleSearch.fill(name)
        await page.waitForTimeout(600)
        const chk = maleCard
          .locator(`label:has-text("${name}") input[type="checkbox"]`)
          .first()
        await expect(chk).toBeVisible({ timeout: 10_000 })
        await chk.check()
      }
      await maleSearch.fill('')
      await page.waitForTimeout(600)

      // Cross preview should show 16 planned crosses
      await expect(
        page.locator('.card-title:has-text("Cross Preview")'),
      ).toBeVisible({ timeout: 8_000 })
      // The subtitle reads "Cross Preview — 16 planned crosses"
      await expect(
        page.locator('text=/Cross Preview.*16 planned/i'),
      ).toBeVisible({ timeout: 8_000 })

      // Plan crosses
      await page.click('#plan-crosses-btn')
      await page.waitForTimeout(3000)

      // After planning, planned crosses tab appears
      await expect(
        page.locator('button:has-text("Planned Crosses (16)")'),
      ).toBeVisible({ timeout: 20_000 })

      // Verify Diallel / Cross Matrix visualizer tab
      const matrixTabBtn = page.locator('button:has-text("Diallel / Cross Matrix")')
      await expect(matrixTabBtn).toBeVisible({ timeout: 5_000 })
      await matrixTabBtn.click()
      await expect(
        page.locator('text=/Diallel Cross Matrix/i'),
      ).toBeVisible({ timeout: 5_000 })
      await expect(
        page.locator('.card table.data-table').first(),
      ).toBeVisible({ timeout: 5_000 })

      // Switch back to planned crosses table tab to execute
      await page.click('button:has-text("Planned Crosses")')
      await page.waitForTimeout(500)

      // Execute all crosses
      await page.click('#execute-crosses-btn')

      // Success alert: "Successfully created 16 progeny entries"
      await expect(
        page.locator('.alert-success'),
      ).toBeVisible({ timeout: 30_000 })

      const alertText = await page.locator('.alert-success').innerText()
      expect(alertText).toMatch(/16/)
    })

    // ── Phase 3: F1 Field ──────────────────────────────────────────────────
    await test.step('Phase 3: Create F1 Field (unreplicated) and generate layout', async () => {
      await goTo(page, 'Trials')
      await page.click('#new-trial-btn')
      await expect(page.locator('#trial-code')).toBeVisible()

      await page.fill('#trial-code', ctx.f1TrialCode)
      await page.fill('#trial-name', ctx.f1TrialName)

      // Program
      await page.selectOption('#trial-program', { label: ctx.programName })
      await page.waitForTimeout(600)

      // Location
      const triLoc = page.locator('#trial-location')
      await expect(triLoc.locator('option')).not.toHaveCount(1, { timeout: 10_000 })
      await triLoc.selectOption({ index: 1 })

      // Season
      await page.selectOption('#trial-season', { label: `${ctx.seasonName} (${new Date().getFullYear()})` }).catch(async () => {
        const triSeason = page.locator('#trial-season')
        const seasonCount = await triSeason.locator('option').count()
        if (seasonCount > 1) {
          await triSeason.selectOption({ index: 1 })
        }
      })

      // Design: unreplicated
      await page.selectOption('#trial-design', 'unreplicated')

      // Save
      await page.click('#trial-save-btn')
      await expect(page.locator('.modal')).not.toBeVisible({ timeout: 15_000 })

      // Navigate into the newly created F1 trial
      await openTrialByName(page, ctx.f1TrialName)

      // Generate layout (MapCreationWizard opens)
      await expect(page.locator('#create-plots-btn')).toBeVisible({ timeout: 10_000 })
      await page.click('#create-plots-btn')

      // Complete the 5-step wizard
      await completeMapWizard(page)

      // Generate Layout button disappears; plots appear
      await expect(page.locator('#create-plots-btn')).not.toBeVisible({ timeout: 25_000 })

      // Verify Trial Map tab shows plot cards / grid
      await page.click('.tab-btn:has-text("Trial Map")')
      await page.waitForTimeout(1000)
      const plotCell = page.locator('.plot-card, .plot-grid-container, [class*="plot-"]').first()
      await expect(plotCell).toBeVisible({ timeout: 15_000 })
    })

    // ── Phase 4: F1 → F2 ─────────────────────────────────────────────────
    await test.step('Phase 4: Advance F1 → F2 (SSD, 1 selection/plot)', async () => {
      // Still inside F1 trial detail — go directly to selections tab
      await advanceAllPlotsInActiveTab(page, 'SSD', 1)

      const successText = await page
        .locator('[role="dialog"] p, .modal p')
        .first()
        .innerText()
      expect(successText).toMatch(/new germplasm/)

      await sendToNewField(page, ctx.f2TrialName, `E2E-F2-${TS}`, 'unreplicated', 1)
    })

    // ── Phase 5: F2 → F3 (6 spikes per family) ───────────────────────────
    await test.step('Phase 5: Advance F2 → F3 (Single Spike, 6/plot → 96 F3 lines)', async () => {
      await openTrialByName(page, ctx.f2TrialName)
      await advanceAllPlotsInActiveTab(page, 'Single Spike', 6)

      const successText = await page
        .locator('[role="dialog"] p, .modal p')
        .first()
        .innerText()
      expect(successText).toMatch(/new germplasm/)
      // Should have created 16 families × 6 spikes = 96
      expect(successText).toMatch(/96/)

      await sendToNewField(page, ctx.f3TrialName, `E2E-F3-${TS}`, 'unreplicated', 1)
    })

    // ── Phase 6: F3 → F4 ─────────────────────────────────────────────────
    await test.step('Phase 6: Advance F3 → F4 (SSD, 1 selection/plot)', async () => {
      await openTrialByName(page, ctx.f3TrialName)
      await advanceAllPlotsInActiveTab(page, 'SSD', 1)

      await sendToNewField(page, ctx.f4TrialName, `E2E-F4-${TS}`, 'unreplicated', 1)
    })

    // ── Phase 7: F4 → F5 ─────────────────────────────────────────────────
    await test.step('Phase 7: Advance F4 → F5 (SSD, 1 selection/plot)', async () => {
      await openTrialByName(page, ctx.f4TrialName)
      await advanceAllPlotsInActiveTab(page, 'SSD', 1)

      await sendToNewField(page, ctx.f5TrialName, `E2E-F5-${TS}`, 'unreplicated', 1)
    })

    // ── Phase 8: F5 → F6 Yield Trial ─────────────────────────────────────
    await test.step('Phase 8: Advance F5 → F6, create RCBD Yield Trial, enter observations', async () => {
      await openTrialByName(page, ctx.f5TrialName)
      await advanceAllPlotsInActiveTab(page, 'SSD', 1)

      // This time create an RCBD yield trial with 3 reps
      await sendToNewField(page, ctx.f6TrialName, ctx.f6TrialCode, 'RCBD', 3)

      // Open F6 trial
      await openTrialByName(page, ctx.f6TrialName)

      // Navigate to Data tab (ObservationGrid)
      await page.click('.tab-btn:has-text("Data")')
      await page.waitForTimeout(2000)

      // Enter yield observations for the first two numeric input cells (if variables exist)
      const numericCells = page.locator('table input[type="number"]')
      const numericCount = await numericCells.count()
      if (numericCount > 0) {
        await numericCells.first().fill('4')
        if (numericCount > 1) await numericCells.nth(1).fill('3')

        // Save
        const saveBtn = page
          .locator('button:has-text("Save Observations"), button:has-text("Save All"), button:has-text("Submit")')
          .first()
        if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await saveBtn.click()
          await expect(page.locator('.alert-success').first()).toBeVisible({
            timeout: 15_000,
          })
        }
      }

      // Navigate to Summary tab — chart must render
      await page.click('.tab-btn:has-text("Summary")')
      await page.waitForTimeout(2000)
      await expect(page.locator('.tab-btn.active:has-text("Summary")')).toBeVisible()
      // SummaryChart renders recharts or shows empty state
      const summaryChild = page.locator('.recharts-responsive-container, .recharts-surface, .empty-state, text:has-text("No numeric observations")').first()
      await expect(summaryChild).toBeVisible({ timeout: 10_000 })

      // Navigate to Pedigree tab — verify unique lines and open PedigreeTreeModal
      await page.click('.tab-btn:has-text("Pedigree")')
      await page.waitForTimeout(1000)
      await expect(page.locator('text=/Pedigree.*unique lines/i')).toBeVisible({ timeout: 8_000 })

      // Click the first tree visualizer button (🌳)
      const treeBtn = page.locator('.card button:has-text("🌳")').first()
      if (await treeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await treeBtn.click()
        const closeBtn = page.locator('#pedigree-close-btn')
        await expect(closeBtn).toBeVisible({ timeout: 8_000 })
        await closeBtn.click()
      }
    })

    // ── Phase 9: F7 Yield Trial ───────────────────────────────────────────
    await test.step('Phase 9: Select top 10 lines from F6, create F7 Yield Trial', async () => {
      await openTrialByName(page, ctx.f6TrialName)

      // Go to Selections tab
      await page.click('.tab-btn:has-text("Selections")')
      await page.waitForTimeout(1000)

      // Select first 10 plot checkboxes (or fewer if there are less)
      const plotCheckboxes = page.locator('table.data-table tbody input[type="checkbox"]')
      await expect(plotCheckboxes.first()).toBeVisible({ timeout: 12_000 })
      const plotCount = await plotCheckboxes.count()
      const toSelect = Math.min(plotCount, 10)

      for (let i = 0; i < toSelect; i++) {
        await plotCheckboxes.nth(i).check()
      }

      // Advance
      const advanceBtn = page.locator('button:has-text("▶ Advance")').first()
      await expect(advanceBtn).toBeEnabled({ timeout: 5_000 })
      await advanceBtn.click()

      await expect(
        page.getByRole('heading', { name: 'Advancement Complete!' }),
      ).toBeVisible({ timeout: 45_000 })

      // Create RCBD F7 yield trial
      await sendToNewField(page, ctx.f7TrialName, `E2E-F7-YT-${TS}`, 'RCBD', 3)

      // Verify F7 trial in the list
      await expect(
        page.locator(`table.data-table tbody tr:has-text("${ctx.f7TrialName}")`).first(),
      ).toBeVisible({ timeout: 15_000 })

      // Open F7 and verify it has plots (SendToTrialModal creates them immediately)
      await openTrialByName(page, ctx.f7TrialName)

      // "Generate Layout" button should NOT be present (plots already created)
      await expect(page.locator('#create-plots-btn')).not.toBeVisible({ timeout: 8_000 })

      // Trial Map tab should show plot cards / grid
      await page.click('.tab-btn:has-text("Trial Map")')
      await page.waitForTimeout(1200)
      const f7PlotCells = page.locator('.plot-card, .plot-grid-container, [class*="plot-"]').first()
      await expect(f7PlotCells).toBeVisible({ timeout: 15_000 })

      // Final sanity: back to trial list, both F6 and F7 are present
      const backBtn = page.locator('button:has-text("← Back to Trials")')
      if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await backBtn.click()
      } else {
        await goTo(page, 'Trials')
      }
      await expect(page.locator('#trial-search')).toBeVisible({ timeout: 15_000 })
      await page.fill('#trial-search', String(TS))
      await page.waitForTimeout(700)

      await expect(
        page.locator(`table.data-table tbody tr:has-text("${ctx.f6TrialName}")`).first(),
      ).toBeVisible({ timeout: 10_000 })
      await expect(
        page.locator(`table.data-table tbody tr:has-text("${ctx.f7TrialName}")`).first(),
      ).toBeVisible({ timeout: 10_000 })
    })
  })
})
