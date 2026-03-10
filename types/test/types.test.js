import { describe, expect, test } from "bun:test"
import {
  AceRecord,
  AceTimestamp,
  AceTrace,
  Complete,
  CursorChange,
  Delta,
  ExternalChange,
  ScrollChange,
  SelectionChange,
  WindowSizeChange,
  deserializeAceRecordTimestamp,
} from "../src/index"
const baseTimestamp = new Date("2025-01-15T10:00:00Z")
const loc = (row, column) => ({ row, column })
function makeValidComplete(overrides) {
  return Complete.check({
    type: "complete",
    timestamp: baseTimestamp,
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
describe("AceTimestamp", () => {
  test("accepts Date objects", () => {
    expect(AceTimestamp.guard(new Date())).toBe(true)
  })
  test("accepts valid ISO strings", () => {
    expect(AceTimestamp.guard("2025-01-15T10:00:00Z")).toBe(true)
    expect(AceTimestamp.guard("2025-01-15")).toBe(true)
  })
  test("rejects garbage strings", () => {
    expect(AceTimestamp.guard("not-a-date")).toBe(false)
    expect(AceTimestamp.guard("")).toBe(false)
  })
  test("rejects non-string non-date values", () => {
    expect(AceTimestamp.guard(12345)).toBe(false)
    expect(AceTimestamp.guard(null)).toBe(false)
    expect(AceTimestamp.guard(undefined)).toBe(false)
  })
})
describe("Complete", () => {
  test("validates correct complete record", () => {
    const record = makeValidComplete()
    expect(Complete.guard(record)).toBe(true)
  })
  test("accepts optional sessionName", () => {
    const record = makeValidComplete({ sessionName: "main" })
    expect(record.sessionName).toBe("main")
  })
  test("accepts optional external data", () => {
    const record = makeValidComplete({ external: { foo: "bar" } })
    expect(record.external).toEqual({ foo: "bar" })
  })
  test("accepts optional sessionInfo", () => {
    const record = makeValidComplete({
      sessionInfo: [{ name: "main", contents: "code", mode: "javascript" }],
    })
    expect(record.sessionInfo).toHaveLength(1)
  })
  test("rejects missing required fields", () => {
    expect(() =>
      Complete.check({
        type: "complete",
        timestamp: baseTimestamp,
        focused: true,
        // missing value, selection, cursor, scroll, window, reason
      }),
    ).toThrow()
  })
  test("rejects invalid reason", () => {
    expect(() =>
      Complete.check({
        type: "complete",
        timestamp: baseTimestamp,
        focused: true,
        value: "hello",
        selection: { start: loc(0, 0), end: loc(0, 0) },
        cursor: loc(0, 0),
        scroll: { top: 0, left: 0 },
        window: { width: 800, height: 600, rows: 30, fontSize: 14, lineHeight: 18 },
        reason: "invalid_reason",
      }),
    ).toThrow()
  })
  test("validates all reason types", () => {
    for (const reason of ["start", "timer", "end", "manual", "session", "counter"]) {
      const record = makeValidComplete({ reason: reason })
      expect(record.reason).toBe(reason)
    }
  })
})
describe("Delta", () => {
  test("validates insert delta", () => {
    const delta = Delta.check({
      type: "delta",
      timestamp: baseTimestamp,
      focused: true,
      start: loc(0, 5),
      end: loc(0, 6),
      action: "insert",
      lines: ["x"],
    })
    expect(delta.action).toBe("insert")
  })
  test("validates remove delta", () => {
    const delta = Delta.check({
      type: "delta",
      timestamp: baseTimestamp,
      focused: true,
      start: loc(0, 5),
      end: loc(0, 6),
      action: "remove",
      lines: ["x"],
    })
    expect(delta.action).toBe("remove")
  })
  test("accepts optional id", () => {
    const delta = Delta.check({
      type: "delta",
      timestamp: baseTimestamp,
      focused: true,
      start: loc(0, 0),
      end: loc(0, 1),
      action: "insert",
      lines: ["a"],
      id: 42,
    })
    expect(delta.id).toBe(42)
  })
  test("rejects invalid action", () => {
    expect(() =>
      Delta.check({
        type: "delta",
        timestamp: baseTimestamp,
        focused: true,
        start: loc(0, 0),
        end: loc(0, 1),
        action: "replace",
        lines: ["a"],
      }),
    ).toThrow()
  })
  test("rejects missing lines", () => {
    expect(() =>
      Delta.check({
        type: "delta",
        timestamp: baseTimestamp,
        focused: true,
        start: loc(0, 0),
        end: loc(0, 1),
        action: "insert",
      }),
    ).toThrow()
  })
})
describe("SelectionChange", () => {
  test("validates correct selection change", () => {
    const record = SelectionChange.check({
      type: "selectionchange",
      timestamp: baseTimestamp,
      focused: true,
      start: loc(0, 0),
      end: loc(0, 10),
    })
    expect(record.type).toBe("selectionchange")
  })
  test("rejects missing end position", () => {
    expect(() =>
      SelectionChange.check({
        type: "selectionchange",
        timestamp: baseTimestamp,
        focused: true,
        start: loc(0, 0),
      }),
    ).toThrow()
  })
})
describe("CursorChange", () => {
  test("validates correct cursor change", () => {
    const record = CursorChange.check({
      type: "cursorchange",
      timestamp: baseTimestamp,
      focused: true,
      location: loc(5, 10),
    })
    expect(record.location.row).toBe(5)
  })
  test("rejects missing location", () => {
    expect(() =>
      CursorChange.check({
        type: "cursorchange",
        timestamp: baseTimestamp,
        focused: true,
      }),
    ).toThrow()
  })
})
describe("ScrollChange", () => {
  test("validates correct scroll change", () => {
    const record = ScrollChange.check({
      type: "scrollchange",
      timestamp: baseTimestamp,
      focused: true,
      top: 100,
      left: 0,
    })
    expect(record.top).toBe(100)
  })
  test("accepts optional triggeredByCursorChange", () => {
    const record = ScrollChange.check({
      type: "scrollchange",
      timestamp: baseTimestamp,
      focused: true,
      top: 100,
      left: 0,
      triggeredByCursorChange: true,
    })
    expect(record.triggeredByCursorChange).toBe(true)
  })
})
describe("WindowSizeChange", () => {
  test("validates correct window size change", () => {
    const record = WindowSizeChange.check({
      type: "windowsizechange",
      timestamp: baseTimestamp,
      focused: true,
      rows: 25,
    })
    expect(record.rows).toBe(25)
  })
})
describe("ExternalChange", () => {
  test("validates correct external change", () => {
    const record = ExternalChange.check({
      type: "external",
      timestamp: baseTimestamp,
    })
    expect(record.type).toBe("external")
  })
})
describe("AceRecord union", () => {
  test("accepts all record types", () => {
    expect(AceRecord.guard(makeValidComplete())).toBe(true)
    expect(
      AceRecord.guard({
        type: "delta",
        timestamp: baseTimestamp,
        focused: true,
        start: loc(0, 0),
        end: loc(0, 1),
        action: "insert",
        lines: ["a"],
      }),
    ).toBe(true)
    expect(
      AceRecord.guard({
        type: "cursorchange",
        timestamp: baseTimestamp,
        focused: true,
        location: loc(0, 0),
      }),
    ).toBe(true)
    expect(AceRecord.guard({ type: "external", timestamp: baseTimestamp })).toBe(true)
  })
  test("rejects unknown type", () => {
    expect(AceRecord.guard({ type: "unknown", timestamp: baseTimestamp })).toBe(false)
  })
})
describe("AceTrace", () => {
  const sessionInfo = [{ name: "main", contents: "hello world", mode: "text" }]
  function makeRecords(count, baseDateMs = baseTimestamp.valueOf()) {
    return Array.from({ length: count }, (_, i) =>
      makeValidComplete({
        timestamp: new Date(baseDateMs + i * 1000),
        reason: i === 0 ? "start" : i === count - 1 ? "end" : "timer",
      }),
    )
  }
  test("constructs valid trace", () => {
    const records = makeRecords(3)
    const trace = new AceTrace(records, sessionInfo, "main")
    expect(trace.records).toHaveLength(3)
    expect(trace.duration).toBe(2000)
    expect(trace.startTime).toEqual(baseTimestamp)
    expect(trace.sessionName).toBe("main")
  })
  test("throws on empty records", () => {
    expect(() => new AceTrace([], sessionInfo, "main")).toThrow("Empty trace")
  })
  test("computes duration correctly for single record", () => {
    const records = makeRecords(1)
    const trace = new AceTrace(records, sessionInfo, "main")
    expect(trace.duration).toBe(0)
  })
  test("computes startTime from first record", () => {
    const customBase = new Date("2025-06-01T12:00:00Z")
    const records = makeRecords(2, customBase.valueOf())
    const trace = new AceTrace(records, sessionInfo, "main")
    expect(trace.startTime).toEqual(customBase)
  })
  test("throws when sessionName doesn't match sessionInfo", () => {
    const records = makeRecords(2)
    expect(() => new AceTrace(records, sessionInfo, "nonexistent")).toThrow(
      "Must set sessionName when trace includes multiple sessions",
    )
  })
  test("throws on blank session names with multiple sessions", () => {
    const records = makeRecords(2)
    const multiSessionInfo = [
      { name: "", contents: "a", mode: "text" },
      { name: "other", contents: "b", mode: "text" },
    ]
    expect(() => new AceTrace(records, multiSessionInfo, "")).toThrow("Session names must not be blank")
  })
  test("allows blank session name for single session", () => {
    const records = makeRecords(2)
    const singleSession = [{ name: "", contents: "code", mode: "text" }]
    const trace = new AceTrace(records, singleSession, "")
    expect(trace.sessionName).toBe("")
  })
})
describe("deserializeAceRecordTimestamp", () => {
  test("converts string timestamp to Date", () => {
    const record = makeValidComplete({ timestamp: "2025-01-15T10:00:00Z" })
    const deserialized = deserializeAceRecordTimestamp(record)
    expect(deserialized.timestamp).toBeInstanceOf(Date)
    expect(deserialized.timestamp.toISOString()).toBe("2025-01-15T10:00:00.000Z")
  })
  test("leaves Date timestamps unchanged", () => {
    const record = makeValidComplete({ timestamp: baseTimestamp })
    const deserialized = deserializeAceRecordTimestamp(record)
    expect(deserialized.timestamp).toEqual(baseTimestamp)
  })
})
//# sourceMappingURL=types.test.js.map
