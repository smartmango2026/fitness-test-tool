import { expect, test, type Browser, type Page } from "@playwright/test";

const runPasswordResetFlow = process.env.RUN_PASSWORD_RESET_E2E === "1";
const adminUsername = process.env.PASSWORD_RESET_ADMIN_USERNAME ?? "";
const adminPassword = process.env.PASSWORD_RESET_ADMIN_PASSWORD ?? "";
const deployedE2eOrigin = "https://smartmango2026.github.io";

async function assertHostedE2eRuntime(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-runtime", "e2e");
  await expect(page.getByTestId("e2e-runtime-banner")).toContainText(
    "fitness-test-tool-e2e",
  );
}

async function openLoginPanel(page: Page): Promise<void> {
  if (await page.getByTestId("auth-username-input").isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId("auth-login-button").click();
  await expect(page.getByTestId("auth-username-input")).toBeVisible();
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await openLoginPanel(page);
  await page.getByTestId("auth-username-input").fill(username);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("account-menu-button")).toContainText(username, {
    timeout: 20_000,
  });
}

async function registerTestTeacher(page: Page, username: string, password: string): Promise<void> {
  await assertHostedE2eRuntime(page);
  await page.getByTestId("auth-register-button").click();
  await page.getByTestId("auth-username-input").fill(username);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-submit-button").click();
  await expect(page.getByTestId("account-menu-button")).toContainText(username, {
    timeout: 20_000,
  });
}

async function openAdminDashboard(page: Page): Promise<void> {
  await page.getByTestId("account-menu-button").click();
  await page.getByTestId("admin-entry").click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

async function openUserDetail(page: Page, username: string): Promise<void> {
  await page.getByTestId("admin-user-keyword-input").fill(username);
  await expect
    .poll(
      async () => {
        await page.getByTestId("admin-user-search-button").click();
        return page.getByTestId("admin-user-open-detail-button").count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await page.getByTestId("admin-user-open-detail-button").first().click();
  await expect(page.getByTestId("admin-user-detail-username")).toContainText(username);
}

async function assertPasswordLogin(
  browser: Browser,
  username: string,
  password: string,
  shouldSucceed: boolean,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await assertHostedE2eRuntime(page);
    await openLoginPanel(page);
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill(password);
    if (shouldSucceed) {
      await page.getByTestId("auth-submit-button").click();
      await expect(page.getByTestId("account-menu-button")).toContainText(username, {
        timeout: 20_000,
      });
      return;
    }
    const dialogPromise = page.waitForEvent("dialog");
    await page.getByTestId("auth-submit-button").click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("登入失敗");
    await dialog.accept();
  } finally {
    await page.close();
  }
}

async function createPasswordResetUrl(page: Page, previousUrl?: string): Promise<string> {
  await page.getByTestId("admin-password-reset-button").click();
  await expect(page.getByTestId("admin-password-reset-qr-image")).toBeVisible();
  const resetLink = page.getByTestId("admin-password-reset-result");
  if (previousUrl) {
    await expect(resetLink).not.toHaveAttribute("href", previousUrl);
  }
  const resetUrl = await resetLink.getAttribute("href");
  expect(resetUrl).toContain("passwordResetId=");
  expect(resetUrl).toContain("passwordResetToken=");
  return resetUrl ?? "";
}

async function submitPasswordReset(
  browser: Browser,
  resetUrl: string,
  password: string,
): Promise<void> {
  const resetPage = await browser.newPage();
  try {
    await resetPage.goto(resetUrl);
    await expect(resetPage.getByTestId("password-reset-page")).toBeVisible();
    await resetPage.getByTestId("password-reset-new-password").fill(password);
    await resetPage.getByTestId("password-reset-confirm-password").fill(password);
    await resetPage.getByTestId("password-reset-submit").click();
    await expect(resetPage.getByText("密碼已重設完成，請使用新密碼登入。")).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await resetPage.close();
  }
}

async function assertUsedLinkIsRejected(
  browser: Browser,
  resetUrl: string,
  password: string,
): Promise<void> {
  const resetPage = await browser.newPage();
  try {
    await resetPage.goto(resetUrl);
    await expect(resetPage.getByTestId("password-reset-page")).toBeVisible();
    await resetPage.getByTestId("password-reset-new-password").fill(password);
    await resetPage.getByTestId("password-reset-confirm-password").fill(password);
    await resetPage.getByTestId("password-reset-submit").click();
    await expect(resetPage.getByText(/密碼重設失敗：.*(無效|已使用|過期)/)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await resetPage.close();
  }
}

test.describe("Password reset E2E flow", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !runPasswordResetFlow,
      "Set RUN_PASSWORD_RESET_E2E=1 to activate the password reset integration test.",
    );
    test.skip(
      !adminUsername || !adminPassword,
      "Set PASSWORD_RESET_ADMIN_USERNAME and PASSWORD_RESET_ADMIN_PASSWORD before running this test.",
    );
    test.skip(
      !process.env.E2E_BASE_URL?.startsWith(deployedE2eOrigin) ||
        process.env.E2E_SKIP_WEB_SERVER !== "1",
      "Run against the deployed E2E site with E2E_BASE_URL and E2E_SKIP_WEB_SERVER=1 so Worker CORS is exercised.",
    );
    await assertHostedE2eRuntime(page);
  });

  test("admin resets a teacher password through a one-time link", async ({
    browser,
    page,
  }) => {
    const username = `e2e_reset_${Date.now().toString(36)}`;
    const originalPassword = "test1234";
    const changedPassword = "test5678";
    const registrationPage = await browser.newPage();
    await registerTestTeacher(registrationPage, username, originalPassword);
    await registrationPage.close();

    await login(page, adminUsername, adminPassword);
    await openAdminDashboard(page);
    await openUserDetail(page, username);
    const resetUrl = await createPasswordResetUrl(page);
    await submitPasswordReset(browser, resetUrl, changedPassword);

    await assertPasswordLogin(browser, username, originalPassword, false);
    await assertPasswordLogin(browser, username, changedPassword, true);
    await assertUsedLinkIsRejected(browser, resetUrl, changedPassword);

    const restoreUrl = await createPasswordResetUrl(page, resetUrl);
    await submitPasswordReset(browser, restoreUrl, originalPassword);
    await assertPasswordLogin(browser, username, originalPassword, true);
    await assertPasswordLogin(browser, username, changedPassword, false);
  });
});
