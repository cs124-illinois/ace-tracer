import { expect, getEditorValue, gotoDemo, seekTo, selectTrace, singleDemo, test } from "./fixtures"

// Replay editor contents of the helloworld trace at positions chosen well away from any edit
const EXPECTED: [number, string][] = [
  [0, ""],
  [20, "Hello"],
  [30, ""],
  [45, "world!"],
  [70, "Hello"],
  [100, "world!"],
]

test.describe("Seeking", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page)
    await selectTrace(page, "helloworld")
  })

  for (const [percent, content] of EXPECTED) {
    test(`seek to ${percent}% shows the recorded content at that time`, async ({ page }) => {
      const demo = singleDemo(page)
      // Start from a different state so that the assertion proves the seek changed the editor
      const [otherPercent, otherContent] = EXPECTED.find(([, c]) => c !== content)!
      await seekTo(demo, otherPercent)
      await expect.poll(() => getEditorValue(page, "single-replay")).toBe(otherContent)

      await seekTo(demo, percent)
      await expect.poll(() => getEditorValue(page, "single-replay")).toBe(content)
    })
  }

  test("seek forward then backward", async ({ page }) => {
    const demo = singleDemo(page)
    await seekTo(demo, 70)
    await expect.poll(() => getEditorValue(page, "single-replay")).toBe("Hello")
    await seekTo(demo, 45)
    await expect.poll(() => getEditorValue(page, "single-replay")).toBe("world!")
    await seekTo(demo, 30)
    await expect.poll(() => getEditorValue(page, "single-replay")).toBe("")
  })
})
