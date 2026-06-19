import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mock dataset
const mockRosterPath = path.join(__dirname, "data", "mock-roster.json");
const mockRoster = JSON.parse(fs.readFileSync(mockRosterPath, "utf-8"));

test.describe("Single-User E2E Teacher Workflow", () => {
  test("performs registration, file creation, roster entry, and score logging", async ({ page }, testInfo) => {
    // Register dialog listener to auto-accept confirm alerts (e.g. saving changes before tab switch)
    page.on("dialog", async (dialog) => {
      console.log(`[Dialog A] type: ${dialog.type()}, message: ${dialog.message()}`);
      await dialog.accept();
    });

    // 1. Load the page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 2. Open Register Dialog
    const registerBtn = page.getByTestId("auth-register-button");
    await expect(registerBtn).toBeVisible();
    await registerBtn.click();

    // 3. Register a clean temporary account
    const tempUsername = `test_teacher_${Date.now()}`;
    testInfo.annotations.push({
      type: "Test Purpose",
      description: "Verify single-teacher workflow: Register -> Create File -> Enter Scores -> Sync -> PDF Report"
    });
    testInfo.annotations.push({
      type: "Test Account Created",
      description: `Username: ${tempUsername} | Password: test123456`
    });

    const usernameInput = page.getByTestId("auth-username-input");
    await expect(usernameInput).toBeVisible();

    await usernameInput.fill(tempUsername);
    await page.getByTestId("auth-password-input").fill("test123456");

    // Submit registration
    const submitRegisterBtn = page.getByTestId("auth-submit-button");
    await submitRegisterBtn.click();

    // Wait for the auth dialog to close and log-in state to reflect
    await expect(usernameInput).not.toBeVisible();
    await expect(page.locator(".hero-auth")).toContainText(tempUsername);
    
    // Checkpoint: Registration Success
    await expect(page).toHaveScreenshot("register-a-success.png", { maxDiffPixelRatio: 0.05 });

    // 4. Navigate to "編輯檔案" (Files Tab) to create a new class file
    const filesTabBtn = page.getByTestId("files-tab");
    await filesTabBtn.click();
    await page.waitForTimeout(500);

    // Open "建立新檔案" form
    const createNewFileBtn = page.getByTestId("create-file-button");
    await expect(createNewFileBtn).toBeVisible();
    await createNewFileBtn.click();

    // Fill the class details
    await page.getByTestId("file-name-input").fill("測試特班");
    await page.getByTestId("file-size-input").fill(String(mockRoster.length)); // Seeding 3 students

    // Submit and build file
    const confirmCreateBtn = page.getByTestId("file-create-submit");
    await confirmCreateBtn.click();
    await page.waitForTimeout(2000); // Wait for Firestore file record instantiation
    
    // Checkpoint: Create File Success
    await expect(page.getByTestId("current-file-card")).toBeVisible();
    await expect(page).toHaveScreenshot("create-file-success.png", { maxDiffPixelRatio: 0.05, mask: [page.getByTestId("current-file-card")] });

    // 5. Populate student roster
    const rosterTabBtn = page.getByTestId("roster-tab");
    await rosterTabBtn.click();
    await page.waitForSelector("table tbody tr");

    // Target cells using static <td> column anchors to prevent shifting indexes on button->input transitions.
    // Columns: td[0]=No, td[1]=Name, td[2]=Height, td[3]=Weight
    for (let i = 0; i < mockRoster.length; i++) {
      const student = mockRoster[i];
      const row = page.locator("table tbody tr").nth(i);
      
      // Name (td index 1)
      await row.locator("td").nth(1).click();
      await page.locator("td input").fill(student.name);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);

      // Height (td index 2)
      await row.locator("td").nth(2).click();
      await page.locator("td input").fill(student.height);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);

      // Weight (td index 3)
      await row.locator("td").nth(3).click();
      await page.locator("td input").fill(student.weight);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
    }

    // Save student list
    const saveRosterBtn = page.getByTestId("roster-save-button");
    await expect(saveRosterBtn).toBeVisible();
    await saveRosterBtn.click();
    await page.waitForTimeout(1500); // Wait for Firestore sync completion
    
    // Checkpoint: Roster Saved
    await expect(page).toHaveScreenshot("roster-saved.png", { maxDiffPixelRatio: 0.05 });

    // 6. Navigate to "測驗項目" (Test Items Tab) and seed scores
    const metricTabBtn = page.getByTestId("metric-tab");
    await metricTabBtn.click();
    await page.waitForSelector("table tbody tr");

    // Input standing long jump scores (first metric)
    // Columns: td[0]=Name, td[1]=Score
    for (let i = 0; i < mockRoster.length; i++) {
      const student = mockRoster[i];
      const row = page.locator("table tbody tr").nth(i);
      
      // Click score cell (td index 1)
      await row.locator("td").nth(1).click();
      await page.locator("td input").fill(String(student.scores[0])); // item1 score
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
    }

    // Save metric scores
    const saveScoresBtn = page.getByTestId("metric-save-button");
    await expect(saveScoresBtn).toBeVisible();
    await saveScoresBtn.click();
    await page.waitForTimeout(1500);
    
    // Checkpoint: Metric Complete
    await expect(page).toHaveScreenshot("metric-complete.png", { maxDiffPixelRatio: 0.05 });

    // 7. Verify "測驗總表" (Test Table Tab) reflects inputs correctly
    const tableTabBtn = page.getByTestId("summary-tab");
    await tableTabBtn.click();
    await page.waitForSelector("table tbody tr td button.cell-display");

    // Retrieve name column text contents to ensure names are loaded
    for (let i = 0; i < mockRoster.length; i++) {
      const row = page.locator("table tbody tr").nth(i);
      await expect(row).toContainText(mockRoster[i].name);
    }
    
    // Checkpoint: Summary Table Complete
    await expect(page).toHaveScreenshot("summary-table-complete.png", { maxDiffPixelRatio: 0.05 });

    // 8. Open "測驗報告" (PDF Tab) to verify render is healthy
    const pdfTabBtn = page.getByTestId("pdf-tab");
    await pdfTabBtn.click();
    await page.waitForSelector("canvas, .chart-container, .pdf-preview");
    
    // Check if student selector display correctly
    const studentSelect = page.getByTestId("pdf-student-select");
    await expect(studentSelect).toBeVisible();
    
    // Checkpoint: Report Student 1 Preview
    await expect(page).toHaveScreenshot("report-student-1-preview.png", { maxDiffPixelRatio: 0.05 });
    
    // 9. PDF download assertion
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId("pdf-download-all-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
