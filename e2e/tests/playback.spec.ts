import {
  expect,
  getEditorValue,
  gotoDemo,
  HELLOWORLD_DURATION,
  playButton,
  rateSelect,
  seekTo,
  selectTrace,
  singleDemo,
  sliderPercent,
  test,
} from "./fixtures"

test.describe("Playback", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page)
    await selectTrace(page, "helloworld")
  })

  test("Play toggles to Pause and back", async ({ page }) => {
    const play = playButton(singleDemo(page))
    await play.click()
    await expect(play).toHaveText("Pause")
    await play.click()
    await expect(play).toHaveText("Play")
  })

  test("during playback, replay editor shows recorded content", async ({ page }) => {
    expect(await getEditorValue(page, "single-replay")).toBe("")
    const play = playButton(singleDemo(page))
    await play.click()
    // "Hello" is typed during the first two seconds of the trace
    await expect.poll(() => getEditorValue(page, "single-replay"), { timeout: 10000 }).toBe("Hello")
    await play.click()
    await expect(play).toHaveText("Play")
  })

  test("seek slider value increases during playback", async ({ page }) => {
    const demo = singleDemo(page)
    expect(await sliderPercent(demo)).toBe(0)
    await playButton(demo).click()
    await expect.poll(() => sliderPercent(demo), { timeout: 10000 }).toBeGreaterThan(5)
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")
  })

  test("pause during playback, position and editor content stable", async ({ page }) => {
    const demo = singleDemo(page)
    await playButton(demo).click()
    await expect.poll(() => getEditorValue(page, "single-replay"), { timeout: 10000 }).toBe("Hello")
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")

    const percentAtPause = await sliderPercent(demo)
    const contentAtPause = await getEditorValue(page, "single-replay")
    // Stability can only be observed over time: wait long enough that playback would have visibly advanced
    await page.waitForTimeout(1000)
    expect(await sliderPercent(demo)).toBe(percentAtPause)
    expect(await getEditorValue(page, "single-replay")).toBe(contentAtPause)
  })

  test("playback rate 2.0 plays about twice as fast as 1.0", async ({ page }) => {
    const demo = singleDemo(page)

    const measureRate = async () => {
      const startPercent = await sliderPercent(demo)
      const startTime = Date.now()
      await expect.poll(() => sliderPercent(demo), { timeout: 10000 }).toBeGreaterThan(startPercent + 10)
      const elapsed = (Date.now() - startTime) / 1000
      const advanced = (((await sliderPercent(demo)) - startPercent) / 100) * HELLOWORLD_DURATION
      return advanced / elapsed
    }

    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Pause")
    await expect.poll(() => sliderPercent(demo)).toBeGreaterThan(0)
    const normalRate = await measureRate()
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")

    await rateSelect(demo).selectOption("2.0")
    await expect(rateSelect(demo)).toHaveValue("2.0")
    await seekTo(demo, 0)
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Pause")
    await expect.poll(() => sliderPercent(demo)).toBeGreaterThan(0)
    const fastRate = await measureRate()
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Play")

    expect(normalRate).toBeGreaterThan(0.6)
    expect(normalRate).toBeLessThan(1.4)
    expect(fastRate / normalRate).toBeGreaterThan(1.5)
    expect(fastRate / normalRate).toBeLessThan(2.5)
  })

  test("after playback ends, controls reflect the reset to the start", async ({ page }) => {
    const demo = singleDemo(page)
    await seekTo(demo, 90)
    await expect.poll(() => getEditorValue(page, "single-replay")).toBe("world!")
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Pause")
    await expect(playButton(demo)).toHaveText("Play", { timeout: 10000 })
    await expect.poll(() => sliderPercent(demo)).toBe(0)
    await expect.poll(() => getEditorValue(page, "single-replay")).toBe("")
  })

  test("recording select is disabled during playback", async ({ page }) => {
    const demo = singleDemo(page)
    const select = demo.locator("select#language")
    await playButton(demo).click()
    await expect(playButton(demo)).toHaveText("Pause")
    await expect(select).toBeDisabled()
    await playButton(demo).click()
    await expect(select).toBeEnabled()
  })
})
