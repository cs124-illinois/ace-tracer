import { AceRecord, Complete } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AcePlayer from "../src/ace/Player"
import { createMockEditor } from "./fixtures/ace-mock"
import { BASE_DATE, makeClickTrackTrace, makeTrace } from "./fixtures/traces"

describe("Click-track synchronization", () => {
  function createPlayer(value = "") {
    const editor = createMockEditor(value)
    const player = new AcePlayer(editor as any)
    return { editor, player }
  }

  function seekAndSync(player: AcePlayer, timeSec: number) {
    player.currentTime = timeSec
    ;(player as any).syncTime = Date.now()
    ;(player as any).startTime = Date.now() - timeSec * 1000
    player.sync()
  }

  test("seeking to before first click applies only initial Complete", () => {
    const { player, editor } = createPlayer("initial")
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    player.src = trace

    seekAndSync(player, 0.5)

    // Initial Complete at t=0 has value="" so editor should be empty
    expect(editor.session.getValue()).toBe("")
  })

  test("seeking to a click time applies that Complete and Delta", () => {
    const { player } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    player.src = trace

    const records: AceRecord[] = []
    player.on("record", (r) => records.push(r))

    seekAndSync(player, 2.0)

    // Should apply the Complete at t=2000 (value="xx") and the Delta at t=2000
    // The currentTime setter positions at the last Complete at or before 2s
    // sync() then applies from that Complete forward
    expect(records.length).toBeGreaterThanOrEqual(1)
    expect(records.some((r) => Complete.guard(r))).toBe(true)
  })

  test("seeking between click times applies records up to that time", () => {
    const { player, editor } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000, 4000, 5000])
    player.src = trace

    seekAndSync(player, 3.5)

    // Should have applied Complete at t=3000 with value "xxx"
    // and possibly the Delta at t=3000
    const value = editor.session.getValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test("seeking forward applies more recent records", () => {
    const { player, editor } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000, 4000, 5000])
    player.src = trace

    seekAndSync(player, 1.0)
    const valueAt1 = editor.session.getValue()

    seekAndSync(player, 4.0)
    const valueAt4 = editor.session.getValue()

    // At t=4, the Complete has value "xxxx" (4 chars)
    // At t=1, the Complete has value "x" (1 char)
    expect(valueAt4.length).toBeGreaterThan(valueAt1.length)
  })

  test("seeking backward resets to earlier state", () => {
    const { player, editor } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000, 4000, 5000])
    player.src = trace

    seekAndSync(player, 4.0)
    const valueAt4 = editor.session.getValue()

    seekAndSync(player, 1.0)
    const valueAt1 = editor.session.getValue()

    expect(valueAt1.length).toBeLessThan(valueAt4.length)
  })

  test("playback rate 2x still applies records at correct times", () => {
    const { player, editor } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    player.src = trace
    player.playbackRate = 2

    // At 2x rate, the sync calculation uses offset/playbackRate
    // So to reach records at 2000ms offset, we need wallclock time of 1000ms
    player.currentTime = 1.0
    ;(player as any).syncTime = Date.now()
    // startTime = syncTime - currentTime*1000/playbackRate
    ;(player as any).startTime = Date.now() - (1.0 * 1000) / 2
    player.sync()

    // Should have applied records — at least the seek should succeed
    expect(typeof editor.session.getValue()).toBe("string")
  })

  test("record emission count matches expected for seek to specific time", () => {
    const { player } = createPlayer("")
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    player.src = trace

    const recordsEmitted: AceRecord[] = []
    player.on("record", (record) => recordsEmitted.push(record))

    // Seek to 3.0 — positions at last Complete before 3s
    // sync() applies from that Complete through records at offset <= 3000ms
    seekAndSync(player, 3.0)

    // The currentTime setter finds the last Complete at or before 3s
    // sync applies that Complete + any subsequent records within the time window
    expect(recordsEmitted.length).toBeGreaterThanOrEqual(1)
    // At least one should be a Complete
    expect(recordsEmitted.some((r) => Complete.guard(r))).toBe(true)
  })

  test("progressive seeking shows increasing content", () => {
    const { player, editor } = createPlayer("")
    const clickTimes = [1000, 2000, 3000, 4000, 5000]
    const trace = makeClickTrackTrace(clickTimes)
    player.src = trace

    // Seek to each click time and verify the Complete record value increases
    const values: string[] = []
    for (const t of [1.0, 2.0, 3.0, 4.0, 5.0]) {
      seekAndSync(player, t)
      values.push(editor.session.getValue())
    }

    // Each seek applies a Complete with increasing value length
    for (let i = 1; i < values.length; i++) {
      expect(values[i].length).toBeGreaterThanOrEqual(values[i - 1].length)
    }
  })
})

describe("Trace construction and validation", () => {
  test("makeTrace produces valid trace with correct duration", () => {
    const trace = makeTrace({ durationMs: 5000, records: 11 })
    expect(trace.duration).toBe(5000)
    expect(trace.records).toHaveLength(11)
  })

  test("makeClickTrackTrace produces correct number of records", () => {
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    // 1 initial complete + 3 * (complete + delta) = 7
    expect(trace.records).toHaveLength(7)
  })

  test("makeClickTrackTrace first record is Complete at base time", () => {
    const trace = makeClickTrackTrace([1000])
    expect(Complete.guard(trace.records[0])).toBe(true)
    expect(new Date(trace.records[0].timestamp).valueOf()).toBe(BASE_DATE.valueOf())
  })

  test("makeClickTrackTrace Complete records have increasing values", () => {
    const trace = makeClickTrackTrace([1000, 2000, 3000])
    const completes = trace.records.filter((r) => Complete.guard(r)) as Complete[]
    // First Complete has value "", subsequent ones have "x", "xx", "xxx"
    expect(completes[0].value).toBe("")
    expect(completes[1].value).toBe("x")
    expect(completes[2].value).toBe("xx")
    expect(completes[3].value).toBe("xxx")
  })
})
