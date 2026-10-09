import { describe, expect, test } from "bun:test"
import { AceRecord } from "@cs124/ace-recorder-types"
import { Ace } from "ace-builds"
import AceRecorder from "../../src/ace/Recorder"
import AceStreamer from "../../src/ace/Streamer"
import { createMockEditor, MockEditSession } from "../fixtures/ace-mock"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const insertAt = (column: number) => ({
  action: "insert" as const,
  start: { row: 0, column },
  end: { row: 0, column: column + 1 },
  lines: ["a"],
})

describe("AceRecorder regressions", () => {
  test("defaults take one timer Complete per second and no counter Completes", async () => {
    expect(AceRecorder.defaultOptions).toEqual({ completeCount: 0, completeInterval: 1000 })

    const editor = createMockEditor("")
    const recorder = new AceRecorder(editor as any)
    await recorder.start()
    for (let i = 0; i < 40; i++) {
      editor.simulateChange(insertAt(i))
    }
    await sleep(100)
    await recorder.stop()

    const reasons = recorder.src!.records.filter((r) => r.type === "complete").map((r) => r.reason)
    expect(reasons).toEqual(["start", "end"])
  })

  test("completeCount: 0 is accepted and disables counter Completes", async () => {
    const editor = createMockEditor("")
    const recorder = new AceRecorder(editor as any, { completeCount: 0, completeInterval: 0 })
    await recorder.start()
    for (let i = 0; i < 10; i++) {
      editor.simulateChange(insertAt(i))
    }
    await recorder.stop()

    expect(recorder.src!.records.some((r) => r.type === "complete" && r.reason === "counter")).toBe(false)
  })

  test("negative options are rejected", async () => {
    const editor = createMockEditor("")
    expect(new AceRecorder(editor as any, { completeCount: -1 }).start()).rejects.toThrow("completeCount")
    expect(new AceRecorder(editor as any, { completeInterval: -1 }).start()).rejects.toThrow("completeInterval")
  })

  test("starting twice throws instead of leaking a second timer", async () => {
    const editor = createMockEditor("")
    const recorder = new AceRecorder(editor as any, { completeInterval: 10 })
    await recorder.start()
    expect(recorder.start()).rejects.toThrow("Already recording")
    await recorder.stop()

    const count = recorder.src!.records.length
    await sleep(50)
    // A leaked interval would throw "Not recording" from addCompleteRecord here
    expect(recorder.src!.records.length).toBe(count)
  })
})

describe("AceRecorder snapshot regressions", () => {
  test("a count-triggered Complete follows the record that triggered it", async () => {
    const editor = createMockEditor("")
    const recorder = new AceRecorder(editor as any, { completeCount: 1, completeInterval: 0 })
    await recorder.start()
    editor.simulateChange(insertAt(0))
    await recorder.stop()

    const types = recorder.src!.records.map((r) => (r.type === "complete" ? r.reason : r.type))
    // The counter Complete's snapshot includes the delta, so replaying the delta after it would apply it twice
    expect(types).toEqual(["start", "delta", "counter", "end"])
  })

  test("singleSession attaches its session to the editor", async () => {
    const editor = createMockEditor("")
    const recorder = new AceRecorder(editor as any, { completeInterval: 0 })
    recorder.singleSession({ name: "main", contents: "hello", mode: "ace/mode/text" })
    expect(editor.getValue()).toBe("hello")

    await recorder.start()
    // singleSession replaced the mock session with a real Ace session
    ;(editor.session as unknown as Ace.EditSession).insert({ row: 0, column: 5 }, "!")
    await recorder.stop()

    expect(recorder.src!.sessionInfo).toEqual([{ name: "main", contents: "hello!", mode: "ace/mode/text" }])
  })
})

describe("AceStreamer regressions", () => {
  test("window size changes noticed on scroll are recorded from the first session", () => {
    const editor = createMockEditor("")
    const streamer = new AceStreamer(editor as any)
    const records: AceRecord[] = []
    streamer.start((record) => records.push(record))

    editor.renderer.$size = { width: 400, height: 300 }
    editor.session.setScrollTop(10)
    streamer.stop()

    expect(records.some((r) => r.type === "windowsizechange")).toBe(true)
  })

  test("scroll positions beyond the viewport height are recorded unclamped", () => {
    const editor = createMockEditor("")
    const streamer = new AceStreamer(editor as any)
    const records: AceRecord[] = []
    streamer.start((record) => records.push(record))

    expect(editor.renderer.$size.height).toBeLessThan(1500)
    editor.renderer.scrollToY(1500)
    editor.session.setScrollTop(1500)
    streamer.stop()

    const scroll = records.find((r) => r.type === "scrollchange")
    expect(scroll).toMatchObject({ top: 1500 })
  })

  test("listeners from a stopped recording don't fire into the next one", async () => {
    const editor = createMockEditor("")
    const streamer = new AceStreamer(editor as any)
    streamer.sessionName = "main"
    const first: AceRecord[] = []
    streamer.start((record) => first.push(record))
    // Switching sessions moves the window-size listener onto the new session
    editor.setSession(new MockEditSession("other"))
    streamer.stop()
    const firstCount = first.length

    const second: AceRecord[] = []
    streamer.start((record) => second.push(record))
    editor.renderer.$size = { width: 400, height: 300 }
    editor.session.setScrollTop(10)
    await sleep(150)
    streamer.stop()

    expect(first.length).toBe(firstCount)
    expect(second.filter((r) => r.type === "windowsizechange").length).toBeLessThanOrEqual(1)
  })

  test("pending throttled events are dropped when recording stops", async () => {
    const editor = createMockEditor("")
    const streamer = new AceStreamer(editor as any)
    const records: AceRecord[] = []
    streamer.start((record) => records.push(record))
    editor.simulateCursorMove(0, 1)
    // Within the throttle window: this call is deferred to the trailing edge
    editor.simulateCursorMove(0, 2)
    streamer.stop()
    const count = records.length

    // Restarting before the trailing edge would otherwise let the deferred call fire into the new recording
    const next: AceRecord[] = []
    streamer.start((record) => next.push(record))
    await sleep(150)
    streamer.stop()

    expect(records.length).toBe(count)
    expect(next.filter((r) => r.type === "cursorchange")).toEqual([])
  })
})
