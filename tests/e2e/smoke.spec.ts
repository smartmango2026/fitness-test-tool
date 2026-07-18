import { expect, test } from "@playwright/test";

test.describe("E2E entry smoke", () => {
  test("loads the isolated E2E app and exposes stable controls", async ({ page }) => {
    await page.goto("./");

    await expect(page.getByTestId("e2e-runtime-banner")).toContainText("E2E 測試環境");
    await expect(page.getByTestId("auth-login-button")).toBeVisible();
    await expect(page.getByTestId("auth-register-button")).toBeVisible();

    await expect(page.getByTestId("account-tab")).toBeVisible();
    await expect(page.getByTestId("files-tab")).toBeVisible();
    await expect(page.getByTestId("roster-tab")).toBeVisible();
    await expect(page.getByTestId("metric-tab")).toBeVisible();
    await expect(page.getByTestId("summary-tab")).toBeVisible();
    await expect(page.getByTestId("pdf-tab")).toBeVisible();
    await expect(page.getByTestId("change-password-card")).toBeVisible();
  });

  test("keeps experimental password change hidden from the production entry", async ({
    page,
  }) => {
    await page.goto("../");

    await expect(page.getByTestId("change-password-card")).toHaveCount(0);
  });

  test("opens the registration form without writing data", async ({ page }) => {
    await page.goto("./");

    await page.getByTestId("auth-register-button").click();

    await expect(page.getByRole("heading", { name: "建立帳號" })).toBeVisible();
    await expect(page.getByTestId("auth-username-input")).toBeVisible();
    await expect(page.getByTestId("auth-password-input")).toBeVisible();
    await expect(page.getByTestId("auth-submit-button")).toHaveText("註冊");
  });
});
