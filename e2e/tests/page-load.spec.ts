import { expect, gotoDemo, multiDemo, playButton, recordButton, seekSlider, singleDemo, test } from "./fixtures"

test.describe("Page load", () => {
  test("page loads without errors", async ({ page }) => {
    // The auto fixture fails the test on any page error or unexpected console error
    await gotoDemo(page)
    await page.waitForLoadState("networkidle")
  })

  test("Ace editors render", async ({ page }) => {
    await gotoDemo(page)
    await expect(singleDemo(page).locator(".ace_editor")).toHaveCount(2)
    await expect(multiDemo(page).locator(".ace_editor")).toHaveCount(2)
  })

  test("PlayerControls appear with nothing to play", async ({ page }) => {
    await gotoDemo(page)
    for (const demo of [singleDemo(page), multiDemo(page)]) {
      await expect(playButton(demo)).toHaveText("Play")
      await expect(playButton(demo)).toBeDisabled()
      await expect(recordButton(demo)).toBeEnabled()
      await expect(seekSlider(demo)).toBeDisabled()
    }
  })

  test("recording dropdown has 3 pre-recorded options", async ({ page }) => {
    await gotoDemo(page)
    const select = singleDemo(page).locator("select#language")
    await expect(select).toBeEnabled()
    // 1 empty + 3 recordings
    await expect(select.locator("option")).toHaveText(["", "Hello, world!", "Multiple Editors", "Scrolling Demo"])
  })

  test("session tabs visible", async ({ page }) => {
    await gotoDemo(page)
    const demo = singleDemo(page)
    await expect(demo.locator("kbd", { hasText: "Main.java" })).toBeVisible()
    await expect(demo.locator("kbd", { hasText: "Another.java" })).toBeVisible()
  })
})
