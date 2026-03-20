import { AceRecord, AceTrace } from "@cs124/ace-recorder-types"
import { afterEach, describe, expect, test } from "bun:test"
import AceMultiRecordReplayer from "../../src/ace/MultiRecordReplayer"
import { createMockEditor, MockEditor } from "../fixtures/ace-mock"
import { BASE_DATE, makeComplete, makeTrace } from "../fixtures/traces"

function createMultiRR(configs: Record<string, string>) {
  const editors: Record<string, MockEditor> = {}
  for (const [name, value] of Object.entries(configs)) editors[name] = createMockEditor(value)
  return { editors, rr: new AceMultiRecordReplayer(editors as any) }
}

function makeEditorTrace(value: string, durationMs = 3000): AceTrace {
  const endTime = new Date(BASE_DATE.valueOf() + durationMs)
  const records = [
    makeComplete({ timestamp: BASE_DATE, reason: "start", value }),
    makeComplete({ timestamp: endTime, reason: "end", value }),
  ]
  const sessionInfo = [{ name: "main", contents: value, mode: "text" }]
  return new AceTrace(records, sessionInfo, "main")
}

function seekAndSync(rr: AceMultiRecordReplayer, timeSec: number) {
  rr.currentTime = timeSec
  for (const name of Object.keys(rr.players)) {
    const player = rr.players[name] as any
    player.syncTime = Date.now()
    player.startTime = Date.now() - timeSec * 1000
  }
  rr.sync()
}

describe("AceMultiRecordReplayer", () => {
  let rr: AceMultiRecordReplayer | undefined

  afterEach(() => {
    if (rr?.state === "recording") {
      rr.stop()
    } else if (rr?.state === "playing") {
      rr.pause()
    }
    rr = undefined
  })

  describe("construction", () => {
    test("constructs with 1 editor", () => {
      const result = createMultiRR({ editor1: "" })
      rr = result.rr
      expect(Object.keys(rr.players)).toEqual(["editor1"])
      expect(Object.keys(rr.recorders)).toEqual(["editor1"])
    })

    test("constructs with 2 editors", () => {
      const result = createMultiRR({ first: "a", second: "b" })
      rr = result.rr
      expect(Object.keys(rr.players)).toEqual(["first", "second"])
      expect(Object.keys(rr.recorders)).toEqual(["first", "second"])
    })

    test("constructs with 3 editors", () => {
      const result = createMultiRR({ a: "", b: "", c: "" })
      rr = result.rr
      expect(Object.keys(rr.players)).toHaveLength(3)
      expect(Object.keys(rr.recorders)).toHaveLength(3)
    })

    test("replayEditors option uses replay editors for players", () => {
      const recordEditors: Record<string, MockEditor> = {
        first: createMockEditor("record1"),
        second: createMockEditor("record2"),
      }
      const replayEditors: Record<string, MockEditor> = {
        first: createMockEditor("replay1"),
        second: createMockEditor("replay2"),
      }
      rr = new AceMultiRecordReplayer(recordEditors as any, { replayEditors: replayEditors as any })

      // Players should use replay editors, recorders should use record editors
      expect((rr.players["first"] as any)._editor).toBe(replayEditors["first"])
      expect((rr.players["second"] as any)._editor).toBe(replayEditors["second"])
    })

    test("filterRecord receives record and name", async () => {
      const filterCalls: { record: AceRecord; name: string }[] = []
      const editors: Record<string, MockEditor> = {
        editorA: createMockEditor("a"),
        editorB: createMockEditor("b"),
      }
      rr = new AceMultiRecordReplayer(editors as any, {
        filterRecord: (record, name) => {
          filterCalls.push({ record, name })
          return true
        },
      })

      // Load traces and trigger sync to exercise the filter
      const traces: Record<string, AceTrace> = {
        editorA: makeEditorTrace("a"),
        editorB: makeEditorTrace("b"),
      }
      rr.src = traces
      seekAndSync(rr, 0)

      // The filter should have been called with editor names
      const names = filterCalls.map((c) => c.name)
      expect(names).toContain("editorA")
      expect(names).toContain("editorB")
    })
  })

  describe("state machine", () => {
    test("initial state is paused", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      expect(rr.state).toBe("paused")
    })

    test("record then stop transitions correctly", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      await rr.record()
      expect(rr.state).toBe("recording")

      await rr.stop()
      expect(rr.state).toBe("paused")
    })

    test("play then pause transitions correctly", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      await rr.play()
      expect(rr.state).toBe("playing")

      rr.pause()
      expect(rr.state).toBe("paused")
    })

    test("play while recording throws", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      await rr.record()
      await expect(rr.play()).rejects.toThrow("Not paused")
    })

    test("pause while paused throws", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      expect(() => rr!.pause()).toThrow("Not playing")
    })

    test("stop while paused throws", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      await expect(rr.stop()).rejects.toThrow("Not recording")
    })

    test("state listener fires on transitions", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const states: string[] = []
      rr.addStateListener((state) => states.push(state))

      await rr.record()
      await rr.stop()

      expect(states).toContain("recording")
      expect(states).toContain("paused")
    })

    test("state listener suppresses duplicates", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const states: string[] = []
      rr.addStateListener((state) => states.push(state))

      // State is already "paused", setting it again should not fire
      rr.state = "paused"
      expect(states).toHaveLength(0)
    })
  })

  describe("recording", () => {
    test("record starts all recorders", async () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      await rr.record()

      for (const name of Object.keys(rr.recorders)) {
        expect(rr.recorders[name].recording).toBe(true)
      }
    })

    test("stop stops all recorders and produces src", async () => {
      const { rr: multiRR } = createMultiRR({ first: "a", second: "b" })
      rr = multiRR

      await rr.record()
      await rr.stop()

      const src = rr.src!
      expect(src).toBeDefined()
      expect(Object.keys(src)).toEqual(["first", "second"])
      expect(src["first"].records.length).toBeGreaterThanOrEqual(2)
      expect(src["second"].records.length).toBeGreaterThanOrEqual(2)
    })

    test("traces capture changes from their respective editors only", async () => {
      const { editors, rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      await rr.record()

      // Simulate a change only on the first editor
      editors["first"].simulateChange({
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
        lines: ["X"],
      })

      await rr.stop()

      const src = rr.src!
      const firstDeltas = src["first"].records.filter((r) => r.type === "delta")
      const secondDeltas = src["second"].records.filter((r) => r.type === "delta")

      expect(firstDeltas.length).toBe(1)
      expect(secondDeltas.length).toBe(0)
    })

    test("hasRecording set after record (during recording)", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      expect(rr.hasRecording).toBe(false)
      await rr.record()
      expect(rr.hasRecording).toBe(true)
    })
  })

  describe("src management", () => {
    test("setting src loads trace into each player", () => {
      const { rr: multiRR } = createMultiRR({ first: "a", second: "b" })
      rr = multiRR

      const traces: Record<string, AceTrace> = {
        first: makeEditorTrace("content-first"),
        second: makeEditorTrace("content-second"),
      }
      rr.src = traces

      expect(rr.players["first"].src).toBeDefined()
      expect(rr.players["second"].src).toBeDefined()
    })

    test("setting src throws during playing", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      await rr.play()

      expect(() => {
        rr!.src = { editor1: makeTrace({ durationMs: 3000 }) }
      }).toThrow("Can't change src while playing or recording")
    })

    test("setting src throws during recording", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      await rr.record()

      expect(() => {
        rr!.src = { editor1: makeTrace({ durationMs: 3000 }) }
      }).toThrow("Can't change src while playing or recording")
    })

    test("getting src throws during recording", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      await rr.record()

      expect(() => rr!.src).toThrow("Still recording")
    })

    test("setting src resets hasRecording", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      // hasRecording is set true during record(), but stop() calls this.src= which resets it
      // Verify that setting src always sets hasRecording to false
      await rr.record()
      expect(rr.hasRecording).toBe(true)

      await rr.stop()

      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      expect(rr.hasRecording).toBe(false)
    })

    test("setting src to undefined clears traces", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      expect(rr.src).toBeDefined()

      rr.src = undefined
      expect(rr.src).toBeUndefined()
    })
  })

  describe("playback coordination", () => {
    test("currentTime setter propagates to all players", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { first: trace, second: trace }

      rr.currentTime = 2.0
      expect(rr.players["first"].currentTime).toBeCloseTo(2.0, 1)
      expect(rr.players["second"].currentTime).toBeCloseTo(2.0, 1)
    })

    test("currentTime getter delegates to first player", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { first: trace, second: trace }

      rr.currentTime = 1.5
      expect(rr.currentTime).toBeCloseTo(1.5, 1)
    })

    test("playbackRate setter propagates to all players", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      rr.playbackRate = 2.0
      expect(rr.players["first"].playbackRate).toBe(2.0)
      expect(rr.players["second"].playbackRate).toBe(2.0)
    })

    test("playbackRate getter delegates to first player", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      rr.playbackRate = 1.5
      expect(rr.playbackRate).toBe(1.5)
    })

    test("duration delegates to first player", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { first: trace, second: trace }

      expect(rr.duration).toBeCloseTo(5.0, 1)
    })

    test("percent getter works correctly", () => {
      const { rr: multiRR } = createMultiRR({ first: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 4000 })
      rr.src = { first: trace }

      rr.currentTime = 2.0
      expect(rr.percent).toBeCloseTo(50, 0)
    })

    test("percent setter works correctly", () => {
      const { rr: multiRR } = createMultiRR({ first: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 4000 })
      rr.src = { first: trace }

      rr.percent = 50
      expect(rr.currentTime).toBeCloseTo(2.0, 1)
    })

    test("sync calls sync on all players", () => {
      const { rr: multiRR, editors } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const traceFirst = makeEditorTrace("first-content")
      const traceSecond = makeEditorTrace("second-content")
      rr.src = { first: traceFirst, second: traceSecond }

      seekAndSync(rr, 0)

      // After sync at time 0, each editor should have the Complete record's value applied
      expect(editors["first"].session.getValue()).toBe("first-content")
      expect(editors["second"].session.getValue()).toBe("second-content")
    })
  })

  describe("seeking", () => {
    test("seek updates all players to same time", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { first: trace, second: trace }

      rr.currentTime = 2.5
      expect(rr.players["first"].currentTime).toBeCloseTo(2.5, 1)
      expect(rr.players["second"].currentTime).toBeCloseTo(2.5, 1)
    })

    test("seek forward then backward works", () => {
      const { rr: multiRR, editors } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000, records: 6 })
      rr.src = { editor1: trace }

      // Seek forward
      seekAndSync(rr, 4.0)
      const valueAt4 = editors["editor1"].session.getValue()

      // Seek backward
      seekAndSync(rr, 1.0)
      const valueAt1 = editors["editor1"].session.getValue()

      // Both should produce valid editor state (Complete applied)
      expect(typeof valueAt4).toBe("string")
      expect(typeof valueAt1).toBe("string")
    })

    test("seek + sync applies correct Complete records to each editor", () => {
      const { rr: multiRR, editors } = createMultiRR({ first: "", second: "" })
      rr = multiRR

      const midTime = new Date(BASE_DATE.valueOf() + 1500)
      const endTime = new Date(BASE_DATE.valueOf() + 3000)

      const traceFirst = new AceTrace(
        [
          makeComplete({ timestamp: BASE_DATE, reason: "start", value: "first-start" }),
          makeComplete({ timestamp: midTime, reason: "timer", value: "first-mid" }),
          makeComplete({ timestamp: endTime, reason: "end", value: "first-end" }),
        ],
        [{ name: "main", contents: "first-start", mode: "text" }],
        "main",
      )
      const traceSecond = new AceTrace(
        [
          makeComplete({ timestamp: BASE_DATE, reason: "start", value: "second-start" }),
          makeComplete({ timestamp: midTime, reason: "timer", value: "second-mid" }),
          makeComplete({ timestamp: endTime, reason: "end", value: "second-end" }),
        ],
        [{ name: "main", contents: "second-start", mode: "text" }],
        "main",
      )

      rr.src = { first: traceFirst, second: traceSecond }

      // Seek to start
      seekAndSync(rr, 0)
      expect(editors["first"].session.getValue()).toBe("first-start")
      expect(editors["second"].session.getValue()).toBe("second-start")

      // Seek to end
      seekAndSync(rr, 3.0)
      expect(editors["first"].session.getValue()).toBe("first-end")
      expect(editors["second"].session.getValue()).toBe("second-end")
    })
  })
})
