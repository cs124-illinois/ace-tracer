import { Page } from "@playwright/test"

export async function getEditorContent(page: Page, index: number): Promise<string> {
  return page.evaluate((idx) => {
    const editors = document.querySelectorAll(".ace_editor")
    const editor = editors[idx]
    if (!editor) return ""
    const lines = editor.querySelectorAll(".ace_line")
    return Array.from(lines)
      .map((line) => line.textContent ?? "")
      .join("\n")
  }, index)
}

export async function selectTrace(page: Page, stem: string): Promise<void> {
  await page.locator("select#language").selectOption(stem)
  // Wait for the JSON trace to load by watching for network idle
  await page.waitForTimeout(1000)
}

export async function seekTo(page: Page, percent: number): Promise<void> {
  const slider = page.locator('input[type="range"]').first()
  await slider.fill(String(percent))
}

export async function clickButton(page: Page, text: string): Promise<void> {
  await page.locator("button", { hasText: text }).first().click()
}

export async function waitForAceEditors(page: Page, count?: number): Promise<void> {
  if (count) {
    await page.waitForFunction((expected) => document.querySelectorAll(".ace_editor").length >= expected, count, {
      timeout: 10000,
    })
  } else {
    await page.waitForSelector(".ace_editor", { timeout: 10000 })
  }
}
