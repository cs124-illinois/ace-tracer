/**
 * Audio-Editor Synchronization Integration Test
 *
 * Records editor changes and audio together through RecordReplayer, using the mock MediaRecorder (which produces
 * real WAV or WebM bytes as long as the recording) and fake timers (so every offset is exact). Then replays the
 * recording through the mock <audio>, which reads its duration from those bytes, checking the editor against the
 * recorded timeline at each point.
 */

import { describe, expect, jest, test } from "bun:test"
import { AceTrace, Complete, Delta } from "@cs124/ace-recorder-types"
import RecordReplayer from "../src/RecordReplayer"
import { createMockEditor, MockEditor } from "./fixtures/ace-mock"
import { installAudioMocks, MockAudioElement, useAudioMocks } from "./fixtures/audio-mock"
import { settle, useFakeTimers } from "./fixtures/timers"

const player = (rr: RecordReplayer) => rr.audio.player as unknown as MockAudioElement

// Records one character typed at each of the given offsets, stopping stopMs after the start
async function recordTyping(initial: string, offsetsMs: number[], chars: string, stopMs: number) {
  const editor = createMockEditor(initial)
  const rr = new RecordReplayer(editor as any, { recorderOptions: { completeInterval: 0 } })
  await settle(rr.record())
  let elapsed = 0
  offsetsMs.forEach((offset, i) => {
    jest.advanceTimersByTime(offset - elapsed)
    elapsed = offset
    const column = initial.length + i
    editor.simulateChange({
      action: "insert",
      start: { row: 0, column },
      end: { row: 0, column: column + 1 },
      lines: [chars[i]],
    })
  })
  jest.advanceTimersByTime(stopMs - elapsed)
  await settle(rr.stop())
  return { editor, rr }
}

const deltaOffsets = (trace: AceTrace) =>
  trace.records
    .filter((r) => Delta.guard(r))
    .map((r) => new Date(r.timestamp).valueOf() - new Date(trace.startTime).valueOf())

// The editor value at offsetMs according to the recording: the initial text plus every character typed by then
const expectedAt = (initial: string, offsetsMs: number[], chars: string, offsetMs: number) =>
  initial + chars.slice(0, offsetsMs.filter((offset) => offset <= offsetMs).length)

// Plays ms of wall time, advancing the media clock in whole milliseconds along with the fake clock
function playFor(rr: RecordReplayer, ms: number, stepMs: number, each?: () => void) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    jest.advanceTimersByTime(stepMs)
    if (!player(rr).paused) {
      player(rr).advanceTo((Math.round(player(rr).currentTime * 1000) + stepMs * player(rr).playbackRate) / 1000)
    }
    each?.()
  }
}

const seek = (rr: RecordReplayer, editor: MockEditor, seconds: number) => {
  rr.currentTime = seconds
  return editor.getValue()
}

describe("Audio-Editor sync integration", () => {
  useAudioMocks()
  useFakeTimers()

  test("recording produces audio and an Ace trace of the same length", async () => {
    const { rr } = await recordTyping("line0", [100, 200, 300], "abc", 350)

    const trace = rr.src!.ace!
    expect(trace.records.map((r) => r.type)).toEqual(["complete", "delta", "delta", "delta", "complete"])
    expect((trace.records[0] as Complete).reason).toBe("start")
    expect((trace.records[4] as Complete).reason).toBe("end")
    expect(deltaOffsets(trace)).toEqual([100, 200, 300])
    expect(trace.duration).toBe(350)
    expect(rr.duration).toBe(0.35)
  })

  test("seeking shows the editor as it was at that point in the recording", async () => {
    const offsets = [100, 250, 400]
    const { editor, rr } = await recordTyping("", offsets, "XYZ", 450)
    // Loading the recording leaves the editor showing the final text
    expect(editor.getValue()).toBe("XYZ")

    for (const ms of [0, 99, 100, 249, 250, 399, 400, 450, 120, 0]) {
      expect(seek(rr, editor, ms / 1000)).toBe(expectedAt("", offsets, "XYZ", ms))
    }
  })

  test("continuous playback applies each edit as the audio reaches it", async () => {
    const offsets = [80, 160, 240, 320]
    const { editor, rr } = await recordTyping("", offsets, "ABCD", 370)
    rr.currentTime = 0
    const seen: string[] = []

    await rr.play()
    playFor(rr, 360, 20, () => {
      const ms = Math.round(rr.currentTime * 1000)
      expect(editor.getValue()).toBe(expectedAt("", offsets, "ABCD", ms))
      seen.push(editor.getValue())
    })

    expect([...new Set(seen)]).toEqual(["", "A", "AB", "ABC", "ABCD"])
    expect(rr.state).toBe("playing")

    // At the end the audio ends and playback rewinds
    playFor(rr, 20, 20)
    expect(rr.state).toBe("paused")
    expect(rr.currentTime).toBe(0)
    expect(editor.getValue()).toBe("")
  })

  test("playback at double speed reaches each edit in half the time", async () => {
    const offsets = [80, 160, 240, 320]
    const { editor, rr } = await recordTyping("", offsets, "ABCD", 400)
    rr.currentTime = 0
    rr.playbackRate = 2

    await rr.play()
    playFor(rr, 80, 20)
    expect(rr.currentTime).toBe(0.16)
    expect(editor.getValue()).toBe("AB")

    playFor(rr, 80, 20)
    expect(editor.getValue()).toBe("ABCD")
  })

  test("click track: edits at regular intervals replay at the same intervals", async () => {
    const clicks = [80, 160, 240, 320, 400]
    const { editor, rr } = await recordTyping("", clicks, "ABCDE", 450)

    expect(deltaOffsets(rr.src!.ace!)).toEqual(clicks)
    clicks.forEach((click, i) => {
      expect(seek(rr, editor, (click + 5) / 1000)).toBe("ABCDE".slice(0, i + 1))
      expect(seek(rr, editor, (click - 5) / 1000)).toBe("ABCDE".slice(0, i))
    })
    expect(seek(rr, editor, 0)).toBe("")
    expect(seek(rr, editor, 0.45)).toBe("ABCDE")
  })

  test("a WebM recording gets its duration patched in, so it matches the trace", async () => {
    // Without fix-webm-duration the browser reports an infinite duration for MediaRecorder WebM files
    installAudioMocks({ mimeType: "audio/webm" })
    const { editor, rr } = await recordTyping("", [100], "A", 300)

    expect(rr.audio.recorder.blob!.type).toBe("audio/webm")
    expect(rr.ace.duration).toBe(0.3)
    // AudioRecorder times the recording itself, ending when MediaRecorder's stop event arrives, a tick after Ace stops
    expect(rr.duration).toBeCloseTo(0.3, 2)
    expect(seek(rr, editor, 0.05)).toBe("")
    expect(seek(rr, editor, 0.15)).toBe("A")
  })
})
