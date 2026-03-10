import { AceTrace, Complete, CursorChange, Delta, ScrollChange, SelectionChange } from "@cs124/ace-recorder-types"

const BASE_DATE = new Date("2025-01-15T10:00:00.000Z")
const loc = (row: number, column: number) => ({ row, column })

export function makeComplete(overrides?: Record<string, unknown>): Complete {
  return Complete.check({
    type: "complete",
    timestamp: BASE_DATE,
    focused: true,
    value: "hello world",
    selection: { start: loc(0, 0), end: loc(0, 0) },
    cursor: loc(0, 5),
    scroll: { top: 0, left: 0 },
    window: { width: 800, height: 600, rows: 30, fontSize: 14, lineHeight: 18 },
    reason: "start",
    ...overrides,
  })
}

export function makeDelta(overrides?: Record<string, unknown>): Delta {
  return Delta.check({
    type: "delta",
    timestamp: BASE_DATE,
    focused: true,
    start: loc(0, 11),
    end: loc(0, 12),
    action: "insert",
    lines: ["!"],
    ...overrides,
  })
}

export function makeCursorChange(overrides?: Record<string, unknown>): CursorChange {
  return CursorChange.check({
    type: "cursorchange",
    timestamp: BASE_DATE,
    focused: true,
    location: loc(0, 5),
    ...overrides,
  })
}

export function makeSelectionChange(overrides?: Record<string, unknown>): SelectionChange {
  return SelectionChange.check({
    type: "selectionchange",
    timestamp: BASE_DATE,
    focused: true,
    start: loc(0, 0),
    end: loc(0, 10),
    ...overrides,
  })
}

export function makeScrollChange(overrides?: Record<string, unknown>): ScrollChange {
  return ScrollChange.check({
    type: "scrollchange",
    timestamp: BASE_DATE,
    focused: true,
    top: 0,
    left: 0,
    ...overrides,
  })
}

export function makeTrace(options: { durationMs: number; records?: number }): AceTrace {
  const count = options.records ?? Math.max(2, Math.ceil(options.durationMs / 1000) + 1)
  const interval = count > 1 ? options.durationMs / (count - 1) : 0
  const records = []

  for (let i = 0; i < count; i++) {
    const ts = new Date(BASE_DATE.valueOf() + i * interval)
    if (i % 2 === 0) {
      records.push(
        makeComplete({
          timestamp: ts,
          reason: i === 0 ? "start" : i === count - 1 ? "end" : "timer",
        }),
      )
    } else {
      records.push(
        makeDelta({
          timestamp: ts,
        }),
      )
    }
  }

  const sessionInfo = [{ name: "main", contents: "hello world", mode: "text" }]
  return new AceTrace(records, sessionInfo, "main")
}

export function makeClickTrackTrace(clickTimesMs: number[]): AceTrace {
  if (clickTimesMs.length === 0) {
    throw new Error("Need at least one click time")
  }

  const records = []

  // Start with a complete record at t=0 with empty value
  records.push(
    makeComplete({
      timestamp: BASE_DATE,
      reason: "start",
      value: "",
      sessionInfo: [{ name: "main", contents: "", mode: "text" }],
    }),
  )

  // Add delta records at each click time
  for (let i = 0; i < clickTimesMs.length; i++) {
    const ts = new Date(BASE_DATE.valueOf() + clickTimesMs[i])
    // Add a complete just before each delta for index building
    records.push(
      makeComplete({
        timestamp: ts,
        reason: "timer",
        value: "x".repeat(i + 1),
        sessionInfo: [{ name: "main", contents: "x".repeat(i + 1), mode: "text" }],
      }),
    )
    records.push(
      makeDelta({
        timestamp: ts,
        start: loc(0, i),
        end: loc(0, i + 1),
      }),
    )
  }

  const sessionInfo = [{ name: "main", contents: "", mode: "text" }]
  return new AceTrace(records, sessionInfo, "main")
}

export { BASE_DATE }
