import {
  expect,
  getEditorValue,
  gotoDemo,
  multiDemo,
  playButton,
  recordButton,
  seekSlider,
  singleDemo,
  test,
} from "./fixtures"

type AceEditor = { getValue: () => string; on: (event: "change", listener: () => void) => void }

test.describe("Recording", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page)
  })

  test("click Record, verify state changes", async ({ page }) => {
    const demo = multiDemo(page)
    await recordButton(demo).click()
    await expect(playButton(demo)).toHaveText("Stop")
    await expect(recordButton(demo)).toBeDisabled()
    await expect(seekSlider(demo)).toBeDisabled()
  })

  test("type in editor during recording", async ({ page }) => {
    const demo = multiDemo(page)
    await recordButton(demo).click()
    await expect(playButton(demo)).toHaveText("Stop")

    await page.locator("#multi-first").click()
    await page.keyboard.type("hello test", { delay: 50 })
    expect(await getEditorValue(page, "multi-first")).toBe("hello test")
  })

  test("click Stop, verify returns to paused with something to play", async ({ page }) => {
    const demo = multiDemo(page)
    await recordButton(demo).click()
    await expect(playButton(demo)).toHaveText("Stop")

    await page.locator("#multi-first").click()
    await page.keyboard.type("test", { delay: 50 })

    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")
    await expect(playButton(demo)).toBeEnabled()
    await expect(recordButton(demo)).toBeEnabled()
    await expect(seekSlider(demo)).toBeEnabled()
  })

  test("play after recording replays recorded content", async ({ page }) => {
    const demo = multiDemo(page)
    await recordButton(demo).click()
    await expect(playButton(demo)).toHaveText("Stop")

    await page.locator("#multi-first").click()
    await page.keyboard.type("recorded text", { delay: 30 })
    expect(await getEditorValue(page, "multi-first")).toBe("recorded text")

    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")
    await expect(playButton(demo)).toBeEnabled()

    // Clear the editor so that only playback can bring the recorded text back
    await page.locator("#multi-first").click()
    await page.keyboard.press("ControlOrMeta+A")
    await page.keyboard.press("Backspace")
    expect(await getEditorValue(page, "multi-first")).toBe("")

    // Playback resets to the start when it ends, so collect every value the editor passes through
    await page.locator("#multi-first").evaluate((element) => {
      const editor = (element as unknown as { env: { editor: AceEditor } }).env.editor
      const seen = new Set<string>()
      ;(window as unknown as { seenValues: Set<string> }).seenValues = seen
      editor.on("change", () => seen.add(editor.getValue()))
    })
    const seenValues = () =>
      page.evaluate(() => Array.from((window as unknown as { seenValues: Set<string> }).seenValues))

    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Pause")
    await expect(playButton(demo)).toHaveText("Play", { timeout: 10000 })
    const values = await seenValues()
    expect(values).toContain("recorded text")
    // Partial text shows the typing itself was replayed, not just a final snapshot
    expect(values.some((value) => value !== "" && value !== "recorded text" && "recorded text".startsWith(value))).toBe(
      true,
    )
  })
})

test.describe("Single demo recording", () => {
  test("recording streams records without timer snapshots and enables Play", async ({ page }) => {
    await gotoDemo(page)
    const demo = singleDemo(page)
    await recordButton(demo).click()
    await expect(playButton(demo)).toHaveText("Stop")
    await expect(demo.locator("select#language")).toBeDisabled()

    await page.locator("#single-record").click()
    await page.keyboard.type("abc", { delay: 50 })
    const records = demo.getByTestId("records").locator("pre")
    await expect(records.filter({ hasText: '"type": "delta"' })).toHaveCount(3)
    // The recording timer passing 0:02 means at least one timer snapshot (1000ms interval) has been recorded
    await expect(demo.getByText("0:02")).toBeVisible({ timeout: 5000 })
    await expect(records.filter({ hasText: '"reason": "timer"' })).toHaveCount(0)

    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")
    await expect(playButton(demo)).toBeEnabled()
    await expect(seekSlider(demo)).toBeEnabled()
  })
})
