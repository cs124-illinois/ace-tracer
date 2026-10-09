import { describe, expect, jest, spyOn, test } from "bun:test"
import AudioRecorder from "../../src/audio/Recorder"
import { installAudioMocks, MockMediaRecorder, useAudioMocks } from "../fixtures/audio-mock"
import { settle, useFakeTimers } from "../fixtures/timers"
import { wavDuration } from "../fixtures/wav-generator"
import { webmDuration, webmWithoutDuration } from "../fixtures/webm"

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

async function recordFor(recorder: AudioRecorder, ms: number) {
  await settle(recorder.start())
  jest.advanceTimersByTime(ms)
  await settle(recorder.stop())
}

describe("AudioRecorder", () => {
  useAudioMocks()
  useFakeTimers()

  test("has no recording before it starts", async () => {
    const recorder = new AudioRecorder()
    expect(recorder.src).toBeUndefined()
    expect(recorder.blob).toBeUndefined()
    await expect(recorder.stop()).rejects.toThrow("Not recording")
  })

  test("start() records from the microphone in one-second chunks", async () => {
    const recorder = new AudioRecorder()
    await settle(recorder.start())

    const [mediaRecorder] = MockMediaRecorder.instances
    expect(mediaRecorder.state).toBe("recording")
    expect(mediaRecorder.timeslice).toBe(1000)
    await settle(recorder.stop())
  })

  test("stop() produces the recording as a blob and an object URL", async () => {
    const recorder = new AudioRecorder()
    await recordFor(recorder, 2500)

    expect(recorder.blob!.type).toBe("audio/wav")
    expect(wavDuration(await bytes(recorder.blob!))).toBe(2.5)
    expect(recorder.src).toStartWith("blob:")
  })

  test("stop() releases the microphone", async () => {
    const recorder = new AudioRecorder()
    await recordFor(recorder, 100)

    const tracks = MockMediaRecorder.instances[0].stream.getTracks()
    expect(tracks.map((track) => track.readyState)).toEqual(["ended"])
  })

  test("WebM recordings get the duration MediaRecorder leaves out", async () => {
    installAudioMocks({ mimeType: "audio/webm" })
    expect(webmDuration(webmWithoutDuration())).toBe(Infinity)
    const recorder = new AudioRecorder()

    await recordFor(recorder, 2500)

    expect(recorder.blob!.type).toBe("audio/webm")
    // Timed from MediaRecorder's start event to its stop event, each a tick after the calls
    expect(webmDuration(await bytes(recorder.blob!))).toBeCloseTo(2.5, 2)
  })

  test("recording again replaces the recording and revokes the old URL", async () => {
    const recorder = new AudioRecorder()
    await recordFor(recorder, 1000)
    const firstSrc = recorder.src
    const revoke = spyOn(URL, "revokeObjectURL")

    await recordFor(recorder, 2000)

    expect(recorder.src).not.toBe(firstSrc)
    expect(revoke).toHaveBeenCalledWith(firstSrc!)
    expect(wavDuration(await bytes(recorder.blob!))).toBe(2)
    revoke.mockRestore()
  })

  test("start() rejects when MediaRecorder reports an error", async () => {
    installAudioMocks({ failStart: true })
    const recorder = new AudioRecorder()
    await expect(settle(recorder.start())).rejects.toThrow("MediaRecorder failed to start")
  })

  // start() only stops the microphone's tracks in stop(), so a recording that fails to start leaves the mic on
  test("start() releases the microphone when recording fails to start", async () => {
    installAudioMocks({ failStart: true })
    const recorder = new AudioRecorder()
    await settle(recorder.start()).catch(() => {})

    const tracks = MockMediaRecorder.instances[0].stream.getTracks()
    expect(tracks.map((track) => track.readyState)).toEqual(["ended"])
  })

  test("stop() rejects when the recording can't be finished", async () => {
    // An empty MIME type can't be parsed, so the recording can't be finished
    installAudioMocks({ mimeType: "" })
    const recorder = new AudioRecorder()
    await settle(recorder.start())

    await expect(settle(recorder.stop())).rejects.toThrow()
    expect(recorder.src).toBeUndefined()
  })
})
