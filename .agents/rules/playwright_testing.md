---
description: Guidelines for writing automated Playwright E2E tests for the Wheat Breeding Platform.
---

# E2E Testing Guidelines (Playwright)

When writing automated browser tests for this workspace using Playwright, always adhere to the following learned conclusions and rules to prevent timeouts and flaky tests:

## 1. Authentication & Roles
- **Correct Credentials**: The test database is seeded with specific users by role. Do NOT use `admin`/`admin`. 
- **Admin**: `admin_user` / `adminpass`
- **Breeder**: `breeder_user` / `breederpass`
- **Technician**: `technician_user` / `technicianpass`
- **Viewer**: `viewer_user` / `viewerpass`

## 2. React State & List vs. Detail Views
- **Implicit Navigation**: After submitting forms (like creating a Crossing Block or a Trial), the UI often redirects to a "List View" (table) rather than automatically opening the newly created record. 
- **Required Action**: You MUST explicitly click on the newly created record in the table to open its detail view before asserting on detail-specific elements.
  - *Example*: `await page.click(\`text=${blockName}\`)`

## 3. Dynamic Assertions & Data Rules
- **Self-Cross Exclusion**: The backend crossing logic intentionally skips self-crosses. If a test selects overlapping parents (e.g., selecting the first 5 females and first 2 males from the identical germplasm list), do not hardcode the expected cross count without accounting for the overlap.
- **Text Matching**: Use `.toContainText()` instead of exact text matches (`.getByText()`) for success messages or alerts, as dynamic values and icons often split text across multiple HTML nodes (e.g., `<strong>`).

## 4. CSS Selectors for Complex UI
- **Trial Manager Grid**: The plot cells in the Trial Manager grid use the CSS class `.plot-cell`, NOT `.plot-box`. Always verify CSS classes in the React components before using them as locators.
- **Modals & Overlays**: Always wait for modals to close (`await expect(page.locator('.modal')).toBeHidden()`) before attempting to click elements underneath them.
- **Form Inputs**: Target form inputs using their exact `id` (e.g., `#germ-name`, `#germ-cross-type`) rather than `name` attributes, as the frontend heavily relies on IDs for input elements.

## 5. Architectural Testing Guidelines (For Future Development)
To ensure E2E tests remain robust, fast, and scalable as the platform grows, strictly follow these architectural best practices:

- **Use `data-testid` Attributes**: Refactor brittle CSS/text locators by injecting `data-testid="..."` attributes directly into React components. Use Playwright's `page.getByTestId()` as the primary locator strategy.
- **State Seeding via API**: Avoid using the UI to set up complex prerequisites (e.g., clicking through F1, F2 to get to F3). Use Playwright's `APIRequestContext` or Django backend scripts to instantly seed the necessary state in the database, reserving the UI interactions *only* for the specific feature being tested.
- **Page Object Model (POM)**: Move away from imperative procedural scripts. Encapsulate page-specific locators and actions (e.g., `CrossingBlockPage`, `TrialManagerPage`) into classes to DRY up tests and isolate UI changes.
- **Component-Level Testing (Playwright CT)**: For highly interactive isolated components (like the Dual-Panel Germplasm selector), mount them via Playwright Component Testing with mocked props instead of spinning up the entire backend stack.
- **Data Isolation & Parallelism**: Ensure every test generates globally unique identifiers (e.g., appending `Date.now()`) for test data, and cleanly deletes generated resources in `test.afterEach()` to avoid collisions when tests run in parallel.
