import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readE2eFirebaseApiKey(): string {
  if (process.env.VITE_E2E_FIREBASE_API_KEY) {
    return process.env.VITE_E2E_FIREBASE_API_KEY;
  }

  const envPath = resolve(process.cwd(), ".env.local");
  const envText = readFileSync(envPath, "utf8");
  const match = envText.match(/^VITE_E2E_FIREBASE_API_KEY=(.+)$/m);
  if (!match?.[1]) {
    throw new Error("Missing VITE_E2E_FIREBASE_API_KEY in environment or .env.local.");
  }

  return match[1].trim();
}

async function createE2eAuthUser(username: string, password: string): Promise<void> {
  const apiKey = readE2eFirebaseApiKey();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: `${username}@fitness-test.local`,
        password,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create E2E auth user: ${response.status} ${body}`);
  }
}

async function openLoginPanel(page: Page): Promise<void> {
  if (await page.getByTestId("auth-username-input").isVisible().catch(() => false)) {
    return;
  }

  await page.getByTestId("auth-login-button").click();
  try {
    await expect(page.getByTestId("auth-username-input")).toBeVisible({
      timeout: 5_000,
    });
  } catch {
    await page.getByTestId("auth-login-button").click();
    await expect(page.getByTestId("auth-username-input")).toBeVisible({
      timeout: 10_000,
    });
  }
}

test.describe("Password change", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("./");

    const runtime = await page.locator("html").getAttribute("data-runtime");
    if (runtime !== "e2e") {
      await page.close();
      throw new Error(`Safety abort: expected data-runtime="e2e" but got "${runtime}".`);
    }

    const bannerText = await page.getByTestId("e2e-runtime-banner").textContent();
    if (!bannerText || bannerText.includes("not-configured")) {
      await page.close();
      throw new Error(
        "Safety abort: E2E Firebase is not configured. Set VITE_E2E_FIREBASE_* before running write tests.",
      );
    }

    await page.close();
  });

  test("changes password and requires the new password on next login", async ({ page }) => {
    const unique = Date.now().toString(36);
    const username = `e2e_pw_${unique}`;
    const originalPassword = "test1234";
    const nextPassword = "test5678";

    await createE2eAuthUser(username, originalPassword);

    await page.goto("./");

    await openLoginPanel(page);
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill(originalPassword);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByText(`帳號：${username}`)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("account-tab").click();
    await expect(page.getByTestId("change-password-card")).toBeVisible();
    await page.getByTestId("current-password-input").fill(originalPassword);
    await page.getByTestId("new-password-input").fill(nextPassword);
    await page.getByTestId("confirm-new-password-input").fill(nextPassword);
    const passwordChangedDialog = page.waitForEvent("dialog");
    await page.getByTestId("change-password-submit").click();
    const passwordChangedAlert = await passwordChangedDialog;
    expect(passwordChangedAlert.message()).toContain("修改密碼成功");
    await passwordChangedAlert.accept();

    await page.getByRole("button", { name: `帳號：${username}` }).click();
    await page.getByRole("button", { name: "登出" }).click();
    await expect(page.getByTestId("auth-login-button")).toBeVisible({ timeout: 20_000 });

    await openLoginPanel(page);
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill(originalPassword);
    const oldPasswordDialog = page.waitForEvent("dialog");
    await page.getByTestId("auth-submit-button").click();
    const oldPasswordAlert = await oldPasswordDialog;
    expect(oldPasswordAlert.message()).toContain("登入失敗");
    await oldPasswordAlert.accept();

    await openLoginPanel(page);
    await page.getByTestId("auth-username-input").fill(username);
    await page.getByTestId("auth-password-input").fill(nextPassword);
    await page.getByTestId("auth-submit-button").click();
    await expect(page.getByText(`帳號：${username}`)).toBeVisible({ timeout: 20_000 });
  });
});
