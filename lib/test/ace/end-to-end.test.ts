import { describe, expect, jest, test } from "bun:test"
import { Complete, Delta, ScrollChange } from "@cs124/ace-recorder-types"
import AceRecordReplayer from "../../src/ace/RecordReplayer"
import { createMockEditor } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"

// The timer is disabled so traces contain only the records each test creates
function createRR(value = "") {
  const editor = createMockEditor(value)
  const rr = new AceRecordReplayer(editor as any, { recorderOptions: { completeInterval: 0 } })
  return { editor, rr }
}

// The currentTime setter takes its sync point from the (faked) clock, so sync() applies records up to timeSec
function seekAndSync(rr: AceRecordReplayer, timeSec: number) {
  rr.currentTime = timeSec
  rr.sync()
}

const insert = (row: number, column: number, text: string) => ({
  action: "insert" as const,
  start: { row, column },
  end: { row, column: column + text.length },
  lines: [text],
})

describe("AceRecordReplayer end-to-end", () => {
  useFakeTimers(0)

  describe("record and stop produces a valid trace", () => {
    test("trace has start and end Complete records", async () => {
      const { rr } = createRR("initial")

      await rr.record()
      jest.advanceTimersByTime(100)
      await rr.stop()

      const src = rr.src!
      expect(src.records.map((r) => (r as Complete).reason)).toEqual(["start", "end"])
      expect(src.duration).toBe(100)
      expect((src.records[0] as Complete).value).toBe("initial")
    })

    test("state transitions through the cycle", async () => {
      const { rr } = createRR()
      const states: string[] = []
      rr.addStateListener((state) => states.push(state))

      await rr.record()
      expect(rr.state).toBe("recording")
      expect(rr.hasRecording).toBe(false)

      await rr.stop()
      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(true)
      expect(states).toEqual(["recording", "paused"])
    })
  })

  describe("edits are recorded and replayed", () => {
    test("a delta is recorded and replayed at its time", async () => {
      const { editor, rr } = createRR("abc")

      await rr.record()
      jest.advanceTimersByTime(100)
      editor.simulateChange(insert(0, 3, "X"))
      jest.advanceTimersByTime(100)
      await rr.stop()

      const records = rr.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "delta", "complete"])
      expect((records[1] as Delta).lines).toEqual(["X"])
      expect((records[2] as Complete).value).toBe("abcX")

      seekAndSync(rr, 0.05)
      expect(editor.getValue()).toBe("abc")
      // Between the delta and the end Complete, so the delta itself is what produces the value
      seekAndSync(rr, 0.15)
      expect(editor.getValue()).toBe("abcX")
    })

    test("setValue is recorded as deltas and replayed", async () => {
      const { editor, rr } = createRR("start")

      await rr.record()
      jest.advanceTimersByTime(100)
      editor.session.setValue("end value")
      jest.advanceTimersByTime(100)
      await rr.stop()

      const deltas = rr.src!.records.filter((r) => Delta.guard(r)) as Delta[]
      expect(deltas.map(({ action, lines }) => ({ action, lines }))).toEqual([
        { action: "remove", lines: ["start"] },
        { action: "insert", lines: ["end value"] },
      ])

      seekAndSync(rr, 0)
      expect(editor.getValue()).toBe("start")
      seekAndSync(rr, 0.15)
      expect(editor.getValue()).toBe("end value")
      seekAndSync(rr, 0.05)
      expect(editor.getValue()).toBe("start")
      seekAndSync(rr, rr.duration)
      expect(editor.getValue()).toBe("end value")
    })

    test("intermediate states are observed at each seek point", async () => {
      const { editor, rr } = createRR("v0")

      await rr.record()
      jest.advanceTimersByTime(50)
      editor.session.setValue("v1")
      jest.advanceTimersByTime(50)
      rr.recorder.addCompleteRecord("manual")
      jest.advanceTimersByTime(50)
      editor.session.setValue("v2")
      jest.advanceTimersByTime(50)
      await rr.stop()

      expect(rr.src!.records.filter((r) => Complete.guard(r)).map((r) => (r as Complete).reason)).toEqual([
        "start",
        "manual",
        "end",
      ])

      const expected: [number, string][] = [
        [0.175, "v2"],
        [0, "v0"],
        [0.075, "v1"],
        // Starts from the manual Complete
        [0.125, "v1"],
        [0.025, "v0"],
        [0.2, "v2"],
      ]
      for (const [time, value] of expected) {
        seekAndSync(rr, time)
        expect(editor.getValue()).toBe(value)
      }
    })

    test("cursor changes are recorded and replayed", async () => {
      const { editor, rr } = createRR("hello")

      await rr.record()
      jest.advanceTimersByTime(100)
      editor.simulateCursorMove(0, 3)
      jest.advanceTimersByTime(100)
      await rr.stop()

      const records = rr.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "cursorchange", "complete"])
      expect((records[2] as Complete).cursor).toEqual({ row: 0, column: 3 })

      seekAndSync(rr, 0.15)
      expect(editor.selection.getCursor()).toEqual({ row: 0, column: 3 })
      seekAndSync(rr, 0)
      expect(editor.selection.getCursor()).toEqual({ row: 0, column: 0 })
    })

    test("recording again produces a new trace", async () => {
      const { editor, rr } = createRR("first")

      await rr.record()
      jest.advanceTimersByTime(10)
      await rr.stop()
      const firstSrc = rr.src!

      editor.session.setValue("second")
      await rr.record()
      jest.advanceTimersByTime(10)
      await rr.stop()
      const secondSrc = rr.src!

      expect((firstSrc.records[0] as Complete).value).toBe("first")
      expect((secondSrc.records[0] as Complete).value).toBe("second")
      expect(secondSrc).not.toBe(firstSrc)
    })
  })

  describe("session info", () => {
    test("trace includes session info with editor contents and mode", async () => {
      const { editor, rr } = createRR("console.log('hi')")

      await rr.record()
      editor.simulateChange(insert(0, 17, ";"))
      await rr.stop()

      expect(rr.src!.sessionInfo).toEqual([{ name: "", contents: "console.log('hi');", mode: "text" }])
    })

    test("Complete records carry the session info at that time", async () => {
      const { editor, rr } = createRR("test content")

      await rr.record()
      editor.simulateChange(insert(0, 0, ">"))
      await rr.stop()

      const records = rr.src!.records as Complete[]
      expect(records[0].sessionInfo).toEqual([{ name: "", contents: "test content", mode: "text" }])
      expect(records[records.length - 1].sessionInfo).toEqual([{ name: "", contents: ">test content", mode: "text" }])
    })
  })

  describe("scroll state", () => {
    test("the starting scroll position is recorded in the start Complete", async () => {
      const { editor, rr } = createRR("line1\nline2\nline3")
      editor.renderer.scrollToY(100)

      await rr.record()
      jest.advanceTimersByTime(10)
      await rr.stop()

      expect((rr.src!.records[0] as Complete).scroll).toEqual({ top: 100, left: 0 })
    })

    test("scrolling during recording is recorded and replayed", async () => {
      const { editor, rr } = createRR("content")

      await rr.record()
      jest.advanceTimersByTime(100)
      editor.renderer.scrollToY(200)
      jest.advanceTimersByTime(100)
      await rr.stop()

      const records = rr.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "scrollchange", "complete"])
      expect((records[1] as ScrollChange).top).toBe(200)
      expect((records[2] as Complete).scroll.top).toBe(200)

      // The editor is still scrolled from the recording, so seeking to 0 must reset it
      expect(editor.session.getScrollTop()).toBe(200)
      seekAndSync(rr, 0)
      expect(editor.session.getScrollTop()).toBe(0)
      // Before the end Complete: the ScrollChange record restores the position
      seekAndSync(rr, 0.15)
      expect(editor.session.getScrollTop()).toBe(200)
      seekAndSync(rr, 0.05)
      expect(editor.session.getScrollTop()).toBe(0)
      seekAndSync(rr, rr.duration)
      expect(editor.session.getScrollTop()).toBe(200)
    })
  })

  describe("timer-driven playback", () => {
    test("playback applies recorded edits as time passes and ends paused", async () => {
      const { editor, rr } = createRR("")
      const events: string[] = []

      await rr.record()
      for (const [i, char] of ["a", "b", "c"].entries()) {
        jest.advanceTimersByTime(100)
        editor.simulateChange(insert(0, i, char))
      }
      jest.advanceTimersByTime(100)
      await rr.stop()

      editor.session.setValue("stale")
      rr.addEventListener((event) => events.push(event))
      await rr.play()
      expect(editor.getValue()).toBe("")

      const seen: string[] = []
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(100)
        seen.push(editor.getValue())
      }

      expect(seen).toEqual(["a", "ab", "abc", "abc"])
      expect(rr.state).toBe("paused")
      expect(events).toEqual(["ended"])
      expect(rr.currentTime).toBe(0.4)
    })
  })
})
