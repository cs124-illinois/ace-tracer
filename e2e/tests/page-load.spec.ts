import { expect, test } from "@playwright/test"
import { waitForAceEditors } from "./fixtures"

test.describe("Page load", () => {
  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
    })

    await page.goto("/")
    await waitForAceEditors(page)

    // Filter out known noisy warnings (e.g., React dev warnings, ace path warnings)
    const realErrors = errors.filter(
      (e) => !e.includes("ace") && !e.includes("Download the React DevTools") && !e.includes("Warning:"),
    )
    expect(realErrors).toHaveLength(0)
  })

  test("Ace editors render", async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page, 4)

    const editorCount = await page.locator(".ace_editor").count()
    // Single demo has 2 editors (record + replay), multi demo has 2 editors
    expect(editorCount).toBeGreaterThanOrEqual(4)
  })

  test("PlayerControls buttons appear", async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page, 4)

    // Both demos should have Play and Record buttons
    const playButtons = page.locator("button", { hasText: "Play" })
    expect(await playButtons.count()).toBeGreaterThanOrEqual(2)

    const recordButtons = page.locator("button", { hasText: "Record" })
    expect(await recordButtons.count()).toBeGreaterThanOrEqual(2)
  })

  test("recording dropdown has 3 pre-recorded options", async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page)

    const select = page.locator("select#language")
    await expect(select).toBeVisible()

    const options = select.locator("option")
    // 1 empty + 3 recordings = 4 options
    expect(await options.count()).toBe(4)
  })

  test("session tabs visible", async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page)

    // Single demo shows session tabs (Main.java, Another.java)
    await expect(page.locator("kbd", { hasText: "Main.java" })).toBeVisible()
    await expect(page.locator("kbd", { hasText: "Another.java" })).toBeVisible()
  })
})
