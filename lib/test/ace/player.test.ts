import { describe, expect, jest, test } from "bun:test"
import { AceRecord, AceTrace, Complete } from "@cs124/ace-recorder-types"
import AcePlayer from "../../src/ace/Player"
import { createMockEditor } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"
import {
  at,
  makeComplete,
  makeCursorChange,
  makeDelta,
  makeScrollChange,
  makeSelectionChange,
  makeTrace,
} from "../fixtures/traces"

const MODE = "ace/mode/text"
const loc = (row: number, column: number) => ({ row, column })
const caret = (row: number, column: number) => ({ start: loc(row, column), end: loc(row, column) })

function createPlayer(value = "hello world", options?: AcePlayer.Options) {
  const editor = createMockEditor(value)
  const player = new AcePlayer(editor as any, options)
  return { editor, player }
}

// Typing "abc": "a" at 0s, "b" at 1s, "c" at 2s, end at 3s. Like a real recording, the trace-level sessionInfo holds
// the contents when recording stopped, so loading the trace shows "abc" until a sync applies earlier records.
function typingTrace() {
  return new AceTrace(
    [
      makeComplete({ timestamp: at(0), value: "a", cursor: loc(0, 1), selection: caret(0, 1) }),
      makeDelta({ timestamp: at(1000), start: loc(0, 1), end: loc(0, 2), lines: ["b"] }),
      makeDelta({ timestamp: at(2000), start: loc(0, 2), end: loc(0, 3), lines: ["c"] }),
      makeComplete({ timestamp: at(3000), reason: "end", value: "abc", cursor: loc(0, 3), selection: caret(0, 3) }),
    ],
    [{ name: "main", contents: "abc", mode: MODE }],
    "main",
  )
}

const seek = (player: AcePlayer, seconds: number) => {
  player.currentTime = seconds
  player.sync()
}

describe("AcePlayer", () => {
  useFakeTimers()

  describe("trace index building", () => {
    test("completeIndices point at exactly the Complete records, in order", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      const expected = trace.records.flatMap((record, i) => (Complete.guard(record) ? [i] : []))
      expect((player as any).completeIndices).toEqual(expected)
      expect(expected).toEqual([0, 2, 4, 6, 8, 10])
    })

    test("traceTimes has each record's offset and complete flag", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 4000, records: 5 })

      expect((player as any).traceTimes).toEqual([
        { complete: true, offset: 0 },
        { complete: false, offset: 1000 },
        { complete: true, offset: 2000 },
        { complete: false, offset: 3000 },
        { complete: true, offset: 4000 },
      ])
    })

    test("clearing src sets trace to undefined", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 2000 })
      expect(player.src).toBeDefined()
      player.src = undefined
      expect(player.src).toBeUndefined()
    })

    test("loading a trace switches the editor to its session with the trace-level contents", () => {
      const { editor, player } = createPlayer("before")
      player.src = typingTrace()

      expect(player.sessionName).toBe("main")
      expect(editor.getValue()).toBe("abc")
      expect(player.getSessionsInfo()).toEqual([{ name: "main", contents: "abc", mode: MODE }])
    })
  })

  describe("seeking via currentTime setter", () => {
    test("seek to time=0 lands on the first record", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      player.currentTime = 0
      expect((player as any).currentIndex).toBe(0)
      expect(player.currentTime).toBe(0)
    })

    test("seek to time=duration lands on the last Complete", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace
      player.currentTime = 5
      expect((player as any).currentIndex).toBe(10)
      expect(player.currentTime).toBe(5)
    })

    test("seek to time slightly past duration (within 0.1s) does not throw", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      expect(() => {
        player.currentTime = 5.05
      }).not.toThrow()
    })

    test("seek to negative time throws", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      expect(() => {
        player.currentTime = -1
      }).toThrow("Bad timestamp")
    })

    test("seek way past duration throws", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      expect(() => {
        player.currentTime = 100
      }).toThrow("Bad timestamp")
    })

    test("seek between two Complete records lands on the earlier one", () => {
      const { player } = createPlayer()
      // Complete at 0ms (idx 0), Delta at 1000ms (idx 1), Complete at 2000ms (idx 2)
      player.src = makeTrace({ durationMs: 2000, records: 3 })
      player.currentTime = 1.5
      expect((player as any).currentIndex).toBe(0)
    })

    test("seek to an exact Complete timestamp lands on that Complete", () => {
      const { player } = createPlayer()
      // Complete records are at indices 0, 2, 4 (0ms, 2000ms, 4000ms)
      player.src = makeTrace({ durationMs: 4000, records: 5 })
      player.currentTime = 2.0
      expect((player as any).currentIndex).toBe(2)
    })

    test("trace with a single Complete record", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 0, records: 1 })
      player.currentTime = 0
      expect((player as any).currentIndex).toBe(0)
    })

    test("large and small gaps between Completes", () => {
      const { player } = createPlayer()
      const records = [
        makeComplete({ timestamp: at(0), reason: "start" }),
        makeComplete({ timestamp: at(1000), reason: "timer" }),
        makeComplete({ timestamp: at(30000), reason: "end" }),
      ]
      player.src = new AceTrace(records, [{ name: "main", contents: "hello world", mode: MODE }], "main")

      for (const [seconds, index] of [
        [0, 0],
        [0.999, 0],
        [1, 1],
        [15, 1],
        [30, 2],
      ]) {
        player.currentTime = seconds
        expect((player as any).currentIndex).toBe(index)
      }
    })
  })

  describe("sync()", () => {
    test("applies records from the last Complete up to currentTime", () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()
      expect(editor.getValue()).toBe("abc")

      seek(player, 1.5)
      expect(editor.getValue()).toBe("ab")

      seek(player, 0)
      expect(editor.getValue()).toBe("a")

      seek(player, 2)
      expect(editor.getValue()).toBe("abc")
    })

    test("applies the Complete's cursor and selection", () => {
      const { editor, player } = createPlayer()
      const trace = new AceTrace(
        [
          makeComplete({
            timestamp: at(0),
            value: "hello",
            cursor: loc(0, 4),
            selection: { start: loc(0, 1), end: loc(0, 4) },
          }),
          makeComplete({ timestamp: at(1000), value: "hello", reason: "end" }),
        ],
        [{ name: "main", contents: "hello", mode: MODE }],
        "main",
      )
      player.src = trace

      seek(player, 0)
      expect(editor.session.selection.getRange()).toEqual({ start: loc(0, 1), end: loc(0, 4) })
      expect(editor.session.selection.getCursor()).toEqual(loc(0, 4))
    })

    test("emits a record event for each applied record, in order", () => {
      const { player } = createPlayer()
      const trace = typingTrace()
      player.src = trace
      const emitted: AceRecord[] = []
      player.on("record", (record) => emitted.push(record))

      seek(player, 2.5)

      expect(emitted).toEqual(trace.records.slice(0, 3))
    })

    test("throws when no trace loaded", () => {
      const { player } = createPlayer()
      expect(() => player.sync()).toThrow("Can't sync without trace")
    })

    test("filterRecord skips records it rejects", () => {
      const seen: AceRecord[] = []
      const { editor, player } = createPlayer("", {
        filterRecord: (record) => {
          seen.push(record)
          return record.type !== "delta"
        },
      })
      const trace = typingTrace()
      player.src = trace
      const emitted: AceRecord[] = []
      player.on("record", (record) => emitted.push(record))

      seek(player, 2.5)

      expect(seen).toEqual(trace.records.slice(0, 3))
      expect(emitted).toEqual([trace.records[0]])
      // Only the Complete was applied, so neither delta reached the editor
      expect(editor.getValue()).toBe("a")
    })
  })

  describe("timer-driven playback", () => {
    test("applies records as time passes, emitting each once", async () => {
      const { editor, player } = createPlayer()
      const trace = typingTrace()
      player.src = trace
      const emitted: AceRecord[] = []
      player.on("record", (record) => emitted.push(record))

      await player.play()
      expect(player.playing).toBe(true)
      expect(editor.getValue()).toBe("a")
      expect(emitted).toEqual([trace.records[0]])

      jest.advanceTimersByTime(999)
      expect(editor.getValue()).toBe("a")
      jest.advanceTimersByTime(1)
      expect(editor.getValue()).toBe("ab")
      jest.advanceTimersByTime(1000)
      expect(editor.getValue()).toBe("abc")
      expect(emitted).toEqual(trace.records.slice(0, 3))
    })

    test("currentTime advances with the clock while playing", async () => {
      const { player } = createPlayer()
      player.src = typingTrace()

      await player.play()
      jest.advanceTimersByTime(1500)
      expect(player.currentTime).toBe(1.5)
      jest.advanceTimersByTime(250)
      expect(player.currentTime).toBe(1.75)
    })

    test("emits ended at the last record and stops at the end", async () => {
      const { player } = createPlayer()
      player.src = typingTrace()
      let ended = 0
      player.on("ended", () => ended++)

      await player.play()
      jest.advanceTimersByTime(2999)
      expect(ended).toBe(0)
      expect(player.playing).toBe(true)

      jest.advanceTimersByTime(1)
      expect(ended).toBe(1)
      expect(player.playing).toBe(false)
      expect(player.currentTime).toBe(3)
      expect(jest.getTimerCount()).toBe(0)

      jest.advanceTimersByTime(5000)
      expect(player.currentTime).toBe(3)
      expect(ended).toBe(1)
    })

    test("playing again after the end restarts from the beginning", async () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()
      await player.play()
      jest.advanceTimersByTime(3000)
      expect(player.playing).toBe(false)

      await player.play()
      expect(player.currentTime).toBe(0)
      expect(editor.getValue()).toBe("a")
      jest.advanceTimersByTime(1000)
      expect(editor.getValue()).toBe("ab")
    })

    test("pause() keeps the position, and paused time doesn't count", async () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()

      await player.play()
      jest.advanceTimersByTime(1000)
      player.pause()
      expect(player.playing).toBe(false)
      expect(player.currentTime).toBe(1)

      jest.advanceTimersByTime(5000)
      expect(player.currentTime).toBe(1)
      expect(editor.getValue()).toBe("ab")

      await player.play()
      expect(player.currentTime).toBe(1)
      expect(editor.getValue()).toBe("ab")
      jest.advanceTimersByTime(500)
      player.pause()
      expect(player.currentTime).toBe(1.5)

      await player.play()
      jest.advanceTimersByTime(500)
      expect(editor.getValue()).toBe("abc")
      expect(player.currentTime).toBe(2)
    })

    test("setting currentTime while playing reschedules from the new position", async () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()
      let ended = 0
      player.on("ended", () => ended++)

      await player.play()
      player.currentTime = 2.5
      // Records up to 2.5s are applied immediately, not when the old 1s timer fires
      expect(editor.getValue()).toBe("abc")
      expect(player.currentTime).toBe(2.5)

      jest.advanceTimersByTime(499)
      expect(ended).toBe(0)
      jest.advanceTimersByTime(1)
      expect(ended).toBe(1)
    })

    test("seeking backward while playing replays from the earlier Complete", async () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()

      await player.play()
      jest.advanceTimersByTime(2000)
      expect(editor.getValue()).toBe("abc")

      player.currentTime = 0.5
      expect(editor.getValue()).toBe("a")
      jest.advanceTimersByTime(500)
      expect(editor.getValue()).toBe("ab")
    })

    test("changing playbackRate mid-play keeps the position and speeds up later records", async () => {
      const { editor, player } = createPlayer()
      player.src = typingTrace()
      let ended = 0
      player.on("ended", () => ended++)

      await player.play()
      jest.advanceTimersByTime(1000)
      expect(editor.getValue()).toBe("ab")

      player.playbackRate = 2
      expect(player.playing).toBe(true)
      expect(player.playbackRate).toBe(2)
      expect(player.currentTime).toBe(1)
      expect(editor.getValue()).toBe("ab")

      // The delta at 2s is 1s of trace time away: 500ms at 2x
      jest.advanceTimersByTime(499)
      expect(editor.getValue()).toBe("ab")
      jest.advanceTimersByTime(1)
      expect(editor.getValue()).toBe("abc")
      expect(player.currentTime).toBe(2)

      jest.advanceTimersByTime(500)
      expect(ended).toBe(1)
      expect(player.currentTime).toBe(3)
    })

    test("playing at 2x from the start finishes in half the time", async () => {
      const { player } = createPlayer()
      player.src = typingTrace()
      player.playbackRate = 2
      let ended = 0
      player.on("ended", () => ended++)

      await player.play()
      jest.advanceTimersByTime(1499)
      expect(ended).toBe(0)
      expect(player.currentTime).toBe(2.998)
      jest.advanceTimersByTime(1)
      expect(ended).toBe(1)
    })

    test("setting src stops playback and resets the position", async () => {
      const { player } = createPlayer()
      player.src = typingTrace()
      await player.play()
      jest.advanceTimersByTime(1500)

      player.src = typingTrace()
      expect(player.playing).toBe(false)
      expect(player.currentTime).toBe(0)

      // The old playback timer must not fire into the new trace
      const emitted: AceRecord[] = []
      player.on("record", (record) => emitted.push(record))
      jest.advanceTimersByTime(5000)
      expect(emitted).toEqual([])
    })

    test("setting src while paused resets the position", () => {
      const { player } = createPlayer()
      player.src = typingTrace()
      player.currentTime = 2

      player.src = typingTrace()
      expect(player.currentTime).toBe(0)
      expect((player as any).currentIndex).toBe(0)
    })
  })

  describe("cursor layer", () => {
    test("is shown during playback and restored to its previous state on pause", async () => {
      const editor = createMockEditor("")
      const cursorLayer = editor.renderer.$cursorLayer
      cursorLayer.isVisible = false
      cursorLayer.isBlinking = false
      cursorLayer.element.style.opacity = 0.5
      const player = new AcePlayer(editor as any)
      player.src = typingTrace()

      await player.play()
      expect(cursorLayer.isVisible).toBe(true)
      expect(cursorLayer.isBlinking).toBe(true)
      expect(cursorLayer.element.style.opacity).toBe(1)

      player.pause()
      expect(cursorLayer.isVisible).toBe(false)
      expect(cursorLayer.isBlinking).toBe(false)
      expect(cursorLayer.element.style.opacity).toBe(0.5)
    })

    test("is restored when playback ends", async () => {
      const editor = createMockEditor("")
      const cursorLayer = editor.renderer.$cursorLayer
      cursorLayer.isVisible = false
      cursorLayer.element.style.opacity = 0
      const player = new AcePlayer(editor as any)
      player.src = typingTrace()

      await player.play()
      jest.advanceTimersByTime(3000)
      expect(player.playing).toBe(false)
      expect(cursorLayer.isVisible).toBe(false)
      expect(cursorLayer.isBlinking).toBe(false)
      expect(cursorLayer.element.style.opacity).toBe(0)
    })

    test("pause(false) leaves the playback cursor showing", async () => {
      const editor = createMockEditor("")
      const cursorLayer = editor.renderer.$cursorLayer
      cursorLayer.isVisible = false
      const player = new AcePlayer(editor as any)
      player.src = typingTrace()

      await player.play()
      player.pause(false)
      expect(player.playing).toBe(false)
      expect(cursorLayer.isVisible).toBe(true)
      expect(cursorLayer.isBlinking).toBe(true)
    })
  })

  describe("scrolling", () => {
    // A Complete at scroll 40, a scroll caused by a cursor move to 80, a plain scroll to 120, then a cursor move,
    // a selection, and an edit
    function scrollTrace() {
      return new AceTrace(
        [
          makeComplete({ timestamp: at(0), value: "line", cursor: loc(0, 0), scroll: { top: 40, left: 0 } }),
          makeScrollChange({ timestamp: at(100), top: 80, triggeredByCursorChange: true }),
          makeScrollChange({ timestamp: at(200), top: 120, triggeredByCursorChange: false }),
          makeCursorChange({ timestamp: at(300), location: loc(0, 2) }),
          makeSelectionChange({ timestamp: at(400), start: loc(0, 0), end: loc(0, 3) }),
          makeDelta({ timestamp: at(500), start: loc(0, 4), end: loc(0, 5), lines: ["!"] }),
          makeComplete({ timestamp: at(600), reason: "end", value: "line!", scroll: { top: 120, left: 0 } }),
        ],
        [{ name: "main", contents: "line!", mode: MODE }],
        "main",
      )
    }

    test("by default, recorded scroll positions are applied", () => {
      const { editor, player } = createPlayer()
      player.src = scrollTrace()

      seek(player, 0)
      expect(editor.session.getScrollTop()).toBe(40)
      seek(player, 0.15)
      expect(editor.session.getScrollTop()).toBe(80)
      seek(player, 0.25)
      expect(editor.session.getScrollTop()).toBe(120)
      expect(editor.renderer.scrolledIntoView).toEqual([])
    })

    test("scrollToCursor skips cursor-driven and Complete scrolls and scrolls the cursor into view instead", () => {
      const { editor, player } = createPlayer()
      player.scrollToCursor = true
      const trace = scrollTrace()
      player.src = trace
      const emitted: AceRecord[] = []
      player.on("record", (record) => emitted.push(record))

      seek(player, 0.15)
      expect(editor.session.getScrollTop()).toBe(0)

      emitted.length = 0
      seek(player, 0.55)
      // Plain scrolls are still applied
      expect(editor.session.getScrollTop()).toBe(120)
      // The cursor-driven ScrollChange is neither applied nor emitted
      expect(emitted).toEqual([trace.records[0], ...trace.records.slice(2, 6)])
      // Once each for the cursor move, the selection (cursor at its end), and the edit (before the cursor)
      expect(editor.renderer.scrolledIntoView).toEqual([loc(0, 2), loc(0, 3), loc(0, 3)])
    })
  })

  describe("sessions", () => {
    // Starts in "main", switches to "other" (not in the trace-level sessionInfo) at 1s, and back to "main" at 2s
    function sessionTrace() {
      return new AceTrace(
        [
          makeComplete({
            timestamp: at(0),
            value: "main start",
            sessionName: "main",
            sessionInfo: [{ name: "main", contents: "main start", mode: MODE }],
          }),
          makeComplete({
            timestamp: at(1000),
            reason: "session",
            value: "other text",
            sessionName: "other",
            sessionInfo: [
              { name: "main", contents: "main mid", mode: MODE },
              { name: "other", contents: "other text", mode: "ace/mode/other" },
            ],
          }),
          makeComplete({
            timestamp: at(2000),
            reason: "end",
            value: "main end",
            sessionName: "main",
            sessionInfo: [
              { name: "main", contents: "main end", mode: MODE },
              { name: "other", contents: "other text", mode: "ace/mode/other" },
            ],
          }),
        ],
        [{ name: "main", contents: "main end", mode: MODE }],
        "main",
      )
    }

    test("sync() switches sessions, creating ones missing from the trace-level sessionInfo", () => {
      const { editor, player } = createPlayer()
      player.src = sessionTrace()
      const mainSession = editor.session
      expect(editor.getValue()).toBe("main end")
      expect(player.getSessionsInfo()).toEqual([{ name: "main", contents: "main end", mode: MODE }])

      seek(player, 0)
      expect(player.sessionName).toBe("main")
      expect(editor.getValue()).toBe("main start")

      seek(player, 1)
      expect(player.sessionName).toBe("other")
      expect(editor.session).not.toBe(mainSession)
      expect(editor.getValue()).toBe("other text")
      expect(player.getSessionsInfo()).toEqual([
        { name: "main", contents: "main start", mode: MODE },
        { name: "other", contents: "other text", mode: "ace/mode/other" },
      ])

      // Switching back updates the now-inactive main session from the Complete's sessionInfo
      seek(player, 2)
      expect(player.sessionName).toBe("main")
      expect(editor.session).toBe(mainSession)
      expect(editor.getValue()).toBe("main end")
    })

    test("seeking back to the start restores the starting session", () => {
      const { editor, player } = createPlayer()
      player.src = sessionTrace()

      seek(player, 1.5)
      expect(player.sessionName).toBe("other")

      seek(player, 0.5)
      expect(player.sessionName).toBe("main")
      expect(editor.getValue()).toBe("main start")
    })

    test("setSession throws for an unknown session", () => {
      const { player } = createPlayer()
      player.src = sessionTrace()
      expect(() => player.setSession("missing")).toThrow("Session missing does not exist")
    })
  })

  describe("duration getter", () => {
    test("returns trace duration in seconds", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      expect(player.duration).toBe(5)
    })

    test("returns 0 for single-record trace", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 0, records: 1 })
      expect(player.duration).toBe(0)
    })
  })

  describe("play and pause", () => {
    test("play throws without trace", async () => {
      const { player } = createPlayer()
      await expect(player.play()).rejects.toThrow("No trace loaded")
    })

    test("initial playback rate is 1", () => {
      const { player } = createPlayer()
      expect(player.playbackRate).toBe(1)
    })

    test("setting playback rate while paused doesn't start playback", () => {
      const { player } = createPlayer()
      player.src = typingTrace()
      player.playbackRate = 2
      expect(player.playbackRate).toBe(2)
      expect(player.playing).toBe(false)
    })
  })
})
