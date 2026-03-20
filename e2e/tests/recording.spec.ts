import { expect, test } from "@playwright/test"
import { getEditorContent, waitForAceEditors } from "./fixtures"

test.describe("Recording", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page, 4)
  })

  test("click Record, verify state changes", async ({ page }) => {
    // Click Record on the multi demo (last Record button to avoid audio permission issues)
    const recordButtons = page.locator("button", { hasText: "Record" })
    const multiRecordButton = recordButtons.last()
    await multiRecordButton.click()

    // Button should change to Stop
    await expect(page.locator("button", { hasText: "Stop" }).last()).toBeVisible({ timeout: 3000 })
  })

  test("type in editor during recording", async ({ page }) => {
    // Use multi demo (no audio permissions needed)
    const recordButtons = page.locator("button", { hasText: "Record" })
    await recordButtons.last().click()

    // Wait for recording to start
    await expect(page.locator("button", { hasText: "Stop" }).last()).toBeVisible({ timeout: 3000 })

    // Type in the third ace editor (first editor of multi demo, index 2)
    const editor = page.locator(".ace_editor").nth(2)
    await editor.click()
    await page.keyboard.type("hello test", { delay: 50 })

    // Verify content was typed
    const content = await getEditorContent(page, 2)
    expect(content).toContain("hello test")
  })

  test("click Stop, verify returns to paused", async ({ page }) => {
    // Use multi demo
    const recordButtons = page.locator("button", { hasText: "Record" })
    await recordButtons.last().click()

    await expect(page.locator("button", { hasText: "Stop" }).last()).toBeVisible({ timeout: 3000 })

    // Type something
    const editor = page.locator(".ace_editor").nth(2)
    await editor.click()
    await page.keyboard.type("test", { delay: 50 })

    // Wait a moment for recording to have some duration
    await page.waitForTimeout(500)

    // Stop recording
    await page.locator("button", { hasText: "Stop" }).last().click()

    // Should return to paused state (Play button visible again)
    await expect(page.locator("button", { hasText: "Play" }).last()).toBeVisible({ timeout: 3000 })
  })

  test("play after recording shows recorded content", async ({ page }) => {
    // Use multi demo
    const recordButtons = page.locator("button", { hasText: "Record" })
    await recordButtons.last().click()

    await expect(page.locator("button", { hasText: "Stop" }).last()).toBeVisible({ timeout: 3000 })

    // Type in editor
    const editor = page.locator(".ace_editor").nth(2)
    await editor.click()
    await page.keyboard.type("recorded text", { delay: 30 })

    await page.waitForTimeout(500)

    // Stop recording
    await page.locator("button", { hasText: "Stop" }).last().click()
    await expect(page.locator("button", { hasText: "Play" }).last()).toBeVisible({ timeout: 3000 })

    // Play the recording
    await page.locator("button", { hasText: "Play" }).last().click()

    // Wait for some playback
    await page.waitForTimeout(1000)

    // The editor should show content from the recording
    const content = await getEditorContent(page, 2)
    expect(content.length).toBeGreaterThan(0)

    // Pause to clean up
    const pauseButton = page.locator("button", { hasText: "Pause" }).last()
    if (await pauseButton.isVisible()) {
      await pauseButton.click()
    }
  })
})
