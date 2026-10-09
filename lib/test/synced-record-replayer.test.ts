import { describe, expect, jest, test } from "bun:test"
import { AceTrace, Delta, IRecordReplayer } from "@cs124/ace-recorder-types"
import MultiRecordReplayer from "../src/MultiRecordReplayer"
import RecordReplayer from "../src/RecordReplayer"
import { createMockEditor, MockEditor } from "./fixtures/ace-mock"
import {
  installAudioMocks,
  loadedMetadata,
  MockAudioElement,
  MockMediaRecorder,
  useAudioMocks,
} from "./fixtures/audio-mock"
import { flush, settle, useFakeTimers } from "./fixtures/timers"
import { at, makeComplete, makeDelta } from "./fixtures/traces"
import { silentWavUrl } from "./fixtures/wav-generator"

// RecordReplayer and MultiRecordReplayer share SyncedRecordReplayer, so the shared behavior runs against both

type Synced = RecordReplayer | MultiRecordReplayer
const loc = (row: number, column: number) => ({ row, column })
const DURATION_MS = 4000

// Types one character per second starting at 1s, ending at 4s. The session holds the final text, as a recorded trace's
// sessionInfo does, so loading the trace leaves the editor in a different state than any seek before 3s.
function typingTrace(text: string) {
  const records = [
    makeComplete({ timestamp: at(0), value: "", cursor: loc(0, 0) }),
    ...text
      .split("")
      .map((ch, i) => makeDelta({ timestamp: at((i + 1) * 1000), start: loc(0, i), end: loc(0, i + 1), lines: [ch] })),
    makeComplete({ timestamp: at(DURATION_MS), reason: "end", value: text, cursor: loc(0, text.length) }),
  ]
  return new AceTrace(records, [{ name: "main", contents: text, mode: "ace/mode/text" }], "main")
}

const variants = [
  {
    name: "RecordReplayer",
    texts: ["abc"],
    create: () => {
      const editor = createMockEditor("")
      return { rr: new RecordReplayer(editor as any) as Synced, editors: [editor] }
    },
    ace: () => typingTrace("abc"),
  },
  {
    name: "MultiRecordReplayer",
    texts: ["abc", "xyz"],
    create: () => {
      const editors = { first: createMockEditor(""), second: createMockEditor("") }
      return { rr: new MultiRecordReplayer(editors as any) as Synced, editors: Object.values(editors) }
    },
    ace: () => ({ first: typingTrace("abc"), second: typingTrace("xyz") }),
  },
]

const player = (rr: Synced) => rr.audio.player as unknown as MockAudioElement
const values = (editors: MockEditor[]) => editors.map((editor) => editor.getValue())

function listen(rr: Synced) {
  const log: string[] = []
  const states: IRecordReplayer.State[] = []
  const events: IRecordReplayer.Event[] = []
  rr.addStateListener((state) => {
    states.push(state)
    log.push(`state:${state}`)
  })
  rr.addEventListener((event) => {
    events.push(event)
    log.push(`event:${event}`)
  })
  return { log, states, events }
}

// Plays ms of wall time, advancing the media clock along with the fake clock as a browser would. Positions are kept
// in whole milliseconds so they don't accumulate floating point error.
function playFor(rr: Synced, ms: number, stepMs = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    jest.advanceTimersByTime(stepMs)
    if (!player(rr).paused) {
      const positionMs = Math.round(player(rr).currentTime * 1000) + stepMs * player(rr).playbackRate
      player(rr).advanceTo(positionMs / 1000)
    }
  }
}

describe.each(variants)("$name", (variant) => {
  useAudioMocks()
  useFakeTimers()

  const typed = (count: number) => variant.texts.map((text) => text.slice(0, count))

  async function loaded() {
    const { rr, editors } = variant.create()
    ;(rr as any).src = { ace: variant.ace(), audio: silentWavUrl(DURATION_MS) }
    await settle(loadedMetadata(player(rr)))
    return { rr, editors }
  }

  async function playing() {
    const result = await loaded()
    await result.rr.play()
    return result
  }

  describe("state machine", () => {
    test("starts paused with no recording or source", () => {
      const { rr } = variant.create()
      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(false)
      expect(rr.src).toBeUndefined()
    })

    test("play() without a source rejects without emitting", async () => {
      const { rr } = variant.create()
      const { states, events } = listen(rr)
      await expect(rr.play()).rejects.toThrow("No source")
      expect(rr.state).toBe("paused")
      expect(states).toEqual([])
      expect(events).toEqual([])
    })

    test("pause() and stop() reject in the wrong state", async () => {
      const { rr } = variant.create()
      expect(() => rr.pause()).toThrow("Not playing")
      await expect(rr.stop()).rejects.toThrow("Not recording")
    })

    test("play() and record() reject while playing", async () => {
      const { rr } = await playing()
      await expect(rr.play()).rejects.toThrow("Not paused")
      await expect(rr.record()).rejects.toThrow("Not paused")
      expect(rr.state).toBe("playing")
    })

    test("src can't be changed while playing", async () => {
      const { rr } = await playing()
      expect(() => {
        ;(rr as any).src = { ace: variant.ace(), audio: silentWavUrl(DURATION_MS) }
      }).toThrow("Can't change source while recording or playing")
    })

    test("src can't be read or changed while recording", async () => {
      const { rr } = variant.create()
      await settle(rr.record())
      expect(() => rr.src).toThrow("Still recording")
      expect(() => {
        ;(rr as any).src = undefined
      }).toThrow("Can't change source while recording or playing")
      await settle(rr.stop())
    })
  })

  describe("src", () => {
    test("setting src loads both halves and emits srcChanged", async () => {
      const { rr } = variant.create()
      const { events } = listen(rr)
      const ace = variant.ace()
      const audio = silentWavUrl(DURATION_MS)
      ;(rr as any).src = { ace, audio }
      await settle(loadedMetadata(player(rr)))

      expect(events).toEqual(["srcChanged"])
      expect(rr.src as unknown).toEqual({ ace, audio })
      expect(rr.duration).toBe(4)
      expect(rr.ace.duration).toBe(4)
    })

    test("setting src to undefined clears both halves", async () => {
      const { rr } = await loaded()
      ;(rr as any).src = undefined
      expect(rr.src).toBeUndefined()
      expect(rr.audio.src).toBe("")
      await expect(rr.play()).rejects.toThrow("No source")
    })
  })

  describe("playback", () => {
    test("play() starts audio and Ace", async () => {
      const { rr } = await loaded()
      const { states, events } = listen(rr)

      await rr.play()

      expect(states).toEqual(["playing"])
      expect(events).toEqual(["starting"])
      expect(rr.audio.state).toBe("playing")
      expect(rr.ace.state).toBe("playing")
      expect(player(rr).paused).toBe(false)
    })

    test("Ace follows the audio as it plays", async () => {
      const { rr, editors } = await playing()
      expect(values(editors)).toEqual(typed(0))

      playFor(rr, 1500)
      expect(rr.currentTime).toBe(1.5)
      expect(values(editors)).toEqual(typed(1))

      playFor(rr, 1000)
      expect(rr.currentTime).toBe(2.5)
      expect(values(editors)).toEqual(typed(2))
    })

    test("pause() stops both halves and keeps the position", async () => {
      const { rr, editors } = await playing()
      const { states } = listen(rr)
      playFor(rr, 1500)

      rr.pause()
      expect(states).toEqual(["paused"])
      expect(rr.audio.state).toBe("paused")
      expect(rr.ace.state).toBe("paused")
      expect(rr.currentTime).toBe(1.5)
      expect(rr.ace.currentTime).toBe(1.5)

      jest.advanceTimersByTime(2000)
      expect(values(editors)).toEqual(typed(1))

      await rr.play()
      expect(rr.ace.currentTime).toBe(1.5)
      playFor(rr, 600)
      expect(values(editors)).toEqual(typed(2))
      expect(states).toEqual(["paused", "playing"])
    })

    test("when the audio ends, playback pauses and rewinds to the start", async () => {
      const { rr, editors } = await playing()
      const { states, events } = listen(rr)

      playFor(rr, DURATION_MS)

      expect(states).toEqual(["paused"])
      expect(events).toEqual(["ending", "seeked", "ended"])
      expect(rr.currentTime).toBe(0)
      expect(rr.ace.currentTime).toBe(0)
      expect(values(editors)).toEqual(typed(0))

      await rr.play()
      playFor(rr, 1500)
      expect(values(editors)).toEqual(typed(1))
    })

    test("a pause from outside, like a media key, pauses Ace", async () => {
      const { rr, editors } = await playing()
      const { states } = listen(rr)
      playFor(rr, 1500)

      player(rr).pause()

      expect(states).toEqual(["paused"])
      expect(rr.state).toBe("paused")
      expect(rr.ace.state).toBe("paused")
      jest.advanceTimersByTime(2000)
      expect(values(editors)).toEqual(typed(1))
    })

    test("a play from outside starts Ace at the audio's position", async () => {
      const { rr, editors } = await loaded()
      const { states } = listen(rr)
      player(rr).currentTime = 2.5

      await player(rr).play()
      await flush()

      expect(states).toEqual(["playing"])
      expect(rr.ace.state).toBe("playing")
      expect(rr.ace.currentTime).toBe(2.5)
      expect(values(editors)).toEqual(typed(2))
    })

    test.each(["waiting", "stalled"])("Ace waits while the audio is %s and resumes with it", async (event) => {
      const { rr, editors } = await playing()
      playFor(rr, 1000)
      expect(values(editors)).toEqual(typed(1))

      player(rr).dispatchEvent(new Event(event))
      expect(rr.ace.state).toBe("paused")
      expect(rr.state).toBe("playing")

      // The audio is stuck, so Ace mustn't run ahead of it
      jest.advanceTimersByTime(2000)
      expect(values(editors)).toEqual(typed(1))

      player(rr).dispatchEvent(new Event("playing"))
      await flush()
      expect(rr.ace.state).toBe("playing")
      expect(rr.ace.currentTime).toBe(1)
      playFor(rr, 1000)
      expect(values(editors)).toEqual(typed(2))
    })
  })

  describe("drift correction on timeupdate", () => {
    test("drift within the tolerance is left alone", async () => {
      const { rr } = await playing()
      jest.advanceTimersByTime(1000)
      expect(rr.ace.currentTime).toBe(1)

      player(rr).advanceTo(1.05)

      expect(rr.ace.currentTime).toBe(1)
    })

    test("drift beyond the tolerance moves Ace to the audio's position", async () => {
      const { rr, editors } = await playing()
      jest.advanceTimersByTime(1000)
      expect(values(editors)).toEqual(typed(1))

      player(rr).advanceTo(2.5)

      expect(rr.ace.currentTime).toBe(2.5)
      expect(values(editors)).toEqual(typed(2))
      expect(rr.ace.state).toBe("playing")
    })
  })

  describe("seeking", () => {
    test("setting currentTime moves both halves and syncs the editor", async () => {
      const { rr, editors } = await loaded()
      const { events } = listen(rr)
      expect(values(editors)).toEqual(typed(3))

      rr.currentTime = 2.5

      expect(player(rr).currentTime).toBe(2.5)
      expect(rr.ace.currentTime).toBe(2.5)
      expect(values(editors)).toEqual(typed(2))
      expect(events).toEqual(["seeked"])
    })

    test("setting percent seeks by the audio's duration", async () => {
      const { rr, editors } = await loaded()
      const { events } = listen(rr)

      rr.percent = 25

      expect(rr.currentTime).toBe(1)
      expect(rr.ace.currentTime).toBe(1)
      expect(rr.percent).toBe(25)
      expect(values(editors)).toEqual(typed(1))
      expect(events).toEqual(["seeked"])
    })

    test("seeking while playing continues from the new position", async () => {
      const { rr, editors } = await playing()
      playFor(rr, 500)

      rr.currentTime = 3

      expect(values(editors)).toEqual(typed(3))
      expect(rr.state).toBe("playing")
      playFor(rr, 500)
      expect(rr.ace.currentTime).toBe(3.5)
    })
  })

  describe("playback rate", () => {
    test("setting playbackRate updates both halves and emits playbackRateChange", async () => {
      const { rr } = await loaded()
      const { events } = listen(rr)

      rr.playbackRate = 2

      expect(rr.playbackRate).toBe(2)
      expect(player(rr).playbackRate).toBe(2)
      expect(rr.ace.playbackRate).toBe(2)
      expect(events).toEqual(["playbackRateChange"])
    })

    test("both halves play at the new rate", async () => {
      const { rr, editors } = await loaded()
      rr.playbackRate = 2
      await rr.play()

      playFor(rr, 500)

      expect(rr.currentTime).toBe(1)
      expect(rr.ace.currentTime).toBe(1)
      expect(values(editors)).toEqual(typed(1))
    })

    test("changing the rate mid-play keeps the position and doesn't change the state", async () => {
      const { rr, editors } = await playing()
      const { states } = listen(rr)
      playFor(rr, 1000)

      rr.playbackRate = 2
      expect(rr.ace.currentTime).toBe(1)
      playFor(rr, 500)

      expect(rr.ace.currentTime).toBe(2)
      expect(values(editors)).toEqual(typed(2))
      expect(states).toEqual([])
    })

    test("a rate set before loading a source applies when it plays", async () => {
      const { rr } = variant.create()
      rr.playbackRate = 2
      ;(rr as any).src = { ace: variant.ace(), audio: silentWavUrl(DURATION_MS) }
      await settle(loadedMetadata(player(rr)))

      await rr.play()

      expect(player(rr).playbackRate).toBe(2)
      expect(rr.ace.playbackRate).toBe(2)
    })

    // Loading media resets the element's playbackRate, and AudioRecordReplayer's src setter copies the element's
    // (already reset) rate back instead of its own, so the getter reports 1 until play() reapplies the stored rate
    test("the rate is still reported after loading a source", async () => {
      const { rr } = variant.create()
      rr.playbackRate = 2
      ;(rr as any).src = { ace: variant.ace(), audio: silentWavUrl(DURATION_MS) }
      expect(rr.playbackRate).toBe(2)
    })
  })

  describe("recording", () => {
    async function record(rr: Synced, editors: MockEditor[]) {
      await settle(rr.record())
      jest.advanceTimersByTime(1000)
      editors[0].simulateChange({ action: "insert", start: loc(0, 0), end: loc(0, 1), lines: ["X"] })
      jest.advanceTimersByTime(2000)
      await settle(rr.stop())
    }

    test("record() starts audio, then Ace, then reports recording", async () => {
      const { rr } = variant.create()
      const { log } = listen(rr)

      await settle(rr.record())

      expect(log).toEqual(["event:startingRecording", "state:recording", "event:startedRecording"])
      expect(rr.audio.state).toBe("recording")
      expect(rr.ace.state).toBe("recording")
      await settle(rr.stop())
    })

    test("stop() reports the new recording, then paused", async () => {
      const { rr, editors } = variant.create()
      const { log } = listen(rr)

      await record(rr, editors)

      expect(log).toEqual([
        "event:startingRecording",
        "state:recording",
        "event:startedRecording",
        "event:srcChanged",
        "state:paused",
      ])
      expect(rr.hasRecording).toBe(true)
      expect(rr.audio.state).toBe("paused")
      expect(rr.ace.state).toBe("paused")
    })

    test("the recorded audio and Ace traces have the same length", async () => {
      const { rr, editors } = variant.create()
      await record(rr, editors)

      expect(rr.duration).toBe(3)
      expect(rr.ace.duration).toBe(3)
      expect(rr.src!.audio).toBe(rr.audio.recorder.src!)
      for (const track of MockMediaRecorder.instances[0].stream.getTracks()) {
        expect(track.readyState).toBe("ended")
      }
    })

    test("the recording replays", async () => {
      const { rr, editors } = variant.create()
      await record(rr, editors)

      rr.currentTime = 0.5
      expect(editors[0].getValue()).toBe("")
      rr.currentTime = 2
      expect(editors[0].getValue()).toBe("X")

      rr.currentTime = 0
      await rr.play()
      playFor(rr, 1500)
      expect(editors[0].getValue()).toBe("X")
    })

    test("hasRecording is false while recording and after loading another source", async () => {
      const { rr, editors } = variant.create()
      await settle(rr.record())
      expect(rr.hasRecording).toBe(false)
      await settle(rr.stop())
      expect(rr.hasRecording).toBe(true)

      ;(rr as any).src = { ace: variant.ace(), audio: silentWavUrl(DURATION_MS) }
      expect(rr.hasRecording).toBe(false)
      expect(editors).toHaveLength(variant.texts.length)
    })

    test("timeupdate while recording leaves Ace alone", async () => {
      const { rr } = variant.create()
      await settle(rr.record())
      jest.advanceTimersByTime(1000)

      player(rr).currentTime = 5
      player(rr).dispatchEvent(new Event("timeupdate"))

      expect(rr.ace.state).toBe("recording")
      await settle(rr.stop())
      expect(rr.ace.duration).toBe(1)
    })

    test("stop() rejects when the audio is shorter than Ace by more than the tolerance", async () => {
      installAudioMocks({ lostMs: (RecordReplayer.durationTolerance + 0.5) * 1000 })
      const { rr, editors } = variant.create()
      const { log } = listen(rr)
      await settle(rr.record())
      jest.advanceTimersByTime(3000)
      log.length = 0

      await expect(settle(rr.stop())).rejects.toThrow("Recordings do not have equal length: Audio 1.5s <-> Ace 3s")

      expect(log).toEqual(["state:paused"])
      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(false)
      expect(editors[0].getValue()).toBe("")
    })

    test("stop() accepts audio that's shorter by less than the tolerance", async () => {
      installAudioMocks({ lostMs: (RecordReplayer.durationTolerance / 2) * 1000 })
      const { rr } = variant.create()
      await settle(rr.record())
      jest.advanceTimersByTime(3000)

      await settle(rr.stop())

      expect(rr.hasRecording).toBe(true)
      expect(rr.duration).toBe(2.5)
      expect(rr.ace.duration).toBe(3)
    })

    test("stop() accepts audio whose duration can't be determined", async () => {
      installAudioMocks({ mimeType: "audio/mp4" })
      const { rr } = variant.create()
      await settle(rr.record())
      jest.advanceTimersByTime(3000)

      await settle(rr.stop())

      expect(rr.hasRecording).toBe(true)
      expect(rr.duration).toBeNaN()
    })

    test("record() rejects when the audio can't start, leaving Ace alone", async () => {
      installAudioMocks({ failStart: true })
      const { rr } = variant.create()
      const { log } = listen(rr)

      await expect(settle(rr.record())).rejects.toThrow("MediaRecorder failed to start")

      expect(log).toEqual(["event:startingRecording"])
      expect(rr.state).toBe("paused")
      expect(rr.ace.state).toBe("paused")
      expect(rr.audio.state).toBe("paused")
    })
  })
})

describe("MultiRecordReplayer", () => {
  useAudioMocks()
  useFakeTimers()

  test("exposes one player and recorder per editor", () => {
    const rr = new MultiRecordReplayer({ first: createMockEditor("") as any, second: createMockEditor("") as any })
    expect(Object.keys(rr.ace.players)).toEqual(["first", "second"])
    expect(Object.keys(rr.ace.recorders)).toEqual(["first", "second"])
  })

  test("each trace records only its own editor", async () => {
    const editors = { first: createMockEditor(""), second: createMockEditor("") }
    const rr = new MultiRecordReplayer(editors as any)
    await settle(rr.record())
    jest.advanceTimersByTime(500)
    editors.second.simulateChange({ action: "insert", start: loc(0, 0), end: loc(0, 1), lines: ["Y"] })
    jest.advanceTimersByTime(500)
    await settle(rr.stop())

    const src = rr.src!.ace!
    expect(src.first.records.filter((r) => Delta.guard(r))).toHaveLength(0)
    expect(src.second.records.filter((r) => Delta.guard(r))).toHaveLength(1)
  })
})
