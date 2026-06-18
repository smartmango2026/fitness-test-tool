import { expect, test } from "@playwright/test";

test.describe("metric rule set rendering", () => {
  test("splits mixed-age jump metric into grade-specific containers", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    const unique = Date.now().toString(36);
    const username = `e2e_rule_${unique}`;
    const rosterName = `E2E混齡測試${unique}`;

    await page.goto("./");

    await page.getByTestId("auth-register-button").click();
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill("test1234");
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByText(`帳號：${username}`)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("files-tab").click();
    await page.getByTestId("create-file-button").click();
    await page.getByTestId("file-name-input").fill(rosterName);
    await page.getByTestId("file-grade-select").selectOption("混齡班");
    await page.getByTestId("file-size-input").fill("2");
    await page.getByTestId("file-create-submit").click();
    await expect(page.getByTestId("current-file-card")).toContainText(rosterName, {
      timeout: 20_000,
    });

    await page.getByTestId("roster-tab").click();
    await expect(page.getByTestId("roster-sheet")).toBeVisible();

    await page.locator('[data-roster-cell="0:0"] .sheet-cell').click();
    await page.locator('[data-roster-cell="0:0"] input').fill("小班學生");
    await page.keyboard.press("Enter");
    await page.locator('[data-roster-cell="0:3"] .sheet-cell').click();
    await page.locator('[data-roster-cell="0:3"] select').selectOption("小班");

    await page.locator('[data-roster-cell="1:0"] .sheet-cell').click();
    await page.locator('[data-roster-cell="1:0"] input').fill("大班學生");
    await page.keyboard.press("Enter");
    await page.locator('[data-roster-cell="1:3"] .sheet-cell').click();
    await page.locator('[data-roster-cell="1:3"] select').selectOption("大班");

    await page.getByTestId("roster-save-button").click();
    await page.getByTestId("metric-tab").click();
    await expect(page.getByTestId("metric-sheet")).toBeVisible();

    await page.getByTestId("metric-item-option").last().click();

    await expect(page.getByTestId("metric-group-viewport")).toHaveCount(2);
    await expect(page.getByText("雙腳跳").first()).toBeVisible();
    await expect(page.getByText("單腳跳").first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /左腳/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /右腳/ })).toBeVisible();

    await page.getByTestId("summary-tab").click();
    await expect(page.getByTestId("summary-group-viewport")).toHaveCount(2);
    await expect(page.getByRole("columnheader", { name: "左腳" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "右腳" })).toBeVisible();
  });
});
