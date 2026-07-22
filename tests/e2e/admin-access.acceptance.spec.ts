import { expect, test, type Page } from "@playwright/test";

const runAdminAcceptance = process.env.RUN_ADMIN_ACCEPTANCE === "1";
const adminUsername = process.env.ADMIN_ACCEPTANCE_USER ?? "";
const adminPassword = process.env.ADMIN_ACCEPTANCE_PASSWORD ?? "";

async function assertE2eRuntime(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-runtime", "e2e");
  await expect(page.getByTestId("e2e-runtime-banner")).toBeVisible();
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.getByTestId("auth-login-button").click();
  await page.getByTestId("auth-username-input").fill(username);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-submit-button").click();
}

async function openAdminDashboard(page: Page): Promise<void> {
  await page.getByTestId("admin-entry").click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

test.describe("Admin access acceptance contract", () => {
  test.beforeEach(async ({ page }) => {
    await assertE2eRuntime(page);

    test.skip(
      !runAdminAcceptance,
      "Set RUN_ADMIN_ACCEPTANCE=1 to activate this future-facing acceptance suite.",
    );

    test.skip(
      !adminUsername || !adminPassword,
      "Set ADMIN_ACCEPTANCE_USER and ADMIN_ACCEPTANCE_PASSWORD before running active admin acceptance tests.",
    );
  });

  test("phase 1: system administrator opens the two-card admin dashboard", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await expect(page.getByTestId("admin-current-user-role")).toContainText(
      "systemAdmin",
    );
    await expect(page.getByTestId("admin-scope-summary")).toContainText("all");
    await expect(page.getByTestId("admin-user-filter-card")).toBeVisible();
    await expect(page.getByTestId("admin-user-table-card")).toBeVisible();
  });

  test("phase 2: administrator filters users and sees matching result count", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await page.getByTestId("admin-user-keyword-input").fill("teacher");
    await page.getByTestId("admin-user-status-filter").selectOption("active");
    await page.getByTestId("admin-user-search-button").click();

    await expect(page.getByTestId("admin-user-result-count")).toContainText(
      "teacher",
    );
    await expect(page.getByTestId("admin-user-table")).toContainText("teacher");
  });

  test("phase 3: administrator opens user detail panel from the user table", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await page.getByTestId("admin-user-keyword-input").fill("teacher01");
    await page.getByTestId("admin-user-search-button").click();
    await page.getByTestId("admin-user-open-detail-button").first().click();

    await expect(page.getByTestId("admin-user-detail-panel")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-username")).toContainText(
      "teacher01",
    );
    await expect(page.getByTestId("admin-user-detail-uid")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-status")).toBeVisible();
    await expect(page.getByTestId("admin-user-detail-role")).toBeVisible();
  });

  test("phase 4: administrator creates password reset link from detail panel", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await page.getByTestId("admin-user-keyword-input").fill("teacher01");
    await page.getByTestId("admin-user-search-button").click();
    await page.getByTestId("admin-user-open-detail-button").first().click();
    await page.getByTestId("admin-password-reset-button").click();

    await expect(page.getByTestId("admin-password-reset-result")).toContainText(
      "https://",
    );
    await expect(page.getByTestId("admin-password-reset-copy-button")).toBeVisible();
    await expect(page.getByTestId("admin-user-recent-records")).toContainText(
      "passwordResetLinkCreated",
    );
  });

  test("phase 5: teacher permanent QR login pass can be used and revoked", async ({
    browser,
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await page.getByTestId("admin-user-keyword-input").fill("teacher01");
    await page.getByTestId("admin-user-search-button").click();
    await page.getByTestId("admin-user-open-detail-button").first().click();
    await page.getByTestId("admin-login-pass-create-button").click();

    const loginPassUrl = await page
      .getByTestId("admin-login-pass-result")
      .textContent();
    expect(loginPassUrl).toContain("/login-pass?p=");

    const qrPage = await browser.newPage();
    await qrPage.goto(loginPassUrl ?? "");
    await expect(qrPage.getByTestId("account-tab")).toBeVisible();

    await page.getByTestId("admin-login-pass-revoke-button").click();
    await expect(page.getByTestId("admin-user-recent-records")).toContainText(
      "loginQrUsed",
    );

    const revokedPage = await browser.newPage();
    await revokedPage.goto(loginPassUrl ?? "");
    await expect(revokedPage.getByTestId("login-pass-error-card")).toContainText(
      "revoked",
    );
  });

  test("phase 6: school alias resolves to canonical school while preserving input", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);

    await page.getByTestId("admin-school-alias-panel").click();
    await page.getByTestId("admin-school-alias-input").fill("小太陽森林");
    await page.getByTestId("admin-school-alias-save-button").click();

    await page.getByTestId("files-tab").click();
    await page.getByTestId("create-file-button").click();
    await page.getByTestId("file-school-input").fill("小太陽森林");

    await expect(page.getByTestId("admin-school-canonical-name")).toContainText(
      "小太陽森林幼兒園",
    );
    await expect(page.getByTestId("file-school-input-snapshot")).toContainText(
      "小太陽森林",
    );
  });
});
