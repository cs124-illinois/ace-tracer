import { afterEach, describe, expect, jest, test } from "bun:test"
import { AceRecord, AceTrace, Complete, IRecordReplayer } from "@cs124/ace-recorder-types"
import AceMultiRecordReplayer from "../../src/ace/MultiRecordReplayer"
import { createMockEditor, MockEditor } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"
import { at, makeComplete, makeTrace } from "../fixtures/traces"

const MODE = "ace/mode/text"

const created: AceMultiRecordReplayer[] = []
function createMultiRR(configs: Record<string, string>, options?: AceMultiRecordReplayer.Options) {
  const editors: Record<string, MockEditor> = {}
  for (const [name, value] of Object.entries(configs)) editors[name] = createMockEditor(value)
  const rr = new AceMultiRecordReplayer(editors as any, options)
  created.push(rr)
  return { editors, rr }
}

// Completes with the given values, evenly spaced over durationMs. Like a real recording, the trace-level
// sessionInfo holds the last value, so loading the trace shows that until a sync applies earlier records.
function valuesTrace(values: string[], durationMs = 3000): AceTrace {
  const step = durationMs / (values.length - 1)
  const records = values.map((value, i) =>
    makeComplete({ timestamp: at(i * step), reason: i === 0 ? "start" : "timer", value }),
  )
  return new AceTrace(records, [{ name: "main", contents: values[values.length - 1], mode: MODE }], "main")
}

function seek(rr: AceMultiRecordReplayer, seconds: number) {
  rr.currentTime = seconds
  rr.sync()
}

function listen(rr: AceMultiRecordReplayer) {
  const states: IRecordReplayer.State[] = []
  const events: IRecordReplayer.Event[] = []
  rr.addStateListener((state) => states.push(state))
  rr.addEventListener((event) => events.push(event))
  return { states, events }
}

describe("AceMultiRecordReplayer", () => {
  useFakeTimers()

  // Stop anything a failed test left running, so recorder intervals and playback timers don't leak
  afterEach(async () => {
    for (const rr of created.splice(0)) {
      if (rr.state === "recording") {
        await rr.stop()
      } else if (rr.state === "playing") {
        rr.pause()
      }
    }
  })

  describe("construction", () => {
    test("creates a player and recorder per editor", () => {
      const { rr } = createMultiRR({ first: "a", second: "b", third: "c" })
      expect(Object.keys(rr.players)).toEqual(["first", "second", "third"])
      expect(Object.keys(rr.recorders)).toEqual(["first", "second", "third"])
    })

    test("replayEditors option uses replay editors for players", async () => {
      const recordEditors = { first: createMockEditor("record1"), second: createMockEditor("record2") }
      const replayEditors = { first: createMockEditor(""), second: createMockEditor("") }
      const rr = new AceMultiRecordReplayer(recordEditors as any, { replayEditors: replayEditors as any })
      created.push(rr)

      expect(rr.players["first"].editor).toBe(replayEditors["first"] as any)
      expect(rr.players["second"].editor).toBe(replayEditors["second"] as any)

      // Recording reads the record editors, playback writes the replay editors
      await rr.record()
      jest.advanceTimersByTime(1000)
      await rr.stop()
      seek(rr, 0)
      expect(replayEditors["first"].getValue()).toBe("record1")
      expect(replayEditors["second"].getValue()).toBe("record2")
    })

    test("filterRecord receives each record with its editor's name", () => {
      const calls: { record: AceRecord; name: string }[] = []
      const { editors, rr } = createMultiRR(
        { editorA: "", editorB: "" },
        {
          filterRecord: (record, name) => {
            calls.push({ record, name })
            return name === "editorA"
          },
        },
      )
      const traces = { editorA: valuesTrace(["a0", "a1"]), editorB: valuesTrace(["b0", "b1"]) }
      rr.src = traces

      seek(rr, 0)

      expect(calls).toEqual([
        { record: traces.editorA.records[0], name: "editorA" },
        { record: traces.editorB.records[0], name: "editorB" },
      ])
      // editorB's records were filtered out, so it still shows the trace-level contents
      expect(editors["editorA"].getValue()).toBe("a0")
      expect(editors["editorB"].getValue()).toBe("b1")
    })
  })

  describe("state machine", () => {
    test("initial state is paused", () => {
      const { rr } = createMultiRR({ editor1: "" })
      expect(rr.state).toBe("paused")
    })

    test("record then stop transitions correctly", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      const { states } = listen(rr)

      await rr.record()
      expect(rr.state).toBe("recording")
      await rr.stop()
      expect(rr.state).toBe("paused")
      expect(states).toEqual(["recording", "paused"])
    })

    test("play then pause transitions correctly", async () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: valuesTrace(["a", "b"]), second: valuesTrace(["c", "d"]) }
      const { states } = listen(rr)

      await rr.play()
      expect(rr.state).toBe("playing")
      expect(Object.values(rr.players).map((p) => p.playing)).toEqual([true, true])

      rr.pause()
      expect(rr.state).toBe("paused")
      expect(Object.values(rr.players).map((p) => p.playing)).toEqual([false, false])
      expect(states).toEqual(["playing", "paused"])
    })

    test("play while recording throws", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      await rr.record()
      await expect(rr.play()).rejects.toThrow("Not paused")
    })

    test("pause while paused throws", () => {
      const { rr } = createMultiRR({ editor1: "" })
      expect(() => rr.pause()).toThrow("Not playing")
    })

    test("stop while paused throws", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      await expect(rr.stop()).rejects.toThrow("Not recording")
    })

    test("setting the state to its current value doesn't emit", () => {
      const { rr } = createMultiRR({ editor1: "" })
      const { states } = listen(rr)
      rr.state = "paused"
      expect(states).toEqual([])
    })

    test("removed listeners are no longer called", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      const states: IRecordReplayer.State[] = []
      const events: IRecordReplayer.Event[] = []
      const stateListener = (state: IRecordReplayer.State) => states.push(state)
      const eventListener = (event: IRecordReplayer.Event) => events.push(event)
      rr.addStateListener(stateListener)
      rr.addEventListener(eventListener)
      rr.removeStateListener(stateListener)
      rr.removeEventListener(eventListener)

      rr.src = { editor1: valuesTrace(["a", "b"]) }
      await rr.play()
      jest.advanceTimersByTime(3000)

      expect(states).toEqual([])
      expect(events).toEqual([])
    })
  })

  describe("playback end", () => {
    test("ends when the longest trace finishes, not the first", async () => {
      const { rr } = createMultiRR({ short: "", long: "" })
      rr.src = { short: valuesTrace(["s0", "s1"], 2000), long: valuesTrace(["l0", "l1"], 4000) }
      const { states, events } = listen(rr)

      await rr.play()
      jest.advanceTimersByTime(2000)
      expect(rr.players["short"].playing).toBe(false)
      expect(rr.players["long"].playing).toBe(true)
      expect(rr.state).toBe("playing")
      expect(events).toEqual([])

      jest.advanceTimersByTime(2000)
      expect(rr.state).toBe("paused")
      expect(states).toEqual(["playing", "paused"])
      expect(events).toEqual(["ended"])
    })
  })

  describe("recording", () => {
    test("record starts all recorders", async () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      await rr.record()
      expect(Object.values(rr.recorders).map((r) => r.recording)).toEqual([true, true])
    })

    test("stop stops all recorders and produces a trace per editor", async () => {
      const { rr } = createMultiRR({ first: "a", second: "b" })
      await rr.record()
      jest.advanceTimersByTime(500)
      await rr.stop()

      expect(Object.values(rr.recorders).map((r) => r.recording)).toEqual([false, false])
      const src = rr.src!
      expect(Object.keys(src)).toEqual(["first", "second"])
      expect(src["first"]).toBe(rr.recorders["first"].src!)
      expect(src["second"]).toBe(rr.recorders["second"].src!)
      expect((src["first"].records[0] as Complete).value).toBe("a")
      expect((src["second"].records[0] as Complete).value).toBe("b")
      expect(rr.duration).toBe(0.5)
    })

    test("traces capture changes from their respective editors only", async () => {
      const { editors, rr } = createMultiRR({ first: "", second: "" })
      await rr.record()
      editors["first"].simulateChange({
        action: "insert",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
        lines: ["X"],
      })
      await rr.stop()

      const src = rr.src!
      expect(src["first"].records.filter((r) => r.type === "delta")).toHaveLength(1)
      expect(src["second"].records.filter((r) => r.type === "delta")).toHaveLength(0)
    })

    test("if a recorder can't start, the ones already started are stopped", async () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      // A session that's added but never selected leaves the recorder misconfigured
      rr.recorders["second"].addSession({ name: "unselected", contents: "", mode: MODE })

      await expect(rr.record()).rejects.toThrow("Session information not properly configured")

      expect(rr.state).toBe("paused")
      expect(rr.recorders["first"].recording).toBe(false)
      expect(rr.recorders["second"].recording).toBe(false)
      // The first recorder's Complete interval was cleared
      const emitted: AceRecord[] = []
      rr.recorders["first"].on("record", (record) => emitted.push(record))
      jest.advanceTimersByTime(5000)
      expect(emitted).toEqual([])
    })

    test("recorderOptions are passed to every recorder", async () => {
      const { rr } = createMultiRR({ first: "", second: "" }, { recorderOptions: { completeInterval: 500 } })
      await rr.record()
      jest.advanceTimersByTime(1000)
      await rr.stop()

      for (const trace of Object.values(rr.src!)) {
        expect(trace.records.filter((r) => Complete.guard(r) && r.reason === "timer")).toHaveLength(2)
      }
    })

    test("hasRecording is false until a recording stops, and false again after src is set", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      expect(rr.hasRecording).toBe(false)
      await rr.record()
      expect(rr.hasRecording).toBe(false)
      await rr.stop()
      expect(rr.hasRecording).toBe(true)

      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      expect(rr.hasRecording).toBe(false)
    })
  })

  describe("src management", () => {
    test("setting src loads each editor's trace into its player", () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      const traces = { first: valuesTrace(["f0", "f1"]), second: valuesTrace(["s0", "s1"]) }
      rr.src = traces

      expect(rr.players["first"].src).toBe(traces.first)
      expect(rr.players["second"].src).toBe(traces.second)
      expect(rr.src).toBe(traces)
    })

    test("setting src throws during playing", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      await rr.play()

      expect(() => {
        rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      }).toThrow("Can't change src while playing or recording")
    })

    test("setting src throws during recording", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      await rr.record()

      expect(() => {
        rr.src = { editor1: makeTrace({ durationMs: 3000 }) }
      }).toThrow("Can't change src while playing or recording")
    })

    test("getting src throws during recording", async () => {
      const { rr } = createMultiRR({ editor1: "" })
      await rr.record()
      expect(() => rr.src).toThrow("Still recording")
    })

    test("setting src to undefined clears every player", () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: makeTrace({ durationMs: 3000 }), second: makeTrace({ durationMs: 3000 }) }

      rr.src = undefined
      expect(rr.src).toBeUndefined()
      expect(rr.players["first"].src).toBeUndefined()
      expect(rr.players["second"].src).toBeUndefined()
    })
  })

  describe("playback coordination", () => {
    test("currentTime setter propagates to all players, getter reads the first", () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: makeTrace({ durationMs: 5000 }), second: makeTrace({ durationMs: 5000 }) }

      rr.currentTime = 2.5
      expect(rr.players["first"].currentTime).toBe(2.5)
      expect(rr.players["second"].currentTime).toBe(2.5)
      expect(rr.currentTime).toBe(2.5)
    })

    test("currentTime advances while playing", async () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: makeTrace({ durationMs: 5000 }), second: makeTrace({ durationMs: 5000 }) }

      await rr.play()
      jest.advanceTimersByTime(1250)
      expect(rr.currentTime).toBe(1.25)
      expect(rr.players["second"].currentTime).toBe(1.25)
    })

    test("playbackRate setter propagates to all players, getter reads the first", () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.playbackRate = 2
      expect(rr.players["first"].playbackRate).toBe(2)
      expect(rr.players["second"].playbackRate).toBe(2)
      expect(rr.playbackRate).toBe(2)
    })

    test("changing playbackRate mid-play keeps playing and speeds up every player", async () => {
      const { editors, rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: valuesTrace(["f0", "f1", "f2"], 2000), second: valuesTrace(["s0", "s1", "s2"], 2000) }
      const { states } = listen(rr)

      await rr.play()
      rr.playbackRate = 2
      jest.advanceTimersByTime(500)
      expect(editors["first"].getValue()).toBe("f1")
      expect(editors["second"].getValue()).toBe("s1")
      expect(states).toEqual(["playing"])

      jest.advanceTimersByTime(500)
      expect(rr.state).toBe("paused")
      expect(states).toEqual(["playing", "paused"])
    })

    test("duration and percent use the first player", () => {
      const { rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: makeTrace({ durationMs: 4000 }), second: makeTrace({ durationMs: 6000 }) }

      expect(rr.duration).toBe(4)
      rr.currentTime = 1
      expect(rr.percent).toBe(25)
      rr.percent = 50
      expect(rr.currentTime).toBe(2)
    })

    test("sync applies each editor's own trace", () => {
      const { editors, rr } = createMultiRR({ first: "", second: "" })
      rr.src = { first: valuesTrace(["first-start", "first-end"]), second: valuesTrace(["second-start", "second-end"]) }
      expect(editors["first"].getValue()).toBe("first-end")
      expect(editors["second"].getValue()).toBe("second-end")

      seek(rr, 0)
      expect(editors["first"].getValue()).toBe("first-start")
      expect(editors["second"].getValue()).toBe("second-start")
    })
  })

  describe("seeking", () => {
    test("seek forward then backward shows the state at each point", () => {
      const { editors, rr } = createMultiRR({ first: "", second: "" })
      rr.src = {
        first: valuesTrace(["first-start", "first-mid", "first-end"]),
        second: valuesTrace(["second-start", "second-mid", "second-end"]),
      }
      expect(editors["first"].getValue()).toBe("first-end")

      seek(rr, 0)
      expect(editors["first"].getValue()).toBe("first-start")
      expect(editors["second"].getValue()).toBe("second-start")

      seek(rr, 3)
      expect(editors["first"].getValue()).toBe("first-end")
      expect(editors["second"].getValue()).toBe("second-end")

      seek(rr, 1.5)
      expect(editors["first"].getValue()).toBe("first-mid")
      expect(editors["second"].getValue()).toBe("second-mid")

      seek(rr, 1.499)
      expect(editors["first"].getValue()).toBe("first-start")
      expect(editors["second"].getValue()).toBe("second-start")
    })
  })
})
