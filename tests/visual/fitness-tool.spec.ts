import { test, expect } from "@playwright/test";

test.describe("Fitness Test Tool Visual Regression", () => {
  test("traverses all tabs and takes screenshots for layout validation", async ({ page }) => {
    // Go to the base URL (Vite server running at http://localhost:5173)
    await page.goto("/");
    
    // Wait for the app to initialize
    await page.waitForSelector(".panel-grid, button:has-text('登入')");
    
    // Define reusable masking options for dynamic sections (e.g. today's default date, logs)
    const maskOptions = {
      mask: [
        page.locator("input[type='date']"), // Dates can change dynamically
        page.locator(".system-logs-container, .system-log-list"), // Log timestamps change
      ],
    };
    
    // Tab 1: Account Management (Default tab on load)
    await page.waitForTimeout(1000); // Wait for potential animations to settle
    await expect(page).toHaveScreenshot("01-account-tab.png", maskOptions);
    
    // Tab 2: Edit Profile (編輯檔案)
    const filesTabBtn = page.locator("button:has-text('編輯檔案'), .tab-item:has-text('編輯檔案')").first();
    await expect(filesTabBtn).toBeVisible();
    await filesTabBtn.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("02-files-tab.png", maskOptions);
    
    // Tab 3: Roster List (學員名單)
    const rosterTabBtn = page.locator("button:has-text('學員名單'), .tab-item:has-text('學員名單')").first();
    await expect(rosterTabBtn).toBeVisible();
    await rosterTabBtn.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("03-roster-tab.png", maskOptions);
    
    // Tab 4: Metric Items (測驗項目)
    const metricTabBtn = page.locator("button:has-text('測驗項目'), .tab-item:has-text('測驗項目')").first();
    await expect(metricTabBtn).toBeVisible();
    await metricTabBtn.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("04-metric-tab.png", maskOptions);
    
    // Tab 5: Test Summary Grid (測驗總表)
    const tableTabBtn = page.locator("button:has-text('測驗總表'), .tab-item:has-text('測驗總表')").first();
    await expect(tableTabBtn).toBeVisible();
    await tableTabBtn.click();
    await page.waitForSelector("table, .spreadsheet-grid, .spreadsheet-container");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("05-table-tab.png", maskOptions);
    
    // Tab 6: PDF Reports (測驗報告)
    const pdfTabBtn = page.locator("button:has-text('測驗報告'), .tab-item:has-text('測驗報告')").first();
    await expect(pdfTabBtn).toBeVisible();
    await pdfTabBtn.click();
    await page.waitForSelector("canvas, .chart-container, .pdf-preview");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("06-pdf-tab.png", maskOptions);
  });
});
