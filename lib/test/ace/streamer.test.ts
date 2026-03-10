import { Complete } from "@cs124/ace-recorder-types"
import { describe, expect, test } from "bun:test"
import AceStreamer from "../../src/ace/Streamer"
import { createMockEditor } from "../fixtures/ace-mock"

describe("AceStreamer", () => {
  test("start emits Complete record with reason='start'", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))

    expect(records).toHaveLength(1)
    expect(Complete.guard(records[0])).toBe(true)
    expect(records[0].reason).toBe("start")
    expect(records[0].value).toBe("hello")

    streamer.stop()
  })

  test("stop emits Complete record with reason='end'", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    const lastRecord = records[records.length - 1]
    expect(Complete.guard(lastRecord)).toBe(true)
    expect(lastRecord.reason).toBe("end")
  })

  test("stop throws when not running", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)

    expect(() => streamer.stop()).toThrow("Not running")
  })

  test("running property reflects state", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)

    expect(streamer.running).toBe(false)
    streamer.start(() => {})
    expect(streamer.running).toBe(true)
    streamer.stop()
    expect(streamer.running).toBe(false)
  })

  test("start and stop produce at least 2 records", () => {
    const editor = createMockEditor("code")
    const streamer = new AceStreamer(editor as any)
    const records: any[] = []

    streamer.start((record) => records.push(record))
    streamer.stop()

    expect(records.length).toBeGreaterThanOrEqual(2)
    expect(records[0].reason).toBe("start")
    expect(records[records.length - 1].reason).toBe("end")
  })

  test("sessionName can be set", () => {
    const editor = createMockEditor("hello")
    const streamer = new AceStreamer(editor as any)
    streamer.sessionName = "main"

    const records: any[] = []
    streamer.start((record) => records.push(record))

    expect(records[0].sessionName).toBe("main")
    streamer.stop()
  })
})
