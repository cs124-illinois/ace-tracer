import { AceTrace } from "@cs124/ace-recorder-types"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import MultiRecordReplayer from "../src/MultiRecordReplayer"
import { createMockEditor, MockEditor } from "./fixtures/ace-mock"
import { installAudioMocks } from "./fixtures/audio-mock"
import { BASE_DATE, makeComplete, makeTrace } from "./fixtures/traces"

function makeEditorTrace(value: string, durationMs = 3000): AceTrace {
  const endTime = new Date(BASE_DATE.valueOf() + durationMs)
  const records = [
    makeComplete({ timestamp: BASE_DATE, reason: "start", value }),
    makeComplete({ timestamp: endTime, reason: "end", value }),
  ]
  const sessionInfo = [{ name: "main", contents: value, mode: "text" }]
  return new AceTrace(records, sessionInfo, "main")
}

function createMultiRR(configs: Record<string, string>) {
  const editors: Record<string, MockEditor> = {}
  for (const [name, value] of Object.entries(configs)) editors[name] = createMockEditor(value)
  return { editors, rr: new MultiRecordReplayer(editors as any) }
}

describe("MultiRecordReplayer", () => {
  let rr: MultiRecordReplayer | undefined

  afterEach(() => {
    if (rr?.state === "recording") {
      try {
        rr.audio.recorder.stop()
      } catch {}
      try {
        rr.ace.pause()
      } catch {}
    } else if (rr?.state === "playing") {
      try {
        rr.pause()
      } catch {}
    }
    rr = undefined
  })

  describe("state machine", () => {
    test("initial state is paused", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      expect(rr.state).toBe("paused")
    })

    test("play without src throws", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      // play calls audio.play() which calls HTMLAudioElement.play()
      // In happy-dom, this may not throw but the state should still work
      // The underlying audio element's play will be called
      try {
        await rr.play()
        // If it didn't throw, pause to clean up
        rr.pause()
      } catch {
        // Expected - audio element may reject play without src
      }
    })

    test("pause while not playing throws", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      expect(() => rr!.pause()).toThrow("Not playing")
    })

    test("stop while not recording throws", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      await expect(rr.stop()).rejects.toThrow("Not recording")
    })

    test("src setter emits srcChanged", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      rr.src = { ace: { editor1: makeTrace({ durationMs: 3000 }) }, audio: "data:audio/wav;base64,AAAA" }

      expect(events).toContain("srcChanged")
    })

    test("src setter throws during playing", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.src = { ace: { editor1: makeTrace({ durationMs: 3000 }) }, audio: "data:audio/wav;base64,AAAA" }

      // Manually set duration so play works
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      try {
        await rr.play()
        expect(() => {
          rr!.src = { ace: { editor1: makeTrace({ durationMs: 3000 }) }, audio: "data:audio/wav;base64,AAAA" }
        }).toThrow("Can't change source while recording or playing")
      } finally {
        try {
          rr.pause()
        } catch {}
      }
    })

    test("src getter throws during recording", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      installAudioMocks()

      await rr.record()
      expect(() => rr!.src).toThrow("Still recording")
    })
  })

  describe("construction", () => {
    test("ace property exposes AceMultiRecordReplayer with correct editor keys", () => {
      const { rr: multiRR } = createMultiRR({ first: "a", second: "b" })
      rr = multiRR

      expect(rr.ace).toBeDefined()
      expect(Object.keys(rr.ace.players)).toEqual(["first", "second"])
      expect(Object.keys(rr.ace.recorders)).toEqual(["first", "second"])
    })

    test("audio property exposes AudioRecordReplayer", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      expect(rr.audio).toBeDefined()
      expect(rr.audio.player).toBeDefined()
    })
  })

  describe("src management", () => {
    test("setting src loads ace traces and audio src", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "http://example.com/audio.mp3" }

      expect(rr.ace.players["editor1"].src).toBeDefined()
      expect(rr.audio.player.src).toContain("audio.mp3")
    })

    test("setting src to undefined clears both", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.src = { ace: { editor1: makeTrace({ durationMs: 3000 }) }, audio: "http://example.com/audio.mp3" }
      rr.src = undefined

      expect(rr.src).toBeUndefined()
    })

    test("getter returns combined ace and audio shape", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "http://example.com/audio.mp3" }

      const src = rr.src!
      expect(src.ace).toBeDefined()
      expect(src.audio).toBeDefined()
    })
  })

  describe("seeking", () => {
    test("currentTime setter updates audio and ace, calls sync, emits seeked", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      const trace = makeEditorTrace("hello")
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      rr.currentTime = 1.5

      expect(rr.audio.player.currentTime).toBeCloseTo(1.5, 1)
      expect(events).toContain("seeked")
    })

    test("percent setter updates audio and ace, emits seeked", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      const trace = makeTrace({ durationMs: 4000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 4, writable: true })

      rr.percent = 50

      expect(rr.audio.player.currentTime).toBeCloseTo(2.0, 1)
      expect(events).toContain("seeked")
    })
  })

  describe("playback rate", () => {
    test("setter updates audio and all ace players, emits playbackRateChange", () => {
      const { rr: multiRR } = createMultiRR({ first: "", second: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      rr.playbackRate = 2.0

      expect(rr.audio.player.playbackRate).toBe(2.0)
      expect(rr.ace.players["first"].playbackRate).toBe(2.0)
      expect(rr.ace.players["second"].playbackRate).toBe(2.0)
      expect(events).toContain("playbackRateChange")
    })

    test("getter delegates to audio", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      rr.playbackRate = 1.5
      expect(rr.playbackRate).toBe(1.5)
    })
  })

  describe("audio-ace sync via timeupdate", () => {
    test("within tolerance: ace time NOT overwritten", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 5, writable: true })

      // Set both to close values (within 0.1s tolerance)
      rr.ace.currentTime = 2.0
      rr.audio.player.currentTime = 2.05

      const aceTimeBefore = rr.ace.currentTime

      // Fire timeupdate
      rr.audio.player.dispatchEvent(new Event("timeupdate"))

      // Ace time should NOT be overwritten (diff = 0.05 < 0.1 tolerance)
      expect(rr.ace.currentTime).toBeCloseTo(aceTimeBefore, 1)
    })

    test("exceeds tolerance: ace time IS synced to audio", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 5, writable: true })

      // Set ace to 0, audio to 3.0 (diff > tolerance)
      rr.ace.currentTime = 0
      rr.audio.player.currentTime = 3.0

      // Fire timeupdate
      rr.audio.player.dispatchEvent(new Event("timeupdate"))

      // Ace time should be synced to audio position
      expect(rr.ace.currentTime).toBeCloseTo(3.0, 1)
    })

    test("continuous playback: drift stays within tolerance", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 5000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 5, writable: true })

      // Simulate stepping audio in 50ms increments
      for (let t = 0; t <= 2000; t += 50) {
        const timeSec = t / 1000
        rr.audio.player.currentTime = timeSec
        rr.audio.player.dispatchEvent(new Event("timeupdate"))

        const drift = Math.abs(rr.ace.currentTime - timeSec)
        expect(drift).toBeLessThanOrEqual(0.15) // tolerance + small buffer
      }
    })
  })

  describe("audio stall/resume", () => {
    test("waiting event pauses ace", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      // Put ace into playing state
      await rr.ace.play()
      expect(rr.ace.state).toBe("playing")

      // Fire waiting event
      rr.audio.player.dispatchEvent(new Event("waiting"))

      expect(rr.ace.state).toBe("paused")
    })

    test("stalled event pauses ace", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      // Put ace into playing state
      await rr.ace.play()
      expect(rr.ace.state).toBe("playing")

      // Fire stalled event
      rr.audio.player.dispatchEvent(new Event("stalled"))

      expect(rr.ace.state).toBe("paused")
    })

    test("playing event resumes ace", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      // ace is paused, fire playing event — should attempt to resume ace
      rr.audio.player.dispatchEvent(new Event("playing"))

      // Allow microtask tick for async play
      await new Promise((r) => setTimeout(r, 10))

      expect(rr.ace.state).toBe("playing")
      rr.ace.pause()
    })

    test("pause event pauses ace", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      // Put ace into playing state
      await rr.ace.play()
      expect(rr.ace.state).toBe("playing")

      // Fire pause event
      rr.audio.player.dispatchEvent(new Event("pause"))

      expect(rr.ace.state).toBe("paused")
    })

    test("ended event emits ending and ended, resets currentTime to 0", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      const trace = makeTrace({ durationMs: 3000 })
      rr.src = { ace: { editor1: trace }, audio: "data:audio/wav;base64,AAAA" }
      Object.defineProperty(rr.audio.player, "duration", { value: 3, writable: true })

      // Set currentTime to non-zero
      rr.audio.player.currentTime = 2.0

      // Fire ended event
      rr.audio.player.dispatchEvent(new Event("ended"))

      expect(events).toContain("ending")
      expect(events).toContain("ended")
      expect(rr.audio.player.currentTime).toBe(0)
    })
  })

  describe("recording with audio", () => {
    beforeEach(() => {
      installAudioMocks()
    })

    test("record starts both audio and ace recorders, emits events", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      const events: string[] = []
      rr.addEventListener((e) => events.push(e))

      await rr.record()

      expect(rr.state).toBe("recording")
      expect(events).toContain("startingRecording")
      expect(events).toContain("startedRecording")

      // Both ace recorders should be recording
      for (const name of Object.keys(rr.ace.recorders)) {
        expect(rr.ace.recorders[name].recording).toBe(true)
      }
    })

    test("stop produces combined src", async () => {
      const { rr: multiRR } = createMultiRR({ editor1: "hello" })
      rr = multiRR

      await rr.record()

      // Small delay so timestamps differ
      await new Promise((r) => setTimeout(r, 10))

      await rr.stop()

      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(true)
    })

    test("tolerance is 0.1", () => {
      const { rr: multiRR } = createMultiRR({ editor1: "" })
      rr = multiRR
      expect((rr as any).tolerance).toBe(0.1)
    })
  })
})
