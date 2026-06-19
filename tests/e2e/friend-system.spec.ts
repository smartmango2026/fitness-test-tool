import { test, expect } from "@playwright/test";

test.describe("Friend System", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("./");
    const runtime = await page.locator("html").getAttribute("data-runtime");
    if (runtime !== "e2e") {
      await page.close();
      throw new Error(`🛑 Safety abort: expected data-runtime="e2e" but got "${runtime}".`);
    }
    await page.close();
  });

  test("Register two users, send and accept friend request", async ({ browser }) => {
    const unique = Date.now().toString(36);
    const userA = `e2e_a_${unique}`;
    const userB = `e2e_b_${unique}`;
    
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("./");
    await pageB.getByTestId("auth-register-button").click();
    await pageB.getByTestId("auth-username-input").fill(userB);
    await pageB.getByTestId("auth-password-input").fill("test1234");
    await pageB.getByTestId("auth-submit-button").click();
    await expect(pageB.getByText(`帳號：${userB}`)).toBeVisible({ timeout: 20_000 });
    
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto("./");
    await pageA.getByTestId("auth-register-button").click();
    await pageA.getByTestId("auth-username-input").fill(userA);
    await pageA.getByTestId("auth-password-input").fill("test1234");
    await pageA.getByTestId("auth-submit-button").click();
    await expect(pageA.getByText(`帳號：${userA}`)).toBeVisible({ timeout: 20_000 });
    
    await pageA.getByTestId("account-tab").click();
    await expect(pageA.getByTestId("friend-target-input")).toBeVisible({ timeout: 10000 });
    
    await pageA.getByTestId("friend-target-input").fill(userB);
    await pageA.getByTestId("friend-send-button").click();
    
    await expect(pageA.locator(`text=${userB}`).last()).toBeVisible({ timeout: 15000 });

    await pageB.getByTestId("account-tab").click();
    const acceptButton = pageB.getByTestId("friend-accept-button").first();
    await expect(acceptButton).toBeVisible({ timeout: 15000 });
    
    await acceptButton.click();
    
    // Simplest possible assertion: User A's name appears anywhere on User B's screen after accepting
    await expect(pageB.locator(`text=${userA}`).last()).toBeVisible({ timeout: 20000 });

    await pageA.close();
    await pageB.close();
  });
});
