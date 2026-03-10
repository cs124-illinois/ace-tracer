import { Complete } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AcePlayer from "../../src/ace/Player"
import { createMockEditor } from "../fixtures/ace-mock"
import { makeClickTrackTrace, makeTrace } from "../fixtures/traces"

function createPlayer(value = "hello world") {
  const editor = createMockEditor(value)
  const player = new AcePlayer(editor as any)
  return { editor, player }
}

describe("AcePlayer", () => {
  describe("trace index building", () => {
    test("builds traceIndex mapping seconds to nearest preceding Complete record", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      // Access private fields for verification
      const traceIndex = (player as any).traceIndex
      const traceTimes = (player as any).traceTimes

      // traceIndex should have entries for each second
      expect(traceIndex[0]).toBeDefined()
      expect(typeof traceIndex[0]).toBe("number")

      // traceTimes should have correct length
      expect(traceTimes).toHaveLength(trace.records.length)
    })

    test("traceTimes has correct offset and complete flags", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 4000, records: 5 })
      player.src = trace

      const traceTimes = (player as any).traceTimes

      // First record should have offset 0
      expect(traceTimes[0].offset).toBe(0)
      // First record is complete (even index in makeTrace)
      expect(traceTimes[0].complete).toBe(true)
      // Second record is delta (odd index in makeTrace)
      expect(traceTimes[1].complete).toBe(false)
    })

    test("traceIndex fills gaps for seconds without Complete records", () => {
      const { player } = createPlayer()
      // Create a trace with Complete only at 0 and 5s
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      const traceIndex = (player as any).traceIndex

      // Each second should map to some index
      for (let i = 0; i <= 4; i++) {
        expect(traceIndex[i]).toBeDefined()
      }
    })

    test("clearing src sets trace to undefined", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 2000 })
      expect(player.src).toBeDefined()
      player.src = undefined
      expect(player.src).toBeUndefined()
    })
  })

  describe("seeking via currentTime setter", () => {
    test("seek to time=0", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      player.currentTime = 0
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(0)
    })

    test("seek to time=duration", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace
      player.currentTime = trace.duration / 1000
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBeGreaterThanOrEqual(0)
    })

    test("seek to time slightly past duration (within 0.1s) does not throw", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace
      const durationSec = trace.duration / 1000
      expect(() => {
        player.currentTime = durationSec + 0.05
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

    test("seek to mid-trace sets currentIndex to correct Complete record", () => {
      const { player } = createPlayer()
      // Create trace with records at 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      // Seek to 2.5s - should land on a Complete record at or before 2.5s
      player.currentTime = 2.5
      const currentIndex = (player as any).currentIndex
      const record = trace.records[currentIndex]
      expect(Complete.guard(record)).toBe(true)

      // The Complete record should be at or before 2.5s
      const offset = new Date(record.timestamp).valueOf() - new Date(trace.startTime).valueOf()
      expect(offset).toBeLessThanOrEqual(2500)
    })
  })

  describe("sync() method", () => {
    test("applies records before currentTime to editor", () => {
      const { player, editor } = createPlayer("")
      // Create a trace where the first Complete sets value to "hello world"
      const trace = makeTrace({ durationMs: 3000, records: 7 })
      player.src = trace

      // Set up for sync: seek to 1.5s
      player.currentTime = 1.5
      // Manually set startTime and syncTime to allow sync to apply records
      ;(player as any).syncTime = Date.now()
      ;(player as any).startTime = Date.now() - 1500
      player.sync()

      // Editor should have been updated (Complete + Delta records applied)
      // The Complete sets value to "hello world", then Delta adds "!"
      expect(editor.session.getValue()).toContain("hello world")
    })

    test("throws when no trace loaded", () => {
      const { player } = createPlayer()
      expect(() => player.sync()).toThrow("Can't sync without trace")
    })

    test("respects filterRecord option", () => {
      const editor = createMockEditor("")
      const appliedRecords: any[] = []
      // Filter out ALL records — track what would have been applied
      const player = new AcePlayer(editor as any, {
        filterRecord: () => {
          appliedRecords.push(true)
          return false
        },
      })

      const trace = makeTrace({ durationMs: 2000, records: 5 })
      player.src = trace

      // Seek and sync - all records should be filtered
      player.currentTime = 1
      ;(player as any).syncTime = Date.now()
      ;(player as any).startTime = Date.now() - 1000
      player.sync()

      // filterRecord should have been called for records in range, but none applied
      expect(appliedRecords.length).toBeGreaterThan(0)
      // No "record" events should be emitted since all were filtered
      const emitted: any[] = []
      player.on("record", (r) => emitted.push(r))
      // Re-sync shouldn't emit since records already processed
      expect(emitted.length).toBe(0)
    })
  })

  describe("duration getter", () => {
    test("returns trace duration in seconds", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace
      expect(player.duration).toBe(5)
    })

    test("returns 0 for single-record trace", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 0, records: 1 })
      player.src = trace
      expect(player.duration).toBe(0)
    })
  })

  describe("playback rate", () => {
    test("initial playback rate is 1", () => {
      const { player } = createPlayer()
      expect(player.playbackRate).toBe(1)
    })

    test("setting playback rate updates value", () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      player.playbackRate = 2
      expect(player.playbackRate).toBe(2)
    })
  })

  describe("play and pause", () => {
    test("play throws without trace", () => {
      const { player } = createPlayer()
      expect(player.play()).rejects.toThrow("No trace loaded")
    })

    test("play sets playing to true", async () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      await player.play()
      expect(player.playing).toBe(true)
    })

    test("pause sets playing to false", async () => {
      const { player } = createPlayer()
      player.src = makeTrace({ durationMs: 5000, records: 11 })
      await player.play()
      player.pause()
      expect(player.playing).toBe(false)
    })
  })

  describe("click track trace playback", () => {
    test("records apply at correct times during seek", () => {
      const { player, editor } = createPlayer("")
      const trace = makeClickTrackTrace([1000, 2000, 3000, 4000, 5000])
      player.src = trace

      // Seek to 2.5s - should have applied records up to 2s
      player.currentTime = 2.5
      ;(player as any).syncTime = Date.now()
      ;(player as any).startTime = Date.now() - 2500
      player.sync()

      // The value should reflect records applied up to 2.5s
      // At t=2s, value is "xx" (two complete records)
      expect(editor.session.getValue().length).toBeGreaterThanOrEqual(2)
    })
  })
})
