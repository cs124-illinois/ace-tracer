import { AceTrace, Complete } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AcePlayer from "../../src/ace/Player"
import { createMockEditor } from "../fixtures/ace-mock"
import { makeClickTrackTrace, makeComplete, makeTrace } from "../fixtures/traces"

function createPlayer(value = "hello world") {
  const editor = createMockEditor(value)
  const player = new AcePlayer(editor as any)
  return { editor, player }
}

const BASE_DATE = new Date("2025-01-15T10:00:00.000Z")

describe("AcePlayer", () => {
  describe("trace index building", () => {
    test("builds completeIndices array with indices of Complete records", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      const completeIndices = (player as any).completeIndices
      const traceTimes = (player as any).traceTimes

      // completeIndices should contain indices where Complete records are
      expect(completeIndices.length).toBeGreaterThan(0)
      for (const idx of completeIndices) {
        expect(traceTimes[idx].complete).toBe(true)
      }

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

    test("completeIndices are sorted and match Complete records", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 5000, records: 11 })
      player.src = trace

      const completeIndices = (player as any).completeIndices as number[]

      // Should be sorted
      for (let i = 1; i < completeIndices.length; i++) {
        expect(completeIndices[i]).toBeGreaterThan(completeIndices[i - 1])
      }

      // Each should point to a Complete record
      for (const idx of completeIndices) {
        expect(Complete.guard(trace.records[idx])).toBe(true)
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

    test("seek between two Complete records lands on earlier one", () => {
      const { player } = createPlayer()
      // Complete at 0ms (idx 0), Delta at 1000ms (idx 1), Complete at 2000ms (idx 2)
      const trace = makeTrace({ durationMs: 2000, records: 3 })
      player.src = trace

      // Seek to 1.5s — between Complete at 0s and Complete at 2s
      player.currentTime = 1.5
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(0) // Should be the first Complete
    })

    test("seek to exact Complete timestamp lands on that Complete", () => {
      const { player } = createPlayer()
      // Records at 0, 1000, 2000, 3000, 4000ms
      const trace = makeTrace({ durationMs: 4000, records: 5 })
      player.src = trace

      // Complete records are at indices 0, 2, 4 (even indices)
      // Record at index 2 is at 2000ms = 2s
      player.currentTime = 2.0
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(2)
      expect(Complete.guard(trace.records[currentIndex])).toBe(true)
    })

    test("trace with Complete at exactly 0ms offset", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 3000, records: 7 })
      player.src = trace

      // First Complete is at 0ms
      player.currentTime = 0
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(0)
      expect(Complete.guard(trace.records[0])).toBe(true)
    })

    test("trace with single Complete record", () => {
      const { player } = createPlayer()
      const trace = makeTrace({ durationMs: 0, records: 1 })
      player.src = trace

      player.currentTime = 0
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(0)
    })

    test("trace with large gap between Completes", () => {
      const { player } = createPlayer()
      // Complete at 0s and 30s with nothing between
      const records = [
        makeComplete({ timestamp: BASE_DATE, reason: "start" }),
        makeComplete({ timestamp: new Date(BASE_DATE.valueOf() + 30000), reason: "end" }),
      ]
      const trace = new AceTrace(records, [{ name: "main", contents: "hello world", mode: "text" }], "main")
      player.src = trace

      // Seek to 15s (midway through gap)
      player.currentTime = 15
      const currentIndex = (player as any).currentIndex
      expect(currentIndex).toBe(0) // Should land on first Complete

      // Seek to 30s
      player.currentTime = 30
      const currentIndex2 = (player as any).currentIndex
      expect(currentIndex2).toBe(1) // Should land on second Complete
    })

    test("trace with no gap between Completes (adjacent seconds)", () => {
      const { player } = createPlayer()
      const records = [
        makeComplete({ timestamp: BASE_DATE, reason: "start" }),
        makeComplete({ timestamp: new Date(BASE_DATE.valueOf() + 1000), reason: "timer" }),
        makeComplete({ timestamp: new Date(BASE_DATE.valueOf() + 2000), reason: "end" }),
      ]
      const trace = new AceTrace(records, [{ name: "main", contents: "hello world", mode: "text" }], "main")
      player.src = trace

      player.currentTime = 0
      expect((player as any).currentIndex).toBe(0)

      player.currentTime = 1
      expect((player as any).currentIndex).toBe(1)

      player.currentTime = 2
      expect((player as any).currentIndex).toBe(2)
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
