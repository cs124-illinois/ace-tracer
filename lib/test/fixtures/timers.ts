import { afterEach, beforeEach, jest } from "bun:test"

// Fake timers also fake Date, so AcePlayer and AceRecorder timestamps follow advanceTimersByTime
export function useFakeTimers(now = 0) {
  beforeEach(() => {
    jest.useFakeTimers({ now })
  })
  afterEach(() => {
    restoreRealTimers()
  })
}

// Bun 1.4 bug: if a zero-delay timer that a timer callback scheduled is still pending when real timers are restored,
// setTimeout stays unfaked for the rest of the run, even after later useFakeTimers() calls. Real Ace sessions schedule
// such timers when edited. Running timers that are due now before clearing the rest avoids it.
export function restoreRealTimers() {
  jest.advanceTimersByTime(0)
  jest.clearAllTimers()
  jest.useRealTimers()
}

// setImmediate isn't faked, so this lets real I/O (Blob reads, FileReader) and promise chains finish
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

// Under fake timers, awaits a promise whose chain mixes timers with real I/O: alternates flushing and advancing the
// clock stepMs at a time until it settles. Rejects if it hasn't settled within maxMs of fake time.
export async function settle<T>(promise: Promise<T>, { stepMs = 1, maxMs = 10000 } = {}): Promise<T> {
  let settled = false
  promise.then(
    () => (settled = true),
    () => (settled = true),
  )
  for (let elapsed = 0; !settled; elapsed += stepMs) {
    await flush()
    if (settled) {
      break
    }
    if (elapsed >= maxMs) {
      throw new Error(`Promise didn't settle within ${maxMs}ms of fake time`)
    }
    jest.advanceTimersByTime(stepMs)
  }
  return promise
}
