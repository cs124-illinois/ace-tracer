import { describe, expect, test } from "bun:test"
import { AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
import AceMultiRecordReplayer from "../../src/ace/MultiRecordReplayer"
import AceRecordReplayer from "../../src/ace/RecordReplayer"
import { createMockEditor } from "../fixtures/ace-mock"
import { makeClickTrackTrace, makeComplete } from "../fixtures/traces"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createAceRR() {
  const editor = createMockEditor("")
  const rr = new AceRecordReplayer(editor as any)
  return { editor, rr }
}

describe("AcePlayer regressions", () => {
  test("playback stops at the end of the trace", async () => {
    const { rr } = createAceRR()
    rr.src = makeClickTrackTrace([50, 100])
    const states: IRecordReplayer.State[] = []
    const events: IRecordReplayer.Event[] = []
    rr.addStateListener((state) => states.push(state))
    rr.addEventListener((event) => events.push(event))

    await rr.play()
    await sleep(300)

    expect(rr.state).toBe("paused")
    expect(rr.playing).toBe(false)
    expect(rr.currentTime).toBe(rr.duration)
    expect(rr.percent).toBe(100)
    expect(states).toEqual(["playing", "paused"])
    expect(events).toEqual(["ended"])
  })

  test("playing again after the end restarts from the beginning", async () => {
    const { editor, rr } = createAceRR()
    rr.src = makeClickTrackTrace([20, 40])
    await rr.play()
    await sleep(150)
    expect(rr.state).toBe("paused")

    await rr.play()
    expect(rr.state).toBe("playing")
    expect(rr.currentTime).toBeLessThan(0.02)
    expect(editor.getValue()).toBe("")
    rr.pause()
  })

  test("seeking while playing applies records at the new position without waiting for the old timer", async () => {
    const { editor, rr } = createAceRR()
    rr.src = makeClickTrackTrace([50, 2000, 4000])
    await rr.play()
    await sleep(100)
    expect(editor.getValue()).toBe("!x")

    rr.currentTime = 1.95
    await sleep(150)

    // The Complete at 2000ms sets "xx" and the following delta inserts "!" at column 1
    expect(editor.getValue()).toBe("x!x")
    rr.pause()
  })

  test("changing playbackRate while playing doesn't emit state changes", async () => {
    const { rr } = createAceRR()
    rr.src = makeClickTrackTrace([50, 2000])
    await rr.play()
    const states: IRecordReplayer.State[] = []
    rr.addStateListener((state) => states.push(state))

    rr.playbackRate = 2

    expect(states).toEqual([])
    expect(rr.state).toBe("playing")
    expect(rr.playing).toBe(true)
    rr.pause()
  })

  test("pausing records the elapsed time", async () => {
    const { rr } = createAceRR()
    rr.src = makeClickTrackTrace([50, 2000])
    await rr.play()
    await sleep(200)
    rr.pause()

    expect(rr.currentTime).toBeGreaterThan(0.15)
    expect(rr.currentTime).toBeLessThan(0.5)
  })

  test("setting a new src resets the position", async () => {
    const { rr } = createAceRR()
    rr.src = makeClickTrackTrace([50, 2000])
    rr.currentTime = 1.5
    rr.src = makeClickTrackTrace([50, 2000])

    expect(rr.currentTime).toBe(0)
  })

  test("Complete records can name sessions that aren't in the trace's sessionInfo", () => {
    const { editor, rr } = createAceRR()
    const base = new Date("2025-01-15T10:00:00.000Z").valueOf()
    // Session "b" existed during the recording but was deleted before it stopped, so the trace-level sessionInfo
    // (captured at stop) only lists "a"
    const records = [
      makeComplete({
        timestamp: new Date(base),
        sessionName: "a",
        value: "in a",
        sessionInfo: [
          { name: "a", contents: "in a", mode: "ace/mode/text" },
          { name: "b", contents: "in b", mode: "ace/mode/text" },
        ],
      }),
      makeComplete({
        timestamp: new Date(base + 100),
        sessionName: "b",
        value: "in b",
        sessionInfo: [
          { name: "a", contents: "in a", mode: "ace/mode/text" },
          { name: "b", contents: "in b", mode: "ace/mode/text" },
        ],
      }),
      makeComplete({
        timestamp: new Date(base + 200),
        sessionName: "a",
        value: "in a",
        sessionInfo: [{ name: "a", contents: "in a", mode: "ace/mode/text" }],
      }),
    ]
    rr.src = new AceTrace(records, [{ name: "a", contents: "in a", mode: "ace/mode/text" }], "a")

    rr.currentTime = 0.15
    expect(() => rr.sync()).not.toThrow()
    expect(rr.sessionName).toBe("b")
    expect(editor.getValue()).toBe("in b")
    expect(rr.getSessionsInfo().find(({ name }) => name === "b")?.mode).toBe("ace/mode/text")
  })

  test("removed listeners are no longer called", async () => {
    const { rr } = createAceRR()
    const states: IRecordReplayer.State[] = []
    const listener = (state: IRecordReplayer.State) => states.push(state)
    rr.addStateListener(listener)
    rr.removeStateListener(listener)

    await rr.record()
    await rr.stop()

    expect(states).toEqual([])
  })
})

describe("AcePlayer selection regressions", () => {
  const base = new Date("2025-01-15T10:00:00.000Z").valueOf()
  const selected = {
    value: "hello world",
    selection: { start: { row: 0, column: 1 }, end: { row: 0, column: 5 } },
  }

  test("a cursor change clears the selection it follows", () => {
    const { editor, rr } = createAceRR()
    rr.src = new AceTrace(
      [
        makeComplete({ timestamp: new Date(base), ...selected, cursor: { row: 0, column: 5 } }),
        { type: "cursorchange", timestamp: new Date(base + 100), focused: true, location: { row: 0, column: 3 } },
        makeComplete({ timestamp: new Date(base + 1000), reason: "end", value: "hello world" }),
      ],
      [{ name: "", contents: "", mode: "ace/mode/text" }],
      "",
    )

    rr.currentTime = 0.5
    rr.sync()

    expect(editor.selection.getRange()).toEqual({ start: { row: 0, column: 3 }, end: { row: 0, column: 3 } })
  })

  test("a backwards selection keeps the cursor at its start", () => {
    const { editor, rr } = createAceRR()
    rr.src = new AceTrace(
      [makeComplete({ timestamp: new Date(base), ...selected, cursor: { row: 0, column: 1 } })],
      [{ name: "", contents: "", mode: "ace/mode/text" }],
      "",
    )

    rr.currentTime = 0
    rr.sync()

    expect(editor.selection.getRange()).toEqual(selected.selection)
    expect(editor.selection.getCursor()).toEqual({ row: 0, column: 1 })
  })
})

describe("AceRecordReplayer recorder regressions", () => {
  test("record() rejects and stays paused when the recorder can't start", async () => {
    const { rr } = createAceRR()
    // A session map without a current session name is a configuration error
    rr.recorder.addSession({ name: "a", contents: "", mode: "ace/mode/text" })

    expect(rr.record()).rejects.toThrow("Session information not properly configured")
    await sleep(0)
    expect(rr.state).toBe("paused")
  })

  test("recorderOptions are passed to the recorder", async () => {
    const editor = createMockEditor("")
    const rr = new AceRecordReplayer(editor as any, { recorderOptions: { completeCount: 2, completeInterval: 0 } })
    await rr.record()
    for (let i = 0; i < 4; i++) {
      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: i },
        end: { row: 0, column: i + 1 },
        lines: ["a"],
      })
    }
    await rr.stop()

    const counterCompletes = rr.src!.records.filter((r) => r.type === "complete" && r.reason === "counter")
    expect(counterCompletes.length).toBe(2)
  })
})

describe("AceMultiRecordReplayer regressions", () => {
  test("playback ends once every player finishes", async () => {
    const rr = new AceMultiRecordReplayer({ a: createMockEditor("") as any, b: createMockEditor("") as any })
    rr.src = { a: makeClickTrackTrace([30]), b: makeClickTrackTrace([30, 120]) }
    const events: IRecordReplayer.Event[] = []
    rr.addEventListener((event) => events.push(event))

    await rr.play()
    await sleep(70)
    // "a" has finished but "b" is still playing
    expect(rr.state).toBe("playing")

    await sleep(200)
    expect(rr.state).toBe("paused")
    expect(events).toEqual(["ended"])
  })

  test("setting src to undefined clears every player", () => {
    const rr = new AceMultiRecordReplayer({ a: createMockEditor("") as any })
    rr.src = { a: makeClickTrackTrace([30]) }
    rr.src = undefined

    expect(rr.players.a.src).toBeUndefined()
  })
})
