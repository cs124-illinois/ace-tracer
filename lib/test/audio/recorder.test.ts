import { beforeEach, describe, expect, test } from "bun:test"
import AudioRecorder from "../../src/audio/Recorder"
import { installAudioMocks } from "../fixtures/audio-mock"

describe("AudioRecorder", () => {
  beforeEach(() => {
    installAudioMocks()
  })

  test("starts and stops recording", async () => {
    const recorder = new AudioRecorder()
    await recorder.start()
    await recorder.stop()
    expect(recorder.blob).toBeDefined()
  })

  test("produces a blob on stop", async () => {
    const recorder = new AudioRecorder()
    await recorder.start()
    await recorder.stop()
    expect(recorder.blob).toBeInstanceOf(Blob)
  })

  test("src returns object URL after recording", async () => {
    const recorder = new AudioRecorder()
    await recorder.start()
    await recorder.stop()
    const src = recorder.src
    expect(src).toBeDefined()
    expect(typeof src).toBe("string")
  })

  test("src is undefined before recording", () => {
    const recorder = new AudioRecorder()
    expect(recorder.src).toBeUndefined()
  })
})
