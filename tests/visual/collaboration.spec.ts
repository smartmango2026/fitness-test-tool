import { test, expect } from "@playwright/test";

test.describe("Multi-User Collaboration & Friendship Workflow", () => {
  test("Teacher A adds Teacher B as friend, shares a file, and edits collaboratively", async ({ browser }, testInfo) => {
    // Increase timeout for this complex multi-user flow
    test.setTimeout(60000);

    // 1. Initialize two separate browser contexts to simulate two different users
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Register dialog listeners for both contexts to auto-accept confirm popups
    pageA.on("dialog", async (dialog) => {
      console.log(`[Dialog A] type: ${dialog.type()}, message: ${dialog.message()}`);
      await dialog.accept();
    });
    pageB.on("dialog", async (dialog) => {
      console.log(`[Dialog B] type: ${dialog.type()}, message: ${dialog.message()}`);
      await dialog.accept();
    });

    const usernameA = `teacher_a_${Date.now()}`;
    const usernameB = `teacher_b_${Date.now()}`;
    testInfo.annotations.push({
      type: "Test Purpose",
      description: "Verify multi-user collaboration workflow: Friend Invitation -> File Share -> Live Edit -> live Sync"
    });
    testInfo.annotations.push({
      type: "Test Accounts Created",
      description: `Teacher A: ${usernameA} | Teacher B: ${usernameB} | Password: test123456`
    });

    // 2. Register Teacher A on Page A
    await pageA.goto("/");
    await pageA.waitForSelector(".panel-grid, button:has-text('登入')");
    await pageA.locator(".hero-auth button:has-text('註冊')").first().click();
    await pageA.locator(".auth-panel").getByPlaceholder(/帳號/).fill(usernameA);
    await pageA.locator(".auth-panel").getByPlaceholder("密碼").fill("test123456");
    await pageA.locator(".auth-panel").getByRole("button", { name: "註冊", exact: true }).click();
    await expect(pageA.locator(".auth-panel")).not.toBeVisible();
    await expect(pageA.locator(".hero-auth")).toContainText(usernameA);

    // 3. Register Teacher B on Page B
    await pageB.goto("/");
    await pageB.waitForSelector(".panel-grid, button:has-text('登入')");
    await pageB.locator(".hero-auth button:has-text('註冊')").first().click();
    await pageB.locator(".auth-panel").getByPlaceholder(/帳號/).fill(usernameB);
    await pageB.locator(".auth-panel").getByPlaceholder("密碼").fill("test123456");
    await pageB.locator(".auth-panel").getByRole("button", { name: "註冊", exact: true }).click();
    await expect(pageB.locator(".auth-panel")).not.toBeVisible();
    await expect(pageB.locator(".hero-auth")).toContainText(usernameB);

    // 4. Teacher A sends a Friend Request to Teacher B
    const accountTabBtnA = pageA.locator("button:has-text('帳號管理'), .tab-item:has-text('帳號管理')").first();
    await accountTabBtnA.click();
    await pageA.waitForSelector(".friend-toolbar");

    // Input Teacher B's username and submit via Enter key to bypass any click boundary/scrolling issues
    const friendInputA = pageA.locator(".friend-toolbar input");
    // Wait 2.5 seconds to ensure Teacher B's asynchronous profile creation has committed in Firestore
    await pageA.waitForTimeout(2500);
    await friendInputA.fill(usernameB);
    await friendInputA.press("Enter");
    // Wait for the input draft to be cleared, indicating the invite was successfully created in Firestore and local state updated
    await expect(friendInputA).toHaveValue("");

    // 5. Teacher B accepts the incoming Friend Request on Page B
    // Increase timeout to 30000ms to tolerate high local machine CPU load
    await pageB.waitForSelector(".friend-alert-card", { timeout: 30000 });
    const acceptBtn = pageB.locator(".friend-alert-card button.primary-button:has-text('同意')").first();
    await acceptBtn.click();
    // Wait for the invite alert card to disappear to confirm friendship sync is completed
    await expect(acceptBtn).not.toBeVisible({ timeout: 10000 });

    // 6. Teacher A creates a new class file to share
    const filesTabBtnA = pageA.locator("button:has-text('編輯檔案'), .tab-item:has-text('編輯檔案')").first();
    await filesTabBtnA.click();
    await pageA.waitForTimeout(500);

    const createNewFileBtnA = pageA.locator("button:has-text('建立新檔案')").first();
    await createNewFileBtnA.click();

    const classDetailGridA = pageA.locator(".file-detail-grid");
    await classDetailGridA.locator("input[type='text']").fill("協作大班");
    await classDetailGridA.locator("input[type='number']").fill("1"); // 1 student for quick edit

    const confirmCreateBtnA = pageA.locator(".file-accordion-actions button:has-text('建立新檔案')");
    await confirmCreateBtnA.click();
    // Wait for the workspace file card to show the new file is created and active
    await expect(pageA.locator(".workspace-file-card span").first()).toContainText("協作大班", { timeout: 10000 });

    // 7. Teacher A populates roster with 1 student and saves
    const rosterTabBtnA = pageA.locator("button:has-text('學員名單'), .tab-item:has-text('學員名單')").first();
    await rosterTabBtnA.click();
    await pageA.waitForSelector("table tbody tr");

    const rowA = pageA.locator("table tbody tr").nth(0);
    
    // Name (td index 1)
    await rowA.locator("td").nth(1).click();
    await pageA.locator("td input").fill("小班長");
    await pageA.keyboard.press("Enter");
    await pageA.waitForTimeout(200);

    // Height (td index 2)
    await rowA.locator("td").nth(2).click();
    await pageA.locator("td input").fill("110");
    await pageA.keyboard.press("Enter");
    await pageA.waitForTimeout(200);

    // Weight (td index 3)
    await rowA.locator("td").nth(3).click();
    await pageA.locator("td input").fill("18");
    await pageA.keyboard.press("Enter");
    await pageA.waitForTimeout(200);

    // Save
    await pageA.locator("button.primary-button:has-text('儲存')").click();
    await pageA.waitForTimeout(2000);

    // 8. Teacher A shares the file with Teacher B
    await filesTabBtnA.click();
    await pageA.waitForSelector(".file-share-row select");

    // Select Teacher B from available friends dropdown
    const shareDropdown = pageA.locator(".file-share-row select");
    await shareDropdown.selectOption({ label: usernameB });

    // Click Share
    const shareBtn = pageA.locator(".file-share-row button:has-text('分享')");
    await shareBtn.click();
    // Wait for the "取消分享" button to become visible, indicating sharing sync is completed
    await expect(pageA.locator("button:has-text('取消分享')").first()).toBeVisible({ timeout: 10000 });

    // 9. Teacher B switches to the shared file
    const filesTabBtnB = pageB.locator("button:has-text('編輯檔案'), .tab-item:has-text('編輯檔案')").first();
    await filesTabBtnB.click();
    await pageB.waitForTimeout(1000); // Wait for cloud file state to sync and UI to render

    const currentFileSpanB = pageB.locator(".workspace-file-card span").first();
    const currentFileNameB = await currentFileSpanB.innerText();
    console.log(`[Teacher B] Current active file is: "${currentFileNameB}"`);

    if (currentFileNameB.includes("協作大班")) {
      console.log(`[Teacher B] Shared file '協作大班' is already active. Skipping switcher.`);
    } else {
      console.log(`[Teacher B] Shared file not active. Clicking switcher...`);
      // Click file switcher
      const switcherBtnB = pageB.locator(".workspace-file-card button:has-text('切換檔案')");
      await switcherBtnB.click();
      await pageB.waitForSelector(".file-switcher-card select");

      // B selects the shared file by traversing option texts
      const selectFileB = pageB.locator(".file-switcher-card select");
      const optionElements = await selectFileB.locator("option").all();
      let sharedFileValue = "";
      for (const option of optionElements) {
        const text = await option.innerText();
        if (text.includes("協作大班")) {
          sharedFileValue = await option.getAttribute("value") ?? "";
          break;
        }
      }

      if (sharedFileValue) {
        await selectFileB.selectOption(sharedFileValue);
        // Confirm switcher
        const confirmSwitchBtnB = pageB.locator(".file-switcher-card button:has-text('確認切換')");
        await expect(confirmSwitchBtnB).toBeEnabled();
        await confirmSwitchBtnB.click();
        await pageB.waitForTimeout(2500); // Wait for shared file load
      } else {
        throw new Error("Shared file '協作大班' not found in Teacher B's file list!");
      }
    }

    // 10. Teacher B edits student details (Height = 120) collaboratively
    const rosterTabBtnB = pageB.locator("button:has-text('學員名單'), .tab-item:has-text('學員名單')").first();
    await rosterTabBtnB.click();
    await pageB.waitForSelector("table tbody tr");

    const rowB = pageB.locator("table tbody tr").nth(0);
    // Click Height cell of Row 0 (Column 2)
    await rowB.locator("td").nth(2).click();
    await pageB.locator("td input").fill("120"); // Change height from 110 to 120
    await pageB.keyboard.press("Enter");
    await pageB.waitForTimeout(200);

    // Save changes
    await pageB.locator("button.primary-button:has-text('儲存')").click();
    await pageB.waitForTimeout(2500); // Firestore updates shared document

    // 11. Teacher A verifies the update by reloading and auto-restoring the file
    await pageA.reload();
    await pageA.waitForSelector(".panel-grid, button:has-text('登入')");
    await pageA.waitForTimeout(3000); // Wait for auth persistence and auto-restoring last active file

    const rosterTabBtnAAfterReload = pageA.locator("button:has-text('學員名單'), .tab-item:has-text('學員名單')").first();
    await rosterTabBtnAAfterReload.click();
    await pageA.waitForSelector("table tbody tr");
    
    // Assert Height value on Row 0 is updated to 120 in Teacher A's UI
    const heightCellA = pageA.locator("table tbody tr").nth(0).locator("td").nth(2);
    await expect(heightCellA).toContainText("120");

    // Clean up browser contexts
    await contextA.close();
    await contextB.close();
  });
});
