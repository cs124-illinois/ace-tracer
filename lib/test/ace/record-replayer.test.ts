import { afterEach, describe, expect, jest, test } from "bun:test"
import { AceTrace, Complete, IRecordReplayer } from "@cs124/ace-recorder-types"
import AceRecordReplayer from "../../src/ace/RecordReplayer"
import { createMockEditor } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"
import { at, makeComplete, makeDelta, makeTrace } from "../fixtures/traces"

const MODE = "ace/mode/text"
const loc = (row: number, column: number) => ({ row, column })

// "a" at 0s, "b" at 1s, "c" at 2s, end at 3s
function typingTrace() {
  return new AceTrace(
    [
      makeComplete({ timestamp: at(0), value: "a", cursor: loc(0, 1) }),
      makeDelta({ timestamp: at(1000), start: loc(0, 1), end: loc(0, 2), lines: ["b"] }),
      makeDelta({ timestamp: at(2000), start: loc(0, 2), end: loc(0, 3), lines: ["c"] }),
      makeComplete({ timestamp: at(3000), reason: "end", value: "abc" }),
    ],
    [{ name: "main", contents: "abc", mode: MODE }],
    "main",
  )
}

const created: AceRecordReplayer[] = []
function createAceRR(value = "hello world", options?: AceRecordReplayer.Options) {
  const editor = createMockEditor(value)
  const rr = new AceRecordReplayer(editor as any, options)
  created.push(rr)
  return { editor, rr }
}

function listen(rr: AceRecordReplayer) {
  const states: IRecordReplayer.State[] = []
  const events: IRecordReplayer.Event[] = []
  rr.addStateListener((state) => states.push(state))
  rr.addEventListener((event) => events.push(event))
  return { states, events }
}

describe("AceRecordReplayer", () => {
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

  describe("state machine transitions", () => {
    test("initial state is paused", () => {
      const { rr } = createAceRR()
      expect(rr.state).toBe("paused")
    })

    test("paused → recording → paused", async () => {
      const { rr } = createAceRR()
      const { states } = listen(rr)

      await rr.record()
      expect(rr.state).toBe("recording")
      expect(rr.recorder.recording).toBe(true)

      await rr.stop()
      expect(rr.state).toBe("paused")
      expect(rr.recorder.recording).toBe(false)
      expect(states).toEqual(["recording", "paused"])
    })

    test("paused → playing → paused", async () => {
      const { rr } = createAceRR()
      rr.src = typingTrace()
      const { states } = listen(rr)

      await rr.play()
      expect(rr.state).toBe("playing")
      expect(rr.playing).toBe(true)

      rr.pause()
      expect(rr.state).toBe("paused")
      expect(rr.playing).toBe(false)
      expect(states).toEqual(["playing", "paused"])
    })

    test("play while recording throws", async () => {
      const { rr } = createAceRR()
      await rr.record()
      await expect(rr.play()).rejects.toThrow("Not paused")
      expect(rr.state).toBe("recording")
    })

    test("record while playing throws", async () => {
      const { rr } = createAceRR()
      rr.src = typingTrace()
      await rr.play()
      await expect(rr.record()).rejects.toThrow("Not paused")
      expect(rr.state).toBe("playing")
    })

    test("pause while paused throws", () => {
      const { rr } = createAceRR()
      expect(() => rr.pause()).toThrow("Not playing")
    })

    test("stop while paused throws", async () => {
      const { rr } = createAceRR()
      await expect(rr.stop()).rejects.toThrow("Not recording")
    })
  })

  describe("playback end", () => {
    test("reaching the end of the trace pauses and emits ended", async () => {
      const { rr } = createAceRR()
      rr.src = typingTrace()
      const { states, events } = listen(rr)

      await rr.play()
      jest.advanceTimersByTime(2999)
      expect(rr.state).toBe("playing")
      expect(events).toEqual([])

      jest.advanceTimersByTime(1)
      expect(rr.state).toBe("paused")
      expect(states).toEqual(["playing", "paused"])
      expect(events).toEqual(["ended"])
      expect(rr.currentTime).toBe(3)
      expect(rr.percent).toBe(100)
    })

    test("play() from the last record ends immediately without entering playing", async () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 0, records: 1 })
      const { states, events } = listen(rr)

      await rr.play()

      expect(rr.state).toBe("paused")
      expect(rr.playing).toBe(false)
      expect(states).toEqual([])
      expect(events).toEqual(["ended"])
    })

    test("can play again after ending", async () => {
      const { editor, rr } = createAceRR()
      rr.src = typingTrace()
      await rr.play()
      jest.advanceTimersByTime(3000)
      expect(rr.state).toBe("paused")

      await rr.play()
      expect(rr.state).toBe("playing")
      expect(rr.currentTime).toBe(0)
      expect(editor.getValue()).toBe("a")
    })
  })

  describe("playback rate", () => {
    test("changing the rate mid-play doesn't change the state", async () => {
      const { editor, rr } = createAceRR()
      rr.src = typingTrace()
      const { states, events } = listen(rr)

      await rr.play()
      jest.advanceTimersByTime(1000)
      rr.playbackRate = 2

      expect(rr.state).toBe("playing")
      expect(states).toEqual(["playing"])
      expect(rr.currentTime).toBe(1)

      // The remaining 2s of trace time takes 1s at 2x
      jest.advanceTimersByTime(500)
      expect(editor.getValue()).toBe("abc")
      jest.advanceTimersByTime(500)
      expect(rr.state).toBe("paused")
      expect(states).toEqual(["playing", "paused"])
      expect(events).toEqual(["ended"])
    })
  })

  describe("src management", () => {
    test("src setter throws during playing", async () => {
      const { rr } = createAceRR()
      rr.src = typingTrace()
      await rr.play()

      expect(() => {
        rr.src = makeTrace({ durationMs: 2000, records: 5 })
      }).toThrow("Can't change src while playing or recording")
    })

    test("src setter throws during recording", async () => {
      const { rr } = createAceRR()
      await rr.record()

      expect(() => {
        rr.src = makeTrace({ durationMs: 2000, records: 5 })
      }).toThrow("Can't change src while playing or recording")
    })

    test("src getter throws during recording", async () => {
      const { rr } = createAceRR()
      await rr.record()
      expect(() => rr.src).toThrow("Still recording")
    })

    test("stop() loads the recording as src", async () => {
      const { editor, rr } = createAceRR("abc")
      await rr.record()
      jest.advanceTimersByTime(500)
      editor.simulateChange({ action: "insert", start: loc(0, 3), end: loc(0, 4), lines: ["d"] })
      jest.advanceTimersByTime(500)
      await rr.stop()

      expect(rr.src).toBe(rr.recorder.src!)
      expect(rr.duration).toBe(1)

      rr.currentTime = 0
      rr.sync()
      expect(editor.getValue()).toBe("abc")
      rr.currentTime = 1
      rr.sync()
      expect(editor.getValue()).toBe("abcd")
    })
  })

  describe("percent", () => {
    test("percent is currentTime as a share of duration", () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 4000, records: 9 })
      rr.currentTime = 1
      expect(rr.percent).toBe(25)
    })

    test("setting percent sets currentTime", () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 4000, records: 9 })
      rr.percent = 50
      expect(rr.currentTime).toBe(2)
    })
  })

  describe("listeners", () => {
    test("removed listeners are no longer called", async () => {
      const { rr } = createAceRR()
      const states: IRecordReplayer.State[] = []
      const events: IRecordReplayer.Event[] = []
      const stateListener = (state: IRecordReplayer.State) => states.push(state)
      const eventListener = (event: IRecordReplayer.Event) => events.push(event)
      rr.addStateListener(stateListener)
      rr.addEventListener(eventListener)
      rr.removeStateListener(stateListener)
      rr.removeEventListener(eventListener)

      rr.src = typingTrace()
      await rr.play()
      jest.advanceTimersByTime(3000)

      expect(states).toEqual([])
      expect(events).toEqual([])
    })

    test("setting the state to its current value doesn't emit", () => {
      const { rr } = createAceRR()
      const { states } = listen(rr)
      rr.state = "paused"
      expect(states).toEqual([])
    })
  })

  describe("hasRecording", () => {
    test("is false until a recording stops, and false again after src is set", async () => {
      const { rr } = createAceRR()
      expect(rr.hasRecording).toBe(false)

      await rr.record()
      expect(rr.hasRecording).toBe(false)

      await rr.stop()
      expect(rr.hasRecording).toBe(true)

      rr.src = makeTrace({ durationMs: 2000, records: 5 })
      expect(rr.hasRecording).toBe(false)
    })

    // record() doesn't reset hasRecording, so it stays true while a second recording is in progress even though src
    // can't be read until that recording stops
    test("is false while re-recording", async () => {
      const { rr } = createAceRR()
      await rr.record()
      await rr.stop()

      await rr.record()
      expect(rr.hasRecording).toBe(false)
    })
  })

  describe("options", () => {
    test("recorderOptions are passed to the recorder", async () => {
      const { rr } = createAceRR("", { recorderOptions: { completeInterval: 250 } })
      await rr.record()
      jest.advanceTimersByTime(1000)
      await rr.stop()

      const timerCompletes = rr.src!.records.filter((r) => Complete.guard(r) && r.reason === "timer")
      expect(timerCompletes).toHaveLength(4)
    })

    test("without recorderOptions the recorder's 1s default applies", async () => {
      const { rr } = createAceRR("")
      await rr.record()
      jest.advanceTimersByTime(1000)
      await rr.stop()

      const timerCompletes = rr.src!.records.filter((r) => Complete.guard(r) && r.reason === "timer")
      expect(timerCompletes).toHaveLength(1)
    })

    test("replayEditor: records from the editor, replays into the replay editor", async () => {
      const editor = createMockEditor("abc")
      const replayEditor = createMockEditor("")
      const rr = new AceRecordReplayer(editor as any, { replayEditor: replayEditor as any })
      created.push(rr)
      expect(rr.editor).toBe(replayEditor as any)

      await rr.record()
      jest.advanceTimersByTime(500)
      editor.simulateChange({ action: "insert", start: loc(0, 3), end: loc(0, 4), lines: ["d"] })
      jest.advanceTimersByTime(500)
      await rr.stop()

      rr.currentTime = 0
      rr.sync()
      expect(replayEditor.getValue()).toBe("abc")
      expect(editor.getValue()).toBe("abcd")

      rr.currentTime = 1
      rr.sync()
      expect(replayEditor.getValue()).toBe("abcd")
    })

    test("filterRecord is applied during playback", async () => {
      const { editor, rr } = createAceRR("", { filterRecord: (record) => record.type !== "delta" })
      rr.src = typingTrace()

      await rr.play()
      jest.advanceTimersByTime(2500)
      expect(editor.getValue()).toBe("a")
    })
  })
})
