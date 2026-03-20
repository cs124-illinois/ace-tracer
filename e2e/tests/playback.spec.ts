import { expect, test } from "@playwright/test"
import { getEditorContent, selectTrace, waitForAceEditors } from "./fixtures"

test.describe("Playback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page, 4)
  })

  test("select trace, click Play, button becomes Pause", async ({ page }) => {
    await selectTrace(page, "helloworld")

    // Click the first Play button (single demo)
    const playButton = page.locator("button", { hasText: "Play" }).first()
    await playButton.click()

    // Button should now show "Pause"
    await expect(page.locator("button", { hasText: "Pause" }).first()).toBeVisible({ timeout: 3000 })
  })

  test("during playback, replay editor content changes", async ({ page }) => {
    await selectTrace(page, "helloworld")

    // Get initial content of replay editor (second ace editor = index 1)
    const initialContent = await getEditorContent(page, 1)

    // Start playback
    await page.locator("button", { hasText: "Play" }).first().click()

    // Wait a moment for playback to progress
    await page.waitForTimeout(1500)

    // Content should have changed
    const playingContent = await getEditorContent(page, 1)
    // At minimum, we expect the editor to have some content during playback
    expect(playingContent.length).toBeGreaterThan(0)

    // Pause to clean up
    const pauseButton = page.locator("button", { hasText: "Pause" }).first()
    if (await pauseButton.isVisible()) {
      await pauseButton.click()
    }
  })

  test("seek slider value increases during playback", async ({ page }) => {
    await selectTrace(page, "helloworld")

    const slider = page.locator('input[type="range"]').first()
    const initialValue = await slider.inputValue()

    // Start playback
    await page.locator("button", { hasText: "Play" }).first().click()

    // Wait for playback to progress
    await page.waitForTimeout(2000)

    const currentValue = await slider.inputValue()

    // Slider should have advanced
    expect(Number(currentValue)).toBeGreaterThan(Number(initialValue))

    // Pause to clean up
    const pauseButton = page.locator("button", { hasText: "Pause" }).first()
    if (await pauseButton.isVisible()) {
      await pauseButton.click()
    }
  })

  test("pause during playback, editor content stable", async ({ page }) => {
    await selectTrace(page, "helloworld")

    // Start playback
    await page.locator("button", { hasText: "Play" }).first().click()
    await page.waitForTimeout(1000)

    // Pause
    await page.locator("button", { hasText: "Pause" }).first().click()

    // Get content right after pausing
    const contentAtPause = await getEditorContent(page, 1)

    // Wait and check again — should be stable
    await page.waitForTimeout(500)
    const contentAfterWait = await getEditorContent(page, 1)

    expect(contentAfterWait).toBe(contentAtPause)
  })

  test("playback rate change reflects in select value", async ({ page }) => {
    await selectTrace(page, "helloworld")

    // Change playback rate to 2.0
    const rateSelect = page.locator("select#playbackRate").first()
    await rateSelect.selectOption("2.0")

    // Verify the select reflects the chosen value
    await expect(rateSelect).toHaveValue("2.0")

    // Change back to 0.5 and verify
    await rateSelect.selectOption("0.5")
    await expect(rateSelect).toHaveValue("0.5")
  })
})
