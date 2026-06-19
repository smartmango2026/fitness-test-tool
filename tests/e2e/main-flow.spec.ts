import { expect, test } from "@playwright/test";

test.describe("E2E main teacher flow", () => {
  // Safety guard: abort the entire suite if we are not running against the
  // isolated E2E entry point with a properly configured test Firebase project.
  // This prevents accidental writes to the production database.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("./");

    // 1. Confirm the page is the E2E entry (data-runtime="e2e" on <html>)
    const runtime = await page.locator("html").getAttribute("data-runtime");
    if (runtime !== "e2e") {
      await page.close();
      throw new Error(
        `🛑 Safety abort: expected data-runtime="e2e" but got "${runtime}". ` +
        `Check that baseURL in playwright.config.ts points to /e2e/.`,
      );
    }

    // 2. Confirm the E2E Firebase project is configured (not the placeholder)
    const bannerText = await page.getByTestId("e2e-runtime-banner").textContent();
    if (!bannerText || bannerText.includes("not-configured")) {
      await page.close();
      throw new Error(
        `🛑 Safety abort: E2E Firebase is not configured. ` +
        `Set VITE_E2E_FIREBASE_* environment variables before running write tests.`,
      );
    }

    await page.close();
  });

  test("registers, creates a file, edits roster, and reaches report pages", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    const unique = Date.now().toString(36);
    const username = `e2e_${unique}`;
    const rosterName = `E2E測試班${unique}`;

    await page.goto("./");

    await page.getByTestId("auth-register-button").click();
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill("test1234");
    await page.getByTestId("auth-submit-button").click();

    await expect(page.getByText(`帳號：${username}`)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("files-tab").click();
    await page.getByTestId("create-file-button").click();
    await expect(page.getByTestId("create-file-form")).toBeVisible();

    await page.getByTestId("file-name-input").fill(rosterName);
    await page.getByTestId("file-grade-select").selectOption("大班");
    await page.getByTestId("file-size-input").fill("2");
    await page.getByTestId("file-create-submit").click();

    await expect(page.getByTestId("current-file-card")).toContainText(rosterName, {
      timeout: 20_000,
    });

    await page.getByTestId("roster-tab").click();
    await expect(page.getByTestId("roster-sheet")).toBeVisible();

    await page.locator('[data-roster-cell="0:0"] .sheet-cell').click();
    await page.locator('[data-roster-cell="0:0"] input').fill("測試小明");
    await page.keyboard.press("Enter");
    await page.locator('[data-roster-cell="1:0"] input').fill("測試小華");
    await page.keyboard.press("Enter");

    await page.getByTestId("roster-save-button").click();
    await expect(page.getByTestId("roster-save-button")).toBeEnabled({ timeout: 20_000 });

    await page.getByTestId("metric-tab").click();
    await expect(page.getByTestId("metric-item-select")).toBeVisible();
    await expect(page.getByTestId("metric-sheet")).toBeVisible();

    await page.getByTestId("metric-sheet").locator(".nmp-cell-interactive").first().click();
    await page.locator(".nmp-input, .nmp-select").first().fill("3");
    await page.keyboard.press("Enter");
    await page.getByTestId("metric-save-button").click();

    await page.getByTestId("summary-tab").click();
    await expect(page.getByTestId("summary-sheet")).toBeVisible();

    await page.getByTestId("pdf-tab").click();
    await expect(page.getByTestId("pdf-student-select")).toBeVisible();
    await expect(page.getByTestId("pdf-report-preview")).toBeVisible();
    await expect(page.getByTestId("pdf-download-all-button")).toBeVisible();
  });
});
