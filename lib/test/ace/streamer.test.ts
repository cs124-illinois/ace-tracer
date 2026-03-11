import { Complete, CursorChange, Delta, ScrollChange, SelectionChange } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AceStreamer from "../../src/ace/Streamer"
import { createMockEditor, MockEditSession } from "../fixtures/ace-mock"

describe("AceStreamer", () => {
  test("start emits Complete 'start' with correct fields", () => {
    const editor = createMockEditor("hello world")
    editor.selection.moveCursorTo(0, 5)
    editor.selection.setSelectionRange({ start: { row: 0, column: 2 }, end: { row: 0, column: 7 } })

    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    expect(records).toHaveLength(1)
    const rec = records[0]
    expect(Complete.guard(rec)).toBe(true)
    expect(rec.reason).toBe("start")
    expect(rec.value).toBe("hello world")
    expect(rec.cursor).toEqual({ row: 0, column: 5 })
    expect(rec.selection).toEqual({ start: { row: 0, column: 2 }, end: { row: 0, column: 7 } })
    expect(rec.scroll).toEqual({ top: 0, left: 0 })
    expect(rec.window).toEqual({
      width: 800,
      height: 600,
      rows: 30,
      fontSize: 14,
      lineHeight: 18,
    })
    expect(rec.focused).toBe(true)
    expect(rec.type).toBe("complete")
    expect(rec.timestamp).toBeInstanceOf(Date)

    streamer.stop()
  })

  test("stop emits Complete 'end' with correct fields", () => {
    const editor = createMockEditor("goodbye")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    expect(records).toHaveLength(2)
    const endRec = records[1]
    expect(Complete.guard(endRec)).toBe(true)
    expect(endRec.reason).toBe("end")
    expect(endRec.value).toBe("goodbye")
    expect(endRec.type).toBe("complete")
    expect(endRec.cursor).toEqual({ row: 0, column: 0 })
    expect(endRec.scroll).toEqual({ top: 0, left: 0 })
  })

  test("delta emission on session change event", () => {
    const editor = createMockEditor("abc")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // simulateChange applies the delta AND emits the session "change" event
    const delta = {
      action: "insert" as const,
      start: { row: 0, column: 3 },
      end: { row: 0, column: 4 },
      lines: ["d"],
    }
    editor.simulateChange(delta)

    const deltas = records.filter((r) => r.type === "delta")
    expect(deltas).toHaveLength(1)
    expect(Delta.guard(deltas[0])).toBe(true)
    expect(deltas[0].action).toBe("insert")
    expect(deltas[0].start).toEqual({ row: 0, column: 3 })
    expect(deltas[0].end).toEqual({ row: 0, column: 4 })
    expect(deltas[0].lines).toEqual(["d"])
    expect(deltas[0].focused).toBe(true)

    streamer.stop()
  })

  test("delta is suppressed when value is unchanged", () => {
    const editor = createMockEditor("abc")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Emit a change event on the session without actually changing the value
    ;(editor.session as any).emit("change", {
      action: "insert",
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
      lines: [""],
    })

    const deltas = records.filter((r) => r.type === "delta")
    expect(deltas).toHaveLength(0)

    streamer.stop()
  })

  test("selection change emission for non-empty selection", () => {
    const editor = createMockEditor("hello world")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Use the helper to set selection and trigger changeSelection
    ;(editor as any).simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })

    const selChanges = records.filter((r) => r.type === "selectionchange")
    expect(selChanges).toHaveLength(1)
    expect(SelectionChange.guard(selChanges[0])).toBe(true)
    expect(selChanges[0].start).toEqual({ row: 0, column: 1 })
    expect(selChanges[0].end).toEqual({ row: 0, column: 5 })
    expect(selChanges[0].focused).toBe(true)

    streamer.stop()
  })

  test("cursor change emission when selection is empty", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Use the helper to move cursor (sets empty selection and emits changeSelection)
    ;(editor as any).simulateCursorMove(0, 3)

    const cursorChanges = records.filter((r) => r.type === "cursorchange")
    expect(cursorChanges).toHaveLength(1)
    expect(CursorChange.guard(cursorChanges[0])).toBe(true)
    expect(cursorChanges[0].location).toEqual({ row: 0, column: 3 })
    expect(cursorChanges[0].focused).toBe(true)

    streamer.stop()
  })

  test("cursor change is suppressed when selection is non-empty", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Set a non-empty selection -- cursor change should be suppressed
    ;(editor as any).simulateSelectionChange({ row: 0, column: 0 }, { row: 0, column: 5 })

    const cursorChanges = records.filter((r) => r.type === "cursorchange")
    expect(cursorChanges).toHaveLength(0)

    streamer.stop()
  })

  test("scroll change emission on changeScrollTop", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Update both renderer scroll position and trigger session changeScrollTop
    editor.renderer.scrollToY(100)
    editor.session.setScrollTop(100)

    const scrollChanges = records.filter((r) => r.type === "scrollchange")
    expect(scrollChanges).toHaveLength(1)
    expect(ScrollChange.guard(scrollChanges[0])).toBe(true)
    expect(scrollChanges[0].top).toBe(100)
    expect(scrollChanges[0].left).toBe(0)

    streamer.stop()
  })

  test("scroll value is clamped to bounds", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Set renderer scroll to negative value -- clamped to 0, same as initial, so suppressed
    editor.renderer.scrollToY(-50)
    editor.session.setScrollTop(-50)

    const scrollChanges = records.filter((r) => r.type === "scrollchange")
    expect(scrollChanges).toHaveLength(0)

    streamer.stop()
  })

  test("external metadata appears in Complete records", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    streamer.external = { foo: "bar", count: 42 }
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    const startRec = records[0]
    expect(startRec.reason).toBe("start")
    expect(startRec.external).toEqual({ foo: "bar", count: 42 })

    const endRec = records[1]
    expect(endRec.reason).toBe("end")
    expect(endRec.external).toEqual({ foo: "bar", count: 42 })
  })

  test("sessionName appears in Complete records", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    streamer.sessionName = "main.java"
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    expect(records[0].sessionName).toBe("main.java")
    expect(records[1].sessionName).toBe("main.java")
  })

  test("sessionName is absent from Complete records when not set", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    expect(records[0].sessionName).toBeUndefined()
    expect(records[1].sessionName).toBeUndefined()
  })

  test("running state transitions correctly", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)

    expect(streamer.running).toBe(false)
    streamer.start(() => {})
    expect(streamer.running).toBe(true)
    streamer.stop()
    expect(streamer.running).toBe(false)
  })

  test("stop throws when not running", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)

    expect(() => streamer.stop()).toThrow("Not running")
  })

  test("stop throws after already stopped", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)

    streamer.start(() => {})
    streamer.stop()
    expect(() => streamer.stop()).toThrow("Not running")
  })

  test("duplicate cursor events are suppressed", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Move cursor to a new position (empty selection)
    ;(editor as any).simulateCursorMove(0, 3)

    const firstCount = records.filter((r) => r.type === "cursorchange").length
    expect(firstCount).toBe(1)

    // Emit same cursor position again -- should be suppressed since row/column haven't changed
    ;(editor as any).simulateCursorMove(0, 3)

    const secondCount = records.filter((r) => r.type === "cursorchange").length
    expect(secondCount).toBe(1)

    streamer.stop()
  })

  test("duplicate selection events are suppressed", () => {
    const editor = createMockEditor("hello world")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    // Set a non-empty selection
    ;(editor as any).simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })

    const firstCount = records.filter((r) => r.type === "selectionchange").length
    expect(firstCount).toBe(1)

    // Emit same selection again -- should be suppressed
    ;(editor as any).simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })

    const secondCount = records.filter((r) => r.type === "selectionchange").length
    expect(secondCount).toBe(1)

    streamer.stop()
  })

  test("duplicate scroll events are suppressed", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    editor.renderer.scrollToY(50)
    editor.session.setScrollTop(50)

    const firstCount = records.filter((r) => r.type === "scrollchange").length
    expect(firstCount).toBe(1)

    // Emit same scroll position again -- renderer already at 50, trigger event again
    editor.session.setScrollTop(50)

    const secondCount = records.filter((r) => r.type === "scrollchange").length
    expect(secondCount).toBe(1)

    streamer.stop()
  })

  test("changeSession emits Complete with reason 'session'", () => {
    const editor = createMockEditor("first session")
    const streamer = new AceStreamer(editor as any)
    streamer.sessionName = "session1"
    const records: any[] = []

    streamer.start((record) => records.push(record))

    const newSession = new MockEditSession("second session", "javascript")
    editor.setSession(newSession as any)

    const sessionRecords = records.filter((r) => r.type === "complete" && r.reason === "session")
    expect(sessionRecords).toHaveLength(1)
    expect(sessionRecords[0].sessionName).toBe("session1")

    streamer.stop()
  })

  test("changeSession throws when sessionName is not set", () => {
    const editor = createMockEditor("first session")
    const streamer = new AceStreamer(editor as any)
    // intentionally not setting sessionName
    const records: any[] = []

    streamer.start((record) => records.push(record))

    const newSession = new MockEditSession("second session")
    expect(() => editor.setSession(newSession as any)).toThrow("Must set sessionName")

    streamer.stop()
  })

  test("events on new session are captured after changeSession", () => {
    const editor = createMockEditor("first")
    const streamer = new AceStreamer(editor as any)
    streamer.sessionName = "main"
    const records: any[] = []

    streamer.start((record) => records.push(record))

    const newSession = new MockEditSession("second")
    editor.setSession(newSession as any)

    // Trigger a change on the new session
    const delta = {
      action: "insert" as const,
      start: { row: 0, column: 6 },
      end: { row: 0, column: 7 },
      lines: ["!"],
    }
    editor.simulateChange(delta)

    const deltas = records.filter((r) => r.type === "delta")
    expect(deltas).toHaveLength(1)
    expect(deltas[0].action).toBe("insert")

    streamer.stop()
  })

  test("events not emitted after stop", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    const countAfterStop = records.length

    // Try to trigger events after stop -- listeners should be removed
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 5 },
      end: { row: 0, column: 6 },
      lines: ["!"],
    })
    ;(editor as any).simulateCursorMove(0, 3)

    expect(records.length).toBe(countAfterStop)
  })

  test("focused state is captured in records", () => {
    const editor = createMockEditor("hello")
    editor.setFocused(false)
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    expect(records[0].focused).toBe(false)

    streamer.stop()
    expect(records[1].focused).toBe(false)
  })

  test("multiple deltas are each captured", () => {
    const editor = createMockEditor("ab")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 2 },
      end: { row: 0, column: 3 },
      lines: ["c"],
    })
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 3 },
      end: { row: 0, column: 4 },
      lines: ["d"],
    })

    const deltas = records.filter((r) => r.type === "delta")
    expect(deltas).toHaveLength(2)
    expect(deltas[0].lines).toEqual(["c"])
    expect(deltas[1].lines).toEqual(["d"])

    streamer.stop()
  })
})
