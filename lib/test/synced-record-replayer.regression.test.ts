import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { IRecordReplayer } from "@cs124/ace-recorder-types"
import AudioRecordReplayer from "../src/audio/RecordReplayer"
import MultiRecordReplayer from "../src/MultiRecordReplayer"
import RecordReplayer from "../src/RecordReplayer"
import { createMockEditor } from "./fixtures/ace-mock"
import { installAudioMocks, restoreAudioMocks } from "./fixtures/audio-mock"
import { makeClickTrackTrace } from "./fixtures/traces"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const variants = [
  {
    name: "RecordReplayer",
    create: () => new RecordReplayer(createMockEditor("") as any),
  },
  {
    name: "MultiRecordReplayer",
    create: () => new MultiRecordReplayer({ a: createMockEditor("") as any, b: createMockEditor("") as any }),
  },
]

let metadataTimeout: number
beforeAll(() => {
  installAudioMocks()
  // The mocked recording's blob URL never loads metadata, so don't wait long for it
  metadataTimeout = AudioRecordReplayer.metadataTimeout
  AudioRecordReplayer.metadataTimeout = 10
})
afterAll(() => {
  AudioRecordReplayer.metadataTimeout = metadataTimeout
  restoreAudioMocks()
})

const fixAudioDuration = (rr: RecordReplayer | MultiRecordReplayer, seconds: () => number) =>
  Object.defineProperty(rr.audio.player, "duration", { get: seconds, configurable: true })

describe.each(variants)("$name regressions", ({ create }) => {
  test("record() emits recording once, after both audio and Ace have started", async () => {
    const rr = create()
    const seen: { state: IRecordReplayer.State; ace: IRecordReplayer.State; audio: IRecordReplayer.State }[] = []
    rr.addStateListener((state) => seen.push({ state, ace: rr.ace.state, audio: rr.audio.state }))

    await rr.record()

    expect(seen).toEqual([{ state: "recording", ace: "recording", audio: "recording" }])
    fixAudioDuration(rr, () => rr.ace.duration)
    await rr.stop()
  })

  test("stop() emits srcChanged, then paused, after both halves have stopped", async () => {
    const rr = create()
    await rr.record()
    await sleep(20)
    fixAudioDuration(rr, () => rr.ace.duration)

    const order: string[] = []
    let srcAtPause: unknown
    rr.addEventListener((event) => order.push(event))
    rr.addStateListener((state) => {
      order.push(state)
      if (state === "paused") {
        // Reading src throws "Still recording" if Ace hasn't stopped yet
        srcAtPause = rr.src
      }
    })

    await rr.stop()

    expect(order).toEqual(["srcChanged", "paused"])
    expect(srcAtPause).toBeDefined()
    expect(rr.hasRecording).toBe(true)
  })

  test("stop() rejects when the audio and Ace lengths differ by more than the tolerance", async () => {
    const rr = create()
    await rr.record()
    fixAudioDuration(rr, () => rr.ace.duration + RecordReplayer.durationTolerance + 1)

    expect(rr.stop()).rejects.toThrow("Recordings do not have equal length")
    await sleep(0)
    expect(rr.state).toBe("paused")
    expect(rr.hasRecording).toBe(false)
  })

  test("stop() accepts lengths within the tolerance, in seconds", async () => {
    const rr = create()
    await rr.record()
    fixAudioDuration(rr, () => rr.ace.duration + RecordReplayer.durationTolerance / 2)

    await rr.stop()
    expect(rr.hasRecording).toBe(true)
  })

  test("play() throws without a source", async () => {
    const rr = create()
    expect(rr.play()).rejects.toThrow("No source")
  })

  test("record() stops the audio again when Ace can't start", async () => {
    const rr = create()
    const ace = rr.ace as any
    const recorder = ace.recorder ?? Object.values(ace.recorders)[0]
    recorder.addSession({ name: "unselected", contents: "", mode: "ace/mode/text" })

    expect(rr.record()).rejects.toThrow("Session information not properly configured")
    await sleep(50)
    expect(rr.state).toBe("paused")
    expect(rr.audio.state).toBe("paused")
  })

  test("removed listeners are no longer called", async () => {
    const rr = create()
    const states: IRecordReplayer.State[] = []
    const events: IRecordReplayer.Event[] = []
    const stateListener = (state: IRecordReplayer.State) => states.push(state)
    const eventListener = (event: IRecordReplayer.Event) => events.push(event)
    rr.addStateListener(stateListener)
    rr.addEventListener(eventListener)
    rr.removeStateListener(stateListener)
    rr.removeEventListener(eventListener)

    await rr.record()
    fixAudioDuration(rr, () => rr.ace.duration)
    await rr.stop()

    expect(states).toEqual([])
    expect(events).toEqual([])
  })
})

describe("RecordReplayer seeking regressions", () => {
  test("a seek from the audio element while paused updates the editor", () => {
    const editor = createMockEditor("")
    const rr = new RecordReplayer(editor as any)
    rr.src = { ace: makeClickTrackTrace([50, 2000]), audio: "data:audio/wav;base64,UklGRg==" }
    expect(editor.getValue()).toBe("")

    // Native audio controls change currentTime directly and fire timeupdate
    rr.audio.player.currentTime = 1
    rr.audio.player.dispatchEvent(new Event("timeupdate"))

    expect(editor.getValue()).toBe("!x")
  })
})

describe("AudioRecordReplayer regressions", () => {
  test("a pause() while play() is pending leaves the state paused instead of rejecting", async () => {
    const audio = new AudioRecordReplayer()
    let rejectPlay: (err: unknown) => void = () => {}
    audio.player.play = () =>
      new Promise<void>((_, reject) => {
        rejectPlay = reject
      })
    Object.defineProperty(audio.player, "paused", { get: () => true, configurable: true })

    const playing = audio.play()
    rejectPlay(new DOMException("The play() request was interrupted by a call to pause()", "AbortError"))
    await playing

    expect(audio.state).toBe("paused")
  })

  test("play() still rejects for errors other than an interrupting pause", async () => {
    const audio = new AudioRecordReplayer()
    audio.player.play = () => Promise.reject(new DOMException("Not supported", "NotSupportedError"))

    expect(audio.play()).rejects.toThrow("Not supported")
  })

  test("a pause that doesn't come through pause() still updates the state", async () => {
    const audio = new AudioRecordReplayer()
    audio.state = "playing"
    audio.player.dispatchEvent(new Event("pause"))
    expect(audio.state as IRecordReplayer.State).toBe("paused")
  })

  test("ended is emitted on the event channel", () => {
    const audio = new AudioRecordReplayer()
    const events: IRecordReplayer.Event[] = []
    audio.addEventListener((event) => events.push(event))
    audio.player.dispatchEvent(new Event("ended"))
    expect(events).toEqual(["ended"])
  })
})
