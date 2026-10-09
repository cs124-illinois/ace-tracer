import { test as base, expect, Locator, Page } from "@playwright/test"

// Console errors that are expected and harmless. Keep this list narrow: every entry hides a class of real failures.
const ALLOWED_CONSOLE_ERRORS: RegExp[] = []

export const test = base.extend<{ failOnPageErrors: void }>({
  failOnPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`))
      page.on("console", (message) => {
        if (message.type() !== "error") {
          return
        }
        const text = message.text()
        if (!ALLOWED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) {
          errors.push(`console.error: ${text}`)
        }
      })
      await use()
      expect(errors, "page reported errors").toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// Durations of the bundled traces, in seconds
export const HELLOWORLD_DURATION = 11.75

export const singleDemo = (page: Page) => page.getByTestId("single-demo")
export const multiDemo = (page: Page) => page.getByTestId("multi-demo")

export const playButton = (demo: Locator) => demo.getByTestId("play")
export const recordButton = (demo: Locator) => demo.getByTestId("record")
export const seekSlider = (demo: Locator) => demo.getByTestId("seek")
export const rateSelect = (demo: Locator) => demo.getByTestId("playbackRate")

// Ace virtualizes its rendered lines, so read the document value from the editor instance
export async function getEditorValue(page: Page, name: string): Promise<string> {
  return page.locator(`#${name}`).evaluate((element) => {
    return (element as unknown as { env: { editor: { getValue: () => string } } }).env.editor.getValue()
  })
}

export async function gotoDemo(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.locator(".ace_editor")).toHaveCount(4)
  await expect(playButton(singleDemo(page))).toBeVisible()
  await expect(playButton(multiDemo(page))).toBeVisible()
}

export async function selectTrace(page: Page, stem: string): Promise<void> {
  const demo = singleDemo(page)
  const response = page.waitForResponse((r) => r.url().endsWith(`/${stem}.json`) && r.ok())
  await demo.locator("select#language").selectOption(stem)
  await response
  await expect(playButton(demo)).toBeEnabled()
  await expect(seekSlider(demo)).toBeEnabled()
}

export async function seekTo(demo: Locator, percent: number): Promise<void> {
  await seekSlider(demo).fill(String(percent))
}

export async function sliderPercent(demo: Locator): Promise<number> {
  return Number(await seekSlider(demo).inputValue())
}
