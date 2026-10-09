import { describe, expect, jest, test } from "bun:test"
import { IRecordReplayer } from "@cs124/ace-recorder-types"
import AudioRecordReplayer from "../../src/audio/RecordReplayer"
import { installAudioMocks, loadedMetadata, MockAudioElement, useAudioMocks } from "../fixtures/audio-mock"
import { settle, useFakeTimers } from "../fixtures/timers"
import { silentWavUrl } from "../fixtures/wav-generator"

const player = (rr: AudioRecordReplayer) => rr.player as unknown as MockAudioElement

function listen(rr: AudioRecordReplayer) {
  const states: IRecordReplayer.State[] = []
  const events: IRecordReplayer.Event[] = []
  rr.addStateListener((state) => states.push(state))
  rr.addEventListener((event) => events.push(event))
  return { states, events }
}

async function loaded(durationMs = 4000) {
  const rr = new AudioRecordReplayer()
  rr.src = silentWavUrl(durationMs)
  await settle(loadedMetadata(player(rr)))
  return rr
}

async function recorded(ms: number) {
  const rr = new AudioRecordReplayer()
  await settle(rr.record())
  jest.advanceTimersByTime(ms)
  await settle(rr.stop())
  return rr
}

describe("AudioRecordReplayer", () => {
  useAudioMocks()
  useFakeTimers()

  describe("state machine", () => {
    test("starts paused with no recording", () => {
      const rr = new AudioRecordReplayer()
      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(false)
      expect(rr.playbackRate).toBe(1)
    })

    test("pause() and stop() reject in the wrong state", async () => {
      const rr = new AudioRecordReplayer()
      expect(() => rr.pause()).toThrow("Not playing")
      await expect(rr.stop()).rejects.toThrow("Not recording")
    })

    test("play() and record() reject while playing", async () => {
      const rr = await loaded()
      await rr.play()
      await expect(rr.play()).rejects.toThrow("Not paused")
      await expect(rr.record()).rejects.toThrow("Not paused")
    })

    test("play() rejects while recording", async () => {
      const rr = new AudioRecordReplayer()
      await settle(rr.record())
      await expect(rr.play()).rejects.toThrow("Not paused")
      await settle(rr.stop())
    })

    test("removed listeners are no longer called", async () => {
      const rr = await loaded()
      const states: IRecordReplayer.State[] = []
      const listener = (state: IRecordReplayer.State) => states.push(state)
      rr.addStateListener(listener)
      rr.removeStateListener(listener)
      const events: IRecordReplayer.Event[] = []
      const eventListener = (event: IRecordReplayer.Event) => events.push(event)
      rr.addEventListener(eventListener)
      rr.removeEventListener(eventListener)

      await rr.play()
      player(rr).advanceTo(4)

      expect(states).toEqual([])
      expect(events).toEqual([])
    })
  })

  describe("playback", () => {
    test("play() and pause() drive the audio element", async () => {
      const rr = await loaded()
      const { states } = listen(rr)

      await rr.play()
      expect(player(rr).paused).toBe(false)
      rr.pause()
      expect(player(rr).paused).toBe(true)

      expect(states).toEqual(["playing", "paused"])
    })

    test("reaching the end pauses and emits ended", async () => {
      const rr = await loaded()
      await rr.play()
      const { states, events } = listen(rr)

      player(rr).advanceTo(2)
      expect(states).toEqual([])
      player(rr).advanceTo(4)

      expect(states).toEqual(["paused"])
      expect(events).toEqual(["ended"])
      expect(rr.state).toBe("paused")
    })

    test("pauses and plays that don't come through the class update the state", async () => {
      const rr = await loaded()
      const { states } = listen(rr)

      await player(rr).play()
      expect(rr.state).toBe("playing")
      player(rr).pause()
      expect(rr.state).toBe("paused")

      expect(states).toEqual(["playing", "paused"])
    })

    test("currentTime and percent read and move the element's position", async () => {
      const rr = await loaded()

      rr.percent = 25
      expect(player(rr).currentTime).toBe(1)
      rr.currentTime = 3
      expect(rr.percent).toBe(75)
      expect(rr.duration).toBe(4)
    })

    test("playbackRate is applied when playing a newly loaded source", async () => {
      const rr = new AudioRecordReplayer()
      rr.playbackRate = 2
      expect(player(rr).playbackRate).toBe(2)

      rr.src = silentWavUrl(4000)
      await rr.play()

      expect(player(rr).playbackRate).toBe(2)
    })
  })

  describe("src", () => {
    test("setting src loads it and clears hasRecording", async () => {
      const rr = await recorded(1000)
      expect(rr.hasRecording).toBe(true)
      const url = silentWavUrl(2000)

      rr.src = url
      await settle(loadedMetadata(player(rr)))

      expect(rr.src).toBe(url)
      expect(rr.duration).toBe(2)
      expect(rr.hasRecording).toBe(false)
    })

    test("src can't be changed while playing", async () => {
      const rr = await loaded()
      await rr.play()
      expect(() => {
        rr.src = silentWavUrl(1000)
      }).toThrow("Can't change src while playing or recording")
    })

    test("src can't be read or changed while recording", async () => {
      const rr = new AudioRecordReplayer()
      await settle(rr.record())
      expect(() => rr.src).toThrow("Still recording")
      expect(() => {
        rr.src = silentWavUrl(1000)
      }).toThrow("Can't change src while playing or recording")
      await settle(rr.stop())
    })
  })

  describe("recording", () => {
    test("record() and stop() move through recording back to paused", async () => {
      const rr = new AudioRecordReplayer()
      const { states } = listen(rr)

      await settle(rr.record())
      expect(rr.state).toBe("recording")
      expect(rr.hasRecording).toBe(false)
      jest.advanceTimersByTime(2500)
      await settle(rr.stop())

      expect(states).toEqual(["recording", "paused"])
      expect(rr.hasRecording).toBe(true)
    })

    test("stop() loads the recording and waits for its duration", async () => {
      const rr = await recorded(2500)

      expect(rr.src).toBe(rr.recorder.src!)
      expect(rr.duration).toBe(2.5)
    })

    test("stop() doesn't wait for audio that fails to load", async () => {
      installAudioMocks({ mimeType: "audio/mp4" })
      const rr = new AudioRecordReplayer()
      await settle(rr.record())
      const stopping = Date.now()

      await settle(rr.stop())

      expect(Date.now() - stopping).toBeLessThan(AudioRecordReplayer.metadataTimeout)
      expect(rr.duration).toBeNaN()
      expect(rr.hasRecording).toBe(true)
    })

    test("stop() gives up waiting for metadata after metadataTimeout", async () => {
      const rr = new AudioRecordReplayer()
      await settle(rr.record())
      // Metadata never arrives
      player(rr).load = () => {}
      const stopping = Date.now()

      await settle(rr.stop(), { stepMs: 100 })

      expect(Date.now() - stopping).toBeGreaterThanOrEqual(AudioRecordReplayer.metadataTimeout)
      expect(rr.duration).toBeNaN()
      expect(rr.state).toBe("paused")
    })

    test("stop() returns to paused when the recording can't be finished", async () => {
      installAudioMocks({ mimeType: "" })
      const rr = new AudioRecordReplayer()
      await settle(rr.record())

      await expect(settle(rr.stop())).rejects.toThrow()

      expect(rr.state).toBe("paused")
      expect(rr.hasRecording).toBe(false)
    })

    test("record() stays paused when the recording can't start", async () => {
      installAudioMocks({ failStart: true })
      const rr = new AudioRecordReplayer()

      await expect(settle(rr.record())).rejects.toThrow("MediaRecorder failed to start")

      expect(rr.state).toBe("paused")
    })

    test("recording again replaces the recording", async () => {
      const rr = await recorded(1000)
      const firstSrc = rr.src

      await settle(rr.record())
      jest.advanceTimersByTime(3000)
      await settle(rr.stop())

      expect(rr.src).not.toBe(firstSrc)
      expect(rr.duration).toBe(3)
    })
  })
})
