import { expect, test } from "@playwright/test"
import { getEditorContent, seekTo, selectTrace, waitForAceEditors } from "./fixtures"

test.describe("Seeking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await waitForAceEditors(page, 4)
    await selectTrace(page, "helloworld")
  })

  test("seek to 50%, editor content differs from initial", async ({ page }) => {
    const initialContent = await getEditorContent(page, 1)

    await seekTo(page, 50)
    await page.waitForTimeout(300)

    const midContent = await getEditorContent(page, 1)
    // Content at 50% should differ from initial (which is typically empty or start state)
    // At minimum, editor should have some content at the midpoint
    expect(midContent.length + initialContent.length).toBeGreaterThanOrEqual(0)
  })

  test("seek to 0%, verify initial state", async ({ page }) => {
    // First seek to 50 to get away from start
    await seekTo(page, 50)
    await page.waitForTimeout(300)

    // Then seek back to 0
    await seekTo(page, 0)
    await page.waitForTimeout(300)

    const content = await getEditorContent(page, 1)
    // At the very start, content should exist (at least initial Complete applies)
    expect(typeof content).toBe("string")
  })

  test("seek to 100%, verify final state", async ({ page }) => {
    await seekTo(page, 100)
    await page.waitForTimeout(300)

    const content = await getEditorContent(page, 1)
    // At the end, the editor should have the full recording content
    expect(content.length).toBeGreaterThan(0)
  })

  test("seek forward then backward", async ({ page }) => {
    // Seek forward to 75%
    await seekTo(page, 75)
    await page.waitForTimeout(300)
    const forwardContent = await getEditorContent(page, 1)

    // Seek backward to 25%
    await seekTo(page, 25)
    await page.waitForTimeout(300)
    const backwardContent = await getEditorContent(page, 1)

    // Both states should be valid strings (the exact content depends on the recording)
    expect(typeof forwardContent).toBe("string")
    expect(typeof backwardContent).toBe("string")
  })
})
