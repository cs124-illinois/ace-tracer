import { describe, expect, jest, test } from "bun:test"
import {
  AceRecord,
  Complete,
  CursorChange,
  Delta,
  ScrollChange,
  SelectionChange,
  WindowSizeChange,
} from "@cs124/ace-recorder-types"
import AceStreamer from "../../src/ace/Streamer"
import { createMockEditor, MockEditor, MockEditSession } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"

// Selection, cursor, scroll, and window size listeners are throttled to one call per 100ms
const AFTER_THROTTLE = 150

function startStreamer(editor: MockEditor, setup?: (streamer: AceStreamer) => void) {
  const streamer = new AceStreamer(editor as any)
  setup?.(streamer)
  const records: AceRecord[] = []
  streamer.start((record) => records.push(record))
  const ofType = <T extends AceRecord["type"]>(type: T) =>
    records.filter((r) => r.type === type) as Extract<AceRecord, { type: T }>[]
  return { streamer, records, ofType }
}

describe("AceStreamer", () => {
  useFakeTimers(1000)

  describe("Complete records", () => {
    test("start emits Complete 'start' with the editor state", () => {
      const editor = createMockEditor("hello world")
      editor.simulateSelectionChange({ row: 0, column: 2 }, { row: 0, column: 7 })

      const { streamer, records } = startStreamer(editor)

      expect(records).toHaveLength(1)
      const rec = records[0] as Complete
      expect(Complete.guard(rec)).toBe(true)
      expect(rec.reason).toBe("start")
      expect(rec.value).toBe("hello world")
      // The cursor is the selection's lead, as in Ace
      expect(rec.cursor).toEqual({ row: 0, column: 7 })
      expect(rec.selection).toEqual({ start: { row: 0, column: 2 }, end: { row: 0, column: 7 } })
      expect(rec.scroll).toEqual({ top: 0, left: 0 })
      expect(rec.window).toEqual({ width: 800, height: 600, rows: 30, fontSize: 14, lineHeight: 18 })
      expect(rec.focused).toBe(true)
      expect(rec.timestamp).toEqual(new Date(1000))

      streamer.stop()
    })

    test("stop emits Complete 'end' with the editor state at stop", () => {
      const editor = createMockEditor("goodbye")
      const { streamer, records } = startStreamer(editor)
      editor.renderer.scrollToY(40)
      editor.simulateCursorMove(0, 4)
      jest.advanceTimersByTime(500)
      streamer.stop()

      const endRec = records[records.length - 1] as Complete
      expect(endRec.reason).toBe("end")
      expect(endRec.value).toBe("goodbye")
      expect(endRec.cursor).toEqual({ row: 0, column: 4 })
      expect(endRec.scroll).toEqual({ top: 40, left: 0 })
      expect(endRec.timestamp).toEqual(new Date(1500))
    })

    test("external metadata appears in Complete records", () => {
      const editor = createMockEditor("hello")
      const { streamer, records } = startStreamer(editor, (s) => {
        s.external = { foo: "bar", count: 42 }
      })
      streamer.stop()

      expect((records[0] as Complete).external).toEqual({ foo: "bar", count: 42 })
      expect((records[1] as Complete).external).toEqual({ foo: "bar", count: 42 })
    })

    test("sessionName appears in Complete records", () => {
      const editor = createMockEditor("hello")
      const { streamer, records } = startStreamer(editor, (s) => {
        s.sessionName = "main.java"
      })
      streamer.stop()

      expect((records[0] as Complete).sessionName).toBe("main.java")
      expect((records[1] as Complete).sessionName).toBe("main.java")
    })

    test("sessionName is absent from Complete records when not set", () => {
      const editor = createMockEditor("hello")
      const { streamer, records } = startStreamer(editor)
      streamer.stop()

      expect(records[0]).not.toHaveProperty("sessionName")
      expect(records[1]).not.toHaveProperty("sessionName")
    })

    test("focused state is captured", () => {
      const editor = createMockEditor("hello")
      editor.setFocused(false)
      const { streamer, records } = startStreamer(editor)
      streamer.stop()

      expect(records.map((r) => (r as Complete).focused)).toEqual([false, false])
    })
  })

  describe("deltas", () => {
    test("a change emits a Delta", () => {
      const editor = createMockEditor("abc")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: 3 },
        end: { row: 0, column: 4 },
        lines: ["d"],
      })

      const deltas = ofType("delta")
      expect(deltas).toHaveLength(1)
      expect(Delta.guard(deltas[0])).toBe(true)
      expect(deltas[0]).toMatchObject({
        action: "insert",
        start: { row: 0, column: 3 },
        end: { row: 0, column: 4 },
        lines: ["d"],
        focused: true,
      })
      streamer.stop()
    })

    test("a change event that leaves the value unchanged is suppressed", () => {
      const editor = createMockEditor("abc")
      const { streamer, ofType } = startStreamer(editor)

      editor.session.emit("change", {
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
        lines: [""],
      })

      expect(ofType("delta")).toHaveLength(0)
      streamer.stop()
    })

    test("deltas are not throttled", () => {
      const editor = createMockEditor("ab")
      const { streamer, ofType } = startStreamer(editor)

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

      expect(ofType("delta").map((d) => d.lines)).toEqual([["c"], ["d"]])
      expect(editor.getValue()).toBe("abcd")
      streamer.stop()
    })

    test("multi-row inserts and removes are captured", () => {
      const editor = createMockEditor("ab\ncd\nef")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: 1 },
        end: { row: 1, column: 1 },
        lines: ["X", "Y"],
      })
      expect(editor.getValue()).toBe("aX\nYb\ncd\nef")
      editor.simulateChange({
        action: "remove",
        start: { row: 0, column: 1 },
        end: { row: 3, column: 1 },
        lines: ["X", "Yb", "cd", "e"],
      })
      expect(editor.getValue()).toBe("af")

      expect(ofType("delta").map(({ action, start, end, lines }) => ({ action, start, end, lines }))).toEqual([
        { action: "insert", start: { row: 0, column: 1 }, end: { row: 1, column: 1 }, lines: ["X", "Y"] },
        { action: "remove", start: { row: 0, column: 1 }, end: { row: 3, column: 1 }, lines: ["X", "Yb", "cd", "e"] },
      ])
      streamer.stop()
    })

    test("setValue is captured as a remove and an insert, like Ace", () => {
      const editor = createMockEditor("old")
      const { streamer, ofType } = startStreamer(editor)

      editor.session.setValue("new\ntext")

      expect(ofType("delta").map(({ action, lines }) => ({ action, lines }))).toEqual([
        { action: "remove", lines: ["old"] },
        { action: "insert", lines: ["new", "text"] },
      ])
      streamer.stop()
    })
  })

  describe("selection and cursor", () => {
    test("a non-empty selection emits a SelectionChange", () => {
      const editor = createMockEditor("hello world")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })

      const selChanges = ofType("selectionchange")
      expect(selChanges).toHaveLength(1)
      expect(SelectionChange.guard(selChanges[0])).toBe(true)
      expect(selChanges[0]).toMatchObject({ start: { row: 0, column: 1 }, end: { row: 0, column: 5 }, focused: true })
      // The cursor listener ignores moves that leave a selection
      expect(ofType("cursorchange")).toHaveLength(0)
      streamer.stop()
    })

    test("a cursor move with an empty selection emits a CursorChange and no SelectionChange", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateCursorMove(0, 3)

      const cursorChanges = ofType("cursorchange")
      expect(cursorChanges).toHaveLength(1)
      expect(CursorChange.guard(cursorChanges[0])).toBe(true)
      expect(cursorChanges[0]).toMatchObject({ location: { row: 0, column: 3 }, focused: true })
      expect(ofType("selectionchange")).toHaveLength(0)
      streamer.stop()
    })

    test("a repeated cursor position is suppressed by comparison, not by the throttle", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateCursorMove(0, 3)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.simulateCursorMove(0, 3)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      expect(ofType("cursorchange").map((c) => c.location)).toEqual([{ row: 0, column: 3 }])

      // Control: a different position after the throttle window is emitted
      editor.simulateCursorMove(0, 4)
      expect(ofType("cursorchange").map((c) => c.location)).toEqual([
        { row: 0, column: 3 },
        { row: 0, column: 4 },
      ])
      streamer.stop()
    })

    test("a repeated selection is suppressed by comparison, not by the throttle", () => {
      const editor = createMockEditor("hello world")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 5 })
      jest.advanceTimersByTime(AFTER_THROTTLE)
      expect(ofType("selectionchange")).toHaveLength(1)

      editor.simulateSelectionChange({ row: 0, column: 1 }, { row: 0, column: 8 })
      expect(ofType("selectionchange").map((s) => s.end)).toEqual([
        { row: 0, column: 5 },
        { row: 0, column: 8 },
      ])
      streamer.stop()
    })

    test("moves within the throttle window are coalesced into a trailing record", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateCursorMove(0, 1)
      jest.advanceTimersByTime(10)
      editor.simulateCursorMove(0, 2)
      editor.simulateCursorMove(0, 3)
      expect(ofType("cursorchange")).toHaveLength(1)

      jest.advanceTimersByTime(AFTER_THROTTLE)
      expect(ofType("cursorchange").map((c) => c.location.column)).toEqual([1, 3])
      streamer.stop()
    })
  })

  describe("scrolling", () => {
    test("a scroll emits a ScrollChange", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.renderer.scrollToY(100)

      const scrollChanges = ofType("scrollchange")
      expect(scrollChanges).toHaveLength(1)
      expect(ScrollChange.guard(scrollChanges[0])).toBe(true)
      expect(scrollChanges[0]).toMatchObject({ top: 100, left: 0, triggeredByCursorChange: false })
      streamer.stop()
    })

    test("a repeated scroll position is suppressed by comparison, not by the throttle", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.renderer.scrollToY(50)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      // setScrollTop ignores an unchanged value, so resend the event directly
      editor.session.emit("changeScrollTop", 50)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      expect(ofType("scrollchange").map((s) => s.top)).toEqual([50])

      editor.renderer.scrollToY(80)
      expect(ofType("scrollchange").map((s) => s.top)).toEqual([50, 80])
      streamer.stop()
    })

    test("negative overscroll positions are clamped to 0", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      // Clamped to 0, the starting position, so nothing is recorded
      editor.session.setScrollTop(-50)
      expect(ofType("scrollchange")).toHaveLength(0)

      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.session.setScrollTop(40)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.session.setScrollTop(-20)
      expect(ofType("scrollchange").map((s) => s.top)).toEqual([40, 0])
      streamer.stop()
    })

    test("positions beyond the viewport height are recorded as-is", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.renderer.scrollToY(100000)

      expect(ofType("scrollchange").map((s) => s.top)).toEqual([100000])
      streamer.stop()
    })

    test("a scroll at the end of a cursor-moving operation is marked triggeredByCursorChange", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateCursorMoveWithScroll(40, 0, 300)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.renderer.scrollToY(100)

      expect(ofType("cursorchange").map((c) => c.location)).toEqual([{ row: 40, column: 0 }])
      expect(
        ofType("scrollchange").map(({ top, triggeredByCursorChange }) => ({ top, triggeredByCursorChange })),
      ).toEqual([
        { top: 300, triggeredByCursorChange: true },
        { top: 100, triggeredByCursorChange: false },
      ])
      streamer.stop()
    })
  })

  describe("window size", () => {
    test("a resize emits a WindowSizeChange", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateResize(1000, 400)

      const changes = ofType("windowsizechange")
      expect(changes).toHaveLength(1)
      expect(WindowSizeChange.guard(changes[0])).toBe(true)
      expect(changes[0]).toMatchObject({ width: 1000, height: 400, rows: 20, fontSize: 14, lineHeight: 18 })
      streamer.stop()
    })

    test("a resize event without a size change is suppressed", () => {
      const editor = createMockEditor("hello")
      const { streamer, ofType } = startStreamer(editor)

      editor.simulateResize(800, 600)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.simulateResize(1000, 400)
      jest.advanceTimersByTime(AFTER_THROTTLE)
      editor.simulateResize(1000, 400)

      expect(ofType("windowsizechange").map((c: any) => c.width)).toEqual([1000])
      streamer.stop()
    })
  })

  describe("lifecycle", () => {
    test("running state transitions", () => {
      const editor = createMockEditor("hello")
      const streamer = new AceStreamer(editor as any)

      expect(streamer.running).toBe(false)
      streamer.start(() => {})
      expect(streamer.running).toBe(true)
      streamer.stop()
      expect(streamer.running).toBe(false)
    })

    test("stop throws when not running", () => {
      const streamer = new AceStreamer(createMockEditor("hello") as any)
      expect(() => streamer.stop()).toThrow("Not running")
    })

    test("stop throws after already stopped", () => {
      const streamer = new AceStreamer(createMockEditor("hello") as any)
      streamer.start(() => {})
      streamer.stop()
      expect(() => streamer.stop()).toThrow("Not running")
    })

    test("events after stop are not emitted", () => {
      const editor = createMockEditor("hello")
      const { streamer, records } = startStreamer(editor)
      streamer.stop()
      const countAfterStop = records.length

      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: 5 },
        end: { row: 0, column: 6 },
        lines: ["!"],
      })
      editor.simulateCursorMove(0, 3)
      editor.renderer.scrollToY(30)
      editor.simulateResize(100, 100)
      jest.advanceTimersByTime(AFTER_THROTTLE)

      expect(records).toHaveLength(countAfterStop)
    })

    test("stop drops pending trailing calls so they can't fire into a restarted stream", () => {
      const editor = createMockEditor("hello")
      const { streamer, records } = startStreamer(editor)

      editor.simulateCursorMove(0, 1)
      jest.advanceTimersByTime(10)
      // Within the throttle window: these schedule trailing calls
      editor.simulateCursorMove(0, 2)
      editor.renderer.scrollToY(20)
      editor.renderer.scrollToY(30)
      streamer.stop()
      const firstRun = records.length

      const secondRun: AceRecord[] = []
      streamer.start((record) => secondRun.push(record))
      jest.advanceTimersByTime(AFTER_THROTTLE)

      expect(records).toHaveLength(firstRun)
      expect(secondRun.map((r) => r.type)).toEqual(["complete"])
      streamer.stop()
    })

    test("stop removes every listener it added", () => {
      const editor = createMockEditor("hello")
      const { streamer } = startStreamer(editor)
      streamer.stop()

      for (const event of ["change", "changeScrollTop"]) {
        expect(editor.session.listenerCount(event)).toBe(0)
      }
      for (const event of ["changeSelection", "changeSession", "beforeEndOperation"]) {
        expect(editor.listenerCount(event)).toBe(0)
      }
      expect(editor.renderer.listenerCount("resize")).toBe(0)
    })
  })

  describe("session switching", () => {
    test("changeSession emits a 'session' Complete with the new session's contents", () => {
      const editor = createMockEditor("first session")
      const { streamer, ofType } = startStreamer(editor, (s) => {
        s.sessionName = "session1"
      })

      editor.setSession(new MockEditSession("second session", "javascript"))

      const sessionRecords = ofType("complete").filter((r) => r.reason === "session")
      expect(sessionRecords).toHaveLength(1)
      expect(sessionRecords[0].sessionName).toBe("session1")
      expect(sessionRecords[0].value).toBe("second session")
      streamer.stop()
    })

    test("changeSession throws when sessionName is not set", () => {
      const editor = createMockEditor("first session")
      const { streamer } = startStreamer(editor)

      expect(() => editor.setSession(new MockEditSession("second session"))).toThrow("Must set sessionName")
      streamer.stop()
    })

    test("listeners move to the new session", () => {
      const editor = createMockEditor("first")
      const oldSession = editor.session
      const { streamer, ofType } = startStreamer(editor, (s) => {
        s.sessionName = "main"
      })
      const newSession = new MockEditSession("second")
      editor.setSession(newSession)

      newSession.getDocument().applyDelta({
        action: "insert",
        start: { row: 0, column: 6 },
        end: { row: 0, column: 7 },
        lines: ["!"],
      })
      newSession.setScrollTop(60)
      oldSession.getDocument().applyDelta({
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
        lines: ["?"],
      })
      oldSession.setScrollTop(90)

      expect(ofType("delta").map((d) => d.lines)).toEqual([["!"]])
      expect(ofType("scrollchange").map((s) => s.top)).toEqual([60])
      expect(oldSession.listenerCount("change")).toBe(0)
      expect(oldSession.listenerCount("changeScrollTop")).toBe(0)
      streamer.stop()
    })

    test("restarting after a session switch listens only to the current session", () => {
      const editor = createMockEditor("first")
      const oldSession = editor.session
      const streamer = new AceStreamer(editor as any)
      streamer.sessionName = "main"
      streamer.start(() => {})
      const newSession = new MockEditSession("second")
      editor.setSession(newSession)
      streamer.stop()

      // Stopping removes listeners from the session that is current at stop, including the window-size listener
      expect(newSession.listenerCount("change")).toBe(0)
      expect(newSession.listenerCount("changeScrollTop")).toBe(0)

      const records: AceRecord[] = []
      streamer.start((record) => records.push(record))
      expect(newSession.listenerCount("change")).toBe(1)
      // The scroll and window-size listeners
      expect(newSession.listenerCount("changeScrollTop")).toBe(2)
      expect(oldSession.listenerCount("change")).toBe(0)
      expect(oldSession.listenerCount("changeScrollTop")).toBe(0)

      oldSession.getDocument().applyDelta({
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
        lines: ["?"],
      })
      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: 6 },
        end: { row: 0, column: 7 },
        lines: ["!"],
      })

      expect((records[0] as Complete).value).toBe("second")
      expect(records.filter((r) => Delta.guard(r)).map((d) => (d as Delta).lines)).toEqual([["!"]])
      streamer.stop()
    })
  })
})
