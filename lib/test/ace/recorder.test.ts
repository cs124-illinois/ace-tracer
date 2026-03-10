import { Complete } from "@cs124/ace-recorder-types"
import { afterEach, describe, expect, test } from "bun:test"
import AceRecorder from "../../src/ace/Recorder"
import { createMockEditor } from "../fixtures/ace-mock"

describe("AceRecorder", () => {
  let recorder: AceRecorder | undefined

  afterEach(() => {
    if (recorder?.recording) {
      recorder.stop()
    }
    recorder = undefined
  })

  test("starts and stops recording", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    expect(recorder.recording).toBe(false)
    await recorder.start()
    expect(recorder.recording).toBe(true)
    await recorder.stop()
    expect(recorder.recording).toBe(false)
  })

  test("produces AceTrace on stop", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    await recorder.start()
    await recorder.stop()

    expect(recorder.src).toBeDefined()
    expect(recorder.src!.records.length).toBeGreaterThanOrEqual(2)
  })

  test("first and last records are Complete with start/end reasons", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    await recorder.start()
    await recorder.stop()

    const records = recorder.src!.records
    expect(Complete.guard(records[0])).toBe(true)
    expect((records[0] as any).reason).toBe("start")
    expect(Complete.guard(records[records.length - 1])).toBe(true)
    expect((records[records.length - 1] as any).reason).toBe("end")
  })

  test("stop throws when not recording", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    expect(() => recorder!.stop()).toThrow("Not recording")
  })

  test("addCompleteRecord throws when not recording", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    expect(() => recorder!.addCompleteRecord()).toThrow("Not recording")
  })

  test("addCompleteRecord adds manual Complete during recording", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    await recorder.start()
    recorder.addCompleteRecord("manual")
    await recorder.stop()

    const records = recorder.src!.records
    const manualRecords = records.filter((r) => Complete.guard(r) && r.reason === "manual")
    expect(manualRecords).toHaveLength(1)
  })

  test("emits record events", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)
    const emitted: any[] = []
    recorder.on("record", (r) => emitted.push(r))

    await recorder.start()
    await recorder.stop()

    expect(emitted.length).toBeGreaterThanOrEqual(2)
  })

  test("session management: addSession and setSession", async () => {
    const editor = createMockEditor("main content")
    recorder = new AceRecorder(editor as any)

    recorder.addSession({ name: "main", contents: "main content", mode: "text" })
    recorder.addSession({ name: "other", contents: "other content", mode: "text" })

    expect(recorder.sessionInfo).toHaveLength(2)
  })

  test("addSession throws for duplicate name", () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    recorder.addSession({ name: "test", contents: "a", mode: "text" })
    expect(() => recorder!.addSession({ name: "test", contents: "b", mode: "text" })).toThrow("already exists")
  })

  test("external metadata: rejects type property", () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any)

    expect(() => {
      recorder!.external = { type: "bad" }
    }).toThrow("type property")
  })

  test("completeInterval must be non-negative", async () => {
    const editor = createMockEditor("hello")
    recorder = new AceRecorder(editor as any, { completeInterval: -1 })

    await expect(recorder.start()).rejects.toThrow("completeInterval must be greater than or equal to zero")
  })
})
