import { Complete } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AceRecordReplayer from "../../src/ace/RecordReplayer"
import { createMockEditor } from "../fixtures/ace-mock"

function createRR(value = "") {
  const editor = createMockEditor(value)
  const rr = new AceRecordReplayer(editor as any)
  return { editor, rr }
}

function seekAndSync(rr: AceRecordReplayer, timeSec: number) {
  rr.currentTime = timeSec
  const now = Date.now()
  ;(rr as any).syncTime = now
  ;(rr as any).startTime = now - timeSec * 1000
  rr.sync()
}

describe("AceRecordReplayer end-to-end", () => {
  describe("record and stop produces valid trace", () => {
    test("trace has start and end Complete records", async () => {
      const { rr } = createRR("initial")

      await rr.record()
      await rr.stop()

      const src = rr.src!
      expect(src).toBeDefined()
      expect(src.records.length).toBeGreaterThanOrEqual(2)

      const first = src.records[0]
      const last = src.records[src.records.length - 1]
      expect(Complete.guard(first)).toBe(true)
      expect(Complete.guard(last)).toBe(true)
      expect((first as any).reason).toBe("start")
      expect((last as any).reason).toBe("end")
    })

    test("trace value matches editor value at record time", async () => {
      const { rr } = createRR("hello world")

      await rr.record()
      await rr.stop()

      const src = rr.src!
      const startRecord = src.records[0] as any
      expect(startRecord.value).toBe("hello world")
    })

    test("state transitions correctly through the cycle", async () => {
      const { rr } = createRR()
      const states: string[] = []
      rr.addStateListener((state) => states.push(state))

      expect(rr.state).toBe("paused")

      await rr.record()
      expect(rr.state).toBe("recording")

      await rr.stop()
      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(true)

      expect(states).toEqual(["recording", "paused"])
    })
  })

  describe("record changes and verify playback state", () => {
    test("editor changes are captured and replayed via seek", async () => {
      const { editor, rr } = createRR("abc")

      await rr.record()

      // Simulate inserting "X" at position (0,3)
      const delta = {
        action: "insert",
        start: { row: 0, column: 3 },
        end: { row: 0, column: 4 },
        lines: ["X"],
      }
      editor.simulateChange(delta)

      // Small delay so the end record has a later timestamp
      await new Promise((r) => setTimeout(r, 10))

      await rr.stop()

      const src = rr.src!
      expect(src.records.length).toBeGreaterThanOrEqual(3) // start + delta + end

      // Seek to end and sync -- editor should reflect changes
      seekAndSync(rr, rr.duration)

      // The end Complete record should have the modified value
      const endRecord = src.records[src.records.length - 1] as any
      expect(endRecord.value).toBe("abcX")
    })

    test("cursor changes are captured", async () => {
      const { editor, rr } = createRR("hello")

      await rr.record()

      editor.session.selection.moveCursorTo(0, 3)
      editor.simulateCursorMove(0, 3)

      await new Promise((r) => setTimeout(r, 10))

      await rr.stop()

      const src = rr.src!
      const endRecord = src.records[src.records.length - 1] as any
      expect(endRecord.cursor.row).toBe(0)
      expect(endRecord.cursor.column).toBe(3)
    })
  })

  describe("seek to before and after changes", () => {
    test("seek to time 0 shows original state", async () => {
      const { editor, rr } = createRR("original")

      await rr.record()

      // Wait so the delta has a later timestamp than the start Complete
      await new Promise((r) => setTimeout(r, 50))

      // Modify the editor using simulateChange (proper insert delta)
      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: 8 },
        end: { row: 0, column: 9 },
        lines: ["!"],
      })

      await new Promise((r) => setTimeout(r, 50))

      await rr.stop()

      // Verify the end state has the modification
      const endRecord = rr.src!.records[rr.src!.records.length - 1] as Complete
      expect(endRecord.value).toBe("original!")

      // Seek to time 0 -- the start Complete should restore "original"
      seekAndSync(rr, 0)
      expect(editor.getValue()).toBe("original")
    })

    test("seek to end shows final state", async () => {
      const { editor, rr } = createRR("start")

      await rr.record()

      editor.session.setValue("end value")

      await new Promise((r) => setTimeout(r, 10))

      await rr.stop()

      // First seek to 0 to reset
      seekAndSync(rr, 0)
      expect(editor.getValue()).toBe("start")

      // Now seek to end
      seekAndSync(rr, rr.duration)
      expect(editor.getValue()).toBe("end value")
    })
  })

  describe("multiple sequential edits maintain order", () => {
    test("intermediate states can be observed at different seek points", async () => {
      const { editor, rr } = createRR("v0")

      await rr.record()

      // First edit with sufficient delay for distinct timestamps
      await new Promise((r) => setTimeout(r, 50))
      editor.session.setValue("v1")
      editor.session.emit("change", {
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 2 },
        lines: ["v1"],
      })

      await new Promise((r) => setTimeout(r, 50))

      // Add a complete record to create a sync point with "v1" value
      rr.recorder.addCompleteRecord("manual")

      await new Promise((r) => setTimeout(r, 50))

      // Second edit
      editor.session.setValue("v2")
      editor.session.emit("change", {
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 2 },
        lines: ["v2"],
      })

      await new Promise((r) => setTimeout(r, 50))

      await rr.stop()

      const src = rr.src!
      // Find Complete records
      const completes = src.records.filter((r) => Complete.guard(r))
      expect(completes.length).toBeGreaterThanOrEqual(3) // start + manual + end

      // Seek to beginning should show v0
      seekAndSync(rr, 0)
      expect(editor.getValue()).toBe("v0")

      // Seek to end should show v2
      seekAndSync(rr, rr.duration)
      expect(editor.getValue()).toBe("v2")
    })
  })

  describe("record again overwrites previous", () => {
    test("second recording produces a new trace", async () => {
      const { editor, rr } = createRR("first")

      // First recording
      await rr.record()
      await new Promise((r) => setTimeout(r, 10))
      await rr.stop()

      const firstSrc = rr.src!
      expect(firstSrc).toBeDefined()
      const firstStartRecord = firstSrc.records[0] as any
      expect(firstStartRecord.value).toBe("first")

      // Change editor state before second recording
      editor.session.setValue("second")

      // Second recording
      await rr.record()
      await new Promise((r) => setTimeout(r, 10))
      await rr.stop()

      const secondSrc = rr.src!
      expect(secondSrc).toBeDefined()
      const secondStartRecord = secondSrc.records[0] as any
      expect(secondStartRecord.value).toBe("second")

      // The two traces should be different objects
      expect(secondSrc).not.toBe(firstSrc)
    })
  })

  describe("session info is captured correctly", () => {
    test("trace includes session info with editor contents and mode", async () => {
      const { rr } = createRR("console.log('hi')")

      await rr.record()
      await rr.stop()

      const src = rr.src!
      expect(src.sessionInfo).toBeDefined()
      expect(src.sessionInfo.length).toBeGreaterThanOrEqual(1)

      const session = src.sessionInfo[0]
      expect(session.name).toBe("")
      expect(session.contents).toBe("console.log('hi')")
      expect(session.mode).toBe("text")
    })

    test("session info on Complete records matches trace session info", async () => {
      const { rr } = createRR("test content")

      await rr.record()
      await rr.stop()

      const src = rr.src!
      const startComplete = src.records[0] as any
      expect(startComplete.sessionInfo).toBeDefined()
      expect(startComplete.sessionInfo[0].contents).toBe("test content")
    })
  })

  describe("scroll state is captured and restored", () => {
    test("scroll position is recorded in Complete records", async () => {
      const { editor, rr } = createRR("line1\nline2\nline3")

      // Set scroll on renderer (where getComplete reads from) AND session
      editor.renderer.scrollToY(100)
      editor.session.setScrollTop(100)

      await rr.record()
      await new Promise((r) => setTimeout(r, 10))
      await rr.stop()

      const src = rr.src!
      const startRecord = src.records[0] as any
      expect(startRecord.scroll.top).toBe(100)
    })

    test("seek restores scroll position from Complete record", async () => {
      const { editor, rr } = createRR("content")

      await rr.record()

      // Change scroll during recording
      editor.session.setScrollTop(200)

      await new Promise((r) => setTimeout(r, 10))

      await rr.stop()

      // Seek to beginning where scroll was 0
      seekAndSync(rr, 0)
      // The session's scroll is set by applyComplete
      expect(editor.session.getScrollTop()).toBe(0)
    })
  })
})
