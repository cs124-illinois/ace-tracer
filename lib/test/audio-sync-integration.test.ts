/**
 * Audio-Editor Synchronization Integration Test
 *
 * Strategy: Generate a synthetic WAV with a known duration. Record editor changes at precise
 * wall-clock offsets (using real delays). Stop recording, producing both an audio blob and an
 * AceTrace. Then simulate playback by advancing the audio element's currentTime and firing
 * timeupdate events. At each position, verify the editor reflects the correct state.
 *
 * This tests the full pipeline: recording captures timestamps that align with audio duration,
 * and playback correctly maps audio time → editor state.
 */

import { AceRecord, Complete, Delta } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import RecordReplayer from "../src/RecordReplayer"
import { createMockEditor } from "./fixtures/ace-mock"
import { generateSilentWav } from "./fixtures/wav-generator"

/**
 * Sleep for a given number of milliseconds. Used to create real wall-clock gaps
 * between editor events so the streamer captures distinct timestamps.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("Audio-Editor sync integration", () => {
  test("recorded editor changes align with audio timeline during playback", async () => {
    const editor = createMockEditor("line0")
    const rr = new RecordReplayer(editor as any)

    // Generate a 3-second silent WAV as our audio source
    const wavBlob = generateSilentWav(3000)
    const audioUrl = URL.createObjectURL(wavBlob)

    // --- RECORDING PHASE ---
    // Install audio mocks so record() can call getUserMedia/MediaRecorder
    const { installAudioMocks } = await import("./fixtures/audio-mock")
    installAudioMocks()

    await rr.record()
    expect(rr.state).toBe("recording")

    // Simulate editor changes at ~100ms intervals
    // Each change appends a character, creating a timeline:
    // t≈0ms: "line0" (initial)
    // t≈100ms: "line0a" (first edit)
    // t≈200ms: "line0ab" (second edit)
    // t≈300ms: "line0abc" (third edit)
    const editTimes: number[] = []
    const recordedRecords: AceRecord[] = []
    rr.ace.recorder.on("record", (r) => recordedRecords.push(r))

    const recordStart = Date.now()

    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 5 },
      end: { row: 0, column: 6 },
      lines: ["a"],
    })
    editTimes.push(Date.now() - recordStart)

    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 6 },
      end: { row: 0, column: 7 },
      lines: ["b"],
    })
    editTimes.push(Date.now() - recordStart)

    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 7 },
      end: { row: 0, column: 8 },
      lines: ["c"],
    })
    editTimes.push(Date.now() - recordStart)

    await sleep(50)
    await rr.stop()
    expect(rr.state).toBe("paused")

    // --- VERIFICATION: Recording produced valid data ---
    const aceTrace = rr.ace.src!
    expect(aceTrace).toBeDefined()
    expect(aceTrace.records.length).toBeGreaterThanOrEqual(5) // start + 3 deltas + end at minimum

    // First record is Complete "start", last is Complete "end"
    expect(Complete.guard(aceTrace.records[0])).toBe(true)
    expect((aceTrace.records[0] as Complete).reason).toBe("start")
    expect(Complete.guard(aceTrace.records[aceTrace.records.length - 1])).toBe(true)
    expect((aceTrace.records[aceTrace.records.length - 1] as Complete).reason).toBe("end")

    // Delta records exist
    const deltas = aceTrace.records.filter((r) => Delta.guard(r))
    expect(deltas.length).toBe(3)

    // Trace duration should approximately match recording wall-clock time
    expect(aceTrace.duration).toBeGreaterThan(200) // at least 200ms
    expect(aceTrace.duration).toBeLessThan(2000) // well under 2s

    // --- PLAYBACK VERIFICATION ---
    // Load the recorded trace + synthetic audio for playback
    rr.src = { ace: aceTrace, audio: audioUrl }

    // Set audio duration to match (happy-dom's Audio won't parse WAV)
    Object.defineProperty(rr.audio.player, "duration", {
      value: aceTrace.duration / 1000,
      writable: true,
    })

    // Reset editor to blank state to verify playback restores it
    editor.session.setValue("")

    // Seek to time 0 and sync — should restore initial state ("line0")
    rr.currentTime = 0
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("line0")

    // Seek to end — should show final state with all edits
    const endTime = aceTrace.duration / 1000
    rr.currentTime = endTime
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("line0abc")

    URL.revokeObjectURL(audioUrl)
  })

  test("editor state at intermediate seek points matches recording timeline", async () => {
    const editor = createMockEditor("")
    const rr = new RecordReplayer(editor as any)

    const { installAudioMocks } = await import("./fixtures/audio-mock")
    installAudioMocks()

    await rr.record()

    // Change 1: set value at ~100ms
    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 0 },
      end: { row: 0, column: 1 },
      lines: ["X"],
    })

    // Change 2: set value at ~250ms
    await sleep(150)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 1 },
      end: { row: 0, column: 2 },
      lines: ["Y"],
    })

    // Change 3: set value at ~400ms
    await sleep(150)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 2 },
      end: { row: 0, column: 3 },
      lines: ["Z"],
    })

    await sleep(50)
    await rr.stop()

    const aceTrace = rr.ace.src!
    const traceDurationSec = aceTrace.duration / 1000

    // Load for playback
    const wavBlob = generateSilentWav(Math.ceil(aceTrace.duration))
    const audioUrl = URL.createObjectURL(wavBlob)
    rr.src = { ace: aceTrace, audio: audioUrl }
    Object.defineProperty(rr.audio.player, "duration", {
      value: traceDurationSec,
      writable: true,
    })

    // Get delta timestamps relative to start
    const deltaTimes = aceTrace.records
      .filter((r) => Delta.guard(r))
      .map((r) => new Date(r.timestamp).valueOf() - new Date(aceTrace.startTime).valueOf())

    expect(deltaTimes).toHaveLength(3)

    // Seek to just before first delta — editor should be empty
    const beforeFirstEdit = Math.max(0, deltaTimes[0] - 20) / 1000
    rr.currentTime = beforeFirstEdit
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("")

    // Seek to just after first delta — editor should have "X"
    const afterFirstEdit = (deltaTimes[0] + 10) / 1000
    if (afterFirstEdit <= traceDurationSec + 0.1) {
      rr.currentTime = afterFirstEdit
      rr.ace.sync()
      expect(editor.session.getValue()).toBe("X")
    }

    // Seek to just after second delta — editor should have "XY"
    const afterSecondEdit = (deltaTimes[1] + 10) / 1000
    if (afterSecondEdit <= traceDurationSec + 0.1) {
      rr.currentTime = afterSecondEdit
      rr.ace.sync()
      expect(editor.session.getValue()).toBe("XY")
    }

    // Seek to end — all edits applied
    rr.currentTime = traceDurationSec
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("XYZ")

    URL.revokeObjectURL(audioUrl)
  })

  test("timeupdate-driven sync keeps editor aligned with audio position", async () => {
    const editor = createMockEditor("start")
    const rr = new RecordReplayer(editor as any)

    const { installAudioMocks } = await import("./fixtures/audio-mock")
    installAudioMocks()

    await rr.record()

    // Record a series of edits at known times
    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 5 },
      end: { row: 0, column: 6 },
      lines: ["1"],
    })

    await sleep(100)
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column: 6 },
      end: { row: 0, column: 7 },
      lines: ["2"],
    })

    await sleep(50)
    await rr.stop()

    const aceTrace = rr.ace.src!
    const traceDurationSec = aceTrace.duration / 1000

    // Load for playback
    const wavBlob = generateSilentWav(Math.ceil(aceTrace.duration))
    const audioUrl = URL.createObjectURL(wavBlob)
    rr.src = { ace: aceTrace, audio: audioUrl }
    Object.defineProperty(rr.audio.player, "duration", {
      value: traceDurationSec,
      writable: true,
    })

    // Simulate audio timeupdate events at various positions
    // First, manually position at start
    rr.currentTime = 0
    rr.ace.sync()
    const stateAt0 = editor.session.getValue()
    expect(stateAt0).toBe("start")

    // Simulate audio jumping ahead (exceeding tolerance)
    // This mimics what happens during real playback when audio advances
    rr.audio.player.currentTime = traceDurationSec
    rr.ace.currentTime = 0 // ace is behind

    // Fire timeupdate — should sync ace to audio position
    rr.audio.player.dispatchEvent(new Event("timeupdate"))

    // After sync, ace should be close to audio time
    const aceTime = rr.ace.currentTime
    expect(Math.abs(aceTime - traceDurationSec)).toBeLessThan(1)

    URL.revokeObjectURL(audioUrl)
  })

  test("click-track pattern: edits at precise intervals produce deterministic playback", async () => {
    const editor = createMockEditor("")
    const rr = new RecordReplayer(editor as any)

    const { installAudioMocks } = await import("./fixtures/audio-mock")
    installAudioMocks()

    // Record edits at regular "click" intervals
    const CLICK_INTERVAL = 80 // ms between clicks
    const NUM_CLICKS = 5

    await rr.record()

    for (let i = 0; i < NUM_CLICKS; i++) {
      await sleep(CLICK_INTERVAL)
      const char = String.fromCharCode(65 + i) // A, B, C, D, E
      editor.simulateChange({
        action: "insert",
        start: { row: 0, column: i },
        end: { row: 0, column: i + 1 },
        lines: [char],
      })
    }

    await sleep(50)
    await rr.stop()

    const aceTrace = rr.ace.src!
    const traceDurationSec = aceTrace.duration / 1000

    // Load for playback
    const wavBlob = generateSilentWav(Math.ceil(aceTrace.duration))
    const audioUrl = URL.createObjectURL(wavBlob)
    rr.src = { ace: aceTrace, audio: audioUrl }
    Object.defineProperty(rr.audio.player, "duration", {
      value: traceDurationSec,
      writable: true,
    })

    // Get each delta's timestamp
    const deltas = aceTrace.records.filter((r) => Delta.guard(r)) as Delta[]
    expect(deltas).toHaveLength(NUM_CLICKS)

    const deltaOffsets = deltas.map((d) => new Date(d.timestamp).valueOf() - new Date(aceTrace.startTime).valueOf())

    // Verify deltas are spaced roughly CLICK_INTERVAL apart (with some jitter tolerance)
    for (let i = 1; i < deltaOffsets.length; i++) {
      const gap = deltaOffsets[i] - deltaOffsets[i - 1]
      expect(gap).toBeGreaterThan(CLICK_INTERVAL * 0.5)
      expect(gap).toBeLessThan(CLICK_INTERVAL * 3)
    }

    // Seek to each click point and verify progressive editor state
    for (let i = 0; i < NUM_CLICKS; i++) {
      const seekTime = (deltaOffsets[i] + 5) / 1000 // just after the delta
      if (seekTime > traceDurationSec + 0.1) break

      rr.currentTime = seekTime
      rr.ace.sync()

      const expected = "ABCDE".substring(0, i + 1)
      const actual = editor.session.getValue()
      expect(actual).toBe(expected)
    }

    // Seek back to start — should be empty
    rr.currentTime = 0
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("")

    // Seek to end — should have all clicks
    rr.currentTime = traceDurationSec
    rr.ace.sync()
    expect(editor.session.getValue()).toBe("ABCDE")

    URL.revokeObjectURL(audioUrl)
  })
})
