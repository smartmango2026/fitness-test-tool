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

  test("phase 1: system administrator sees admin dashboard and permission summary", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);

    await page.getByTestId("admin-tab").click();
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await expect(page.getByTestId("admin-current-user-role")).toContainText(
      "systemAdmin",
    );
    await expect(page.getByTestId("admin-permission-summary")).toContainText(
      "all accounts",
    );
  });

  test("phase 2: system administrator assigns a school account administrator", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await page.getByTestId("admin-tab").click();

    await page.getByTestId("admin-schools-panel").click();
    await page.getByTestId("admin-school-create-button").click();
    await page.getByTestId("admin-school-name-input").fill("E2E 驗收幼兒園");
    await page.getByTestId("admin-school-save-button").click();

    await page.getByTestId("admin-school-member-add-button").click();
    await page.getByTestId("admin-school-member-username-input").fill(
      "e2e_school_admin",
    );
    await page
      .getByTestId("admin-school-member-role-select")
      .selectOption("schoolAccountAdmin");
    await page.getByTestId("admin-school-member-save-button").click();

    await expect(page.getByTestId("admin-user-table")).toContainText(
      "e2e_school_admin",
    );
    await expect(page.getByTestId("admin-audit-log-list")).toContainText(
      "schoolMemberRoleChanged",
    );
  });

  test("phase 3: school account administrator scope is limited to assigned schools", async ({
    browser,
  }) => {
    const systemAdminPage = await browser.newPage();
    await assertE2eRuntime(systemAdminPage);
    await login(systemAdminPage, adminUsername, adminPassword);
    await systemAdminPage.getByTestId("admin-tab").click();
    await expect(systemAdminPage.getByTestId("admin-user-table")).toContainText(
      "teacher",
    );

    const schoolAdminPage = await browser.newPage();
    await assertE2eRuntime(schoolAdminPage);
    await login(
      schoolAdminPage,
      process.env.SCHOOL_ADMIN_ACCEPTANCE_USER ?? "e2e_school_admin",
      process.env.SCHOOL_ADMIN_ACCEPTANCE_PASSWORD ?? "test1234",
    );
    await schoolAdminPage.getByTestId("admin-tab").click();

    await expect(schoolAdminPage.getByTestId("admin-scope-badge")).toContainText(
      "school",
    );
    await expect(schoolAdminPage.getByTestId("admin-user-table")).toContainText(
      "e2e_school_teacher",
    );
    await expect(schoolAdminPage.getByTestId("admin-user-table")).not.toContainText(
      "e2e_other_school_teacher",
    );
  });

  test("phase 4: administrator creates a password reset link and audit log", async ({
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await page.getByTestId("admin-tab").click();

    await page.getByTestId("admin-user-search-input").fill("e2e_school_teacher");
    await page.getByTestId("admin-password-reset-button").click();

    await expect(page.getByTestId("admin-password-reset-result")).toContainText(
      "https://",
    );
    await expect(page.getByTestId("admin-password-reset-copy-button")).toBeVisible();
    await expect(page.getByTestId("admin-audit-log-list")).toContainText(
      "passwordResetLinkCreated",
    );
  });

  test("phase 5: teacher permanent QR login pass can be used and revoked", async ({
    browser,
    page,
  }) => {
    await login(page, adminUsername, adminPassword);
    await page.getByTestId("admin-tab").click();
    await page.getByTestId("admin-user-search-input").fill("e2e_school_teacher");
    await page.getByTestId("admin-login-pass-create-button").click();

    const loginPassUrl = await page
      .getByTestId("admin-login-pass-result")
      .textContent();
    expect(loginPassUrl).toContain("/login-pass?p=");

    const qrPage = await browser.newPage();
    await qrPage.goto(loginPassUrl ?? "");
    await expect(qrPage.getByTestId("account-tab")).toBeVisible();

    await page.getByTestId("admin-login-pass-revoke-button").click();
    await expect(page.getByTestId("admin-audit-log-list")).toContainText(
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
    await page.getByTestId("admin-tab").click();

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
