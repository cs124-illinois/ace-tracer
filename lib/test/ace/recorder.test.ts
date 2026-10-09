import { afterEach, describe, expect, jest, test } from "bun:test"
import { AceRecord, Complete, ExternalChange } from "@cs124/ace-recorder-types"
import AceRecorder from "../../src/ace/Recorder"
import { createMockEditor } from "../fixtures/ace-mock"
import { useFakeTimers } from "../fixtures/timers"

const insert = (column: number, text: string) => ({
  action: "insert" as const,
  start: { row: 0, column },
  end: { row: 0, column: column + text.length },
  lines: [text],
})

const completes = (records: AceRecord[]) => records.filter((r) => Complete.guard(r)) as Complete[]
const reasons = (records: AceRecord[]) => completes(records).map((r) => r.reason)

describe("AceRecorder", () => {
  useFakeTimers(1000)
  let recorder: AceRecorder | undefined

  afterEach(async () => {
    if (recorder?.recording) {
      await recorder.stop()
    }
    recorder = undefined
  })

  function create(value = "hello", options?: AceRecorder.Options) {
    const editor = createMockEditor(value)
    recorder = new AceRecorder(editor as any, options)
    return { editor, recorder }
  }

  describe("start and stop", () => {
    test("starts and stops recording", async () => {
      const { recorder } = create()

      expect(recorder.recording).toBe(false)
      await recorder.start()
      expect(recorder.recording).toBe(true)
      await recorder.stop()
      expect(recorder.recording).toBe(false)
    })

    test("produces a trace from start and end Completes", async () => {
      const { editor, recorder } = create("hello")

      await recorder.start()
      jest.advanceTimersByTime(500)
      editor.simulateChange(insert(5, "!"))
      await recorder.stop()

      const trace = recorder.src!
      expect(trace.records.map((r) => r.type)).toEqual(["complete", "delta", "complete"])
      expect(reasons(trace.records)).toEqual(["start", "end"])
      expect(trace.duration).toBe(500)
      expect(trace.startTime).toEqual(new Date(1000))
      expect(trace.sessionInfo).toEqual([{ name: "", contents: "hello!", mode: "text" }])
    })

    test("emits each record as it is recorded", async () => {
      const { editor, recorder } = create()
      const emitted: AceRecord[] = []
      recorder.on("record", (r) => emitted.push(r))

      await recorder.start()
      editor.simulateChange(insert(5, "!"))
      await recorder.stop()

      expect(emitted).toEqual(recorder.src!.records)
    })

    test("start throws when already recording", async () => {
      const { recorder } = create()
      await recorder.start()
      await expect(recorder.start()).rejects.toThrow("Already recording")
      expect(recorder.recording).toBe(true)
    })

    test("stop throws when not recording", async () => {
      const { recorder } = create()
      await expect(recorder.stop()).rejects.toThrow("Not recording")
    })

    test("a second recording starts from scratch", async () => {
      const { editor, recorder } = create("a")
      await recorder.start()
      editor.simulateChange(insert(1, "b"))
      await recorder.stop()
      const first = recorder.src!

      await recorder.start()
      expect(recorder.src).toBeUndefined()
      await recorder.stop()

      expect(first.records).toHaveLength(3)
      expect(recorder.src!.records.map((r) => r.type)).toEqual(["complete", "complete"])
      expect((recorder.src!.records[0] as Complete).value).toBe("ab")
    })
  })

  describe("Complete records", () => {
    test("addCompleteRecord throws when not recording", () => {
      const { recorder } = create()
      expect(() => recorder.addCompleteRecord()).toThrow("Not recording")
    })

    test("addCompleteRecord adds a Complete with the given reason and current session info", async () => {
      const { editor, recorder } = create("hello")

      await recorder.start()
      editor.simulateChange(insert(0, ">"))
      recorder.addCompleteRecord()
      await recorder.stop()

      const manual = completes(recorder.src!.records).filter((r) => r.reason === "manual")
      expect(manual).toHaveLength(1)
      expect(manual[0].value).toBe(">hello")
      expect(manual[0].sessionInfo).toEqual([{ name: "", contents: ">hello", mode: "text" }])
    })

    test("by default, a timer adds a Complete every second", async () => {
      const { recorder } = create()

      await recorder.start()
      jest.advanceTimersByTime(3500)
      await recorder.stop()

      const timers = completes(recorder.src!.records).filter((r) => r.reason === "timer")
      expect(timers.map((r) => new Date(r.timestamp).valueOf())).toEqual([2000, 3000, 4000])
    })

    test("by default, edits don't trigger counter Completes", async () => {
      const { editor, recorder } = create("")

      await recorder.start()
      for (let i = 0; i < 100; i++) {
        editor.simulateChange(insert(i, "x"))
      }
      await recorder.stop()

      expect(reasons(recorder.src!.records)).toEqual(["start", "end"])
    })

    test("completeCount adds a Complete after that many other records", async () => {
      const { editor, recorder } = create("", { completeCount: 3, completeInterval: 0 })

      await recorder.start()
      for (let i = 0; i < 7; i++) {
        editor.simulateChange(insert(i, "x"))
      }
      await recorder.stop()

      expect(reasons(recorder.src!.records)).toEqual(["start", "counter", "counter", "end"])
    })

    test("completeInterval sets the timer period, and 0 disables it", async () => {
      const fast = create("", { completeInterval: 250 }).recorder
      await fast.start()
      jest.advanceTimersByTime(1000)
      await fast.stop()
      expect(reasons(fast.src!.records)).toEqual(["start", "timer", "timer", "timer", "timer", "end"])

      const off = create("", { completeInterval: 0 }).recorder
      await off.start()
      jest.advanceTimersByTime(5000)
      await off.stop()
      expect(reasons(off.src!.records)).toEqual(["start", "end"])
    })

    test("stop clears the timer", async () => {
      const { recorder } = create()
      await recorder.start()
      await recorder.stop()
      const count = recorder.src!.records.length

      jest.advanceTimersByTime(5000)
      expect(jest.getTimerCount()).toBe(0)
      expect(recorder.src!.records).toHaveLength(count)
    })
  })

  describe("misconfiguration", () => {
    test("completeInterval must be non-negative", async () => {
      const { recorder } = create("hello", { completeInterval: -1 })
      await expect(recorder.start()).rejects.toThrow("completeInterval must be greater than or equal to zero")
      expect(recorder.recording).toBe(false)
    })

    test("completeCount must be non-negative", async () => {
      const { recorder } = create("hello", { completeCount: -1 })
      await expect(recorder.start()).rejects.toThrow("completeCount must be greater than or equal to zero")
      expect(recorder.recording).toBe(false)
    })

    test("sessions added without selecting one can't be recorded", async () => {
      const { recorder } = create()
      recorder.addSession({ name: "main", contents: "", mode: "ace/mode/text" })
      await expect(recorder.start()).rejects.toThrow("Session information not properly configured")
      expect(recorder.recording).toBe(false)
    })
  })

  describe("sessions", () => {
    function createWithSessions() {
      const { editor, recorder } = create("unused")
      recorder.addSession({ name: "Main.java", contents: "class Main {}", mode: "ace/mode/java" })
      recorder.addSession({ name: "notes.txt", contents: "notes", mode: "ace/mode/text" })
      recorder.setSession("Main.java")
      return { editor, recorder }
    }

    test("addSession throws for a duplicate name", () => {
      const { recorder } = create()
      recorder.addSession({ name: "test", contents: "a", mode: "ace/mode/text" })
      expect(() => recorder.addSession({ name: "test", contents: "b", mode: "ace/mode/text" })).toThrow(
        "already exists",
      )
    })

    test("setSession switches the editor to the named session", () => {
      const { editor, recorder } = createWithSessions()
      expect(editor.getValue()).toBe("class Main {}")
      recorder.setSession("notes.txt")
      expect(editor.getValue()).toBe("notes")
      expect(() => recorder.setSession("missing")).toThrow("Session missing does not exist")
    })

    test("the trace records the starting session and every session's contents", async () => {
      const { editor, recorder } = createWithSessions()

      await recorder.start()
      editor.simulateChange(insert(13, "\n"))
      recorder.setSession("notes.txt")
      await recorder.stop()

      const trace = recorder.src!
      expect(trace.sessionName).toBe("Main.java")
      expect(trace.sessionInfo).toEqual([
        { name: "Main.java", contents: "class Main {}\n", mode: "ace/mode/java" },
        { name: "notes.txt", contents: "notes", mode: "ace/mode/text" },
      ])
      expect((trace.records[0] as Complete).sessionName).toBe("Main.java")
      expect((trace.records[trace.records.length - 1] as Complete).sessionName).toBe("notes.txt")
    })

    test("setSession during recording records a 'session' Complete and follows the new session", async () => {
      const { editor, recorder } = createWithSessions()

      await recorder.start()
      recorder.setSession("notes.txt")
      editor.simulateChange(insert(5, "!"))
      await recorder.stop()

      const records = recorder.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "complete", "delta", "complete"])
      const switched = records[1] as Complete
      expect(switched.reason).toBe("session")
      expect(switched.sessionName).toBe("notes.txt")
      expect(switched.value).toBe("notes")
      expect((records[2] as any).lines).toEqual(["!"])
      expect(recorder.sessionInfo.find((s) => s.name === "notes.txt")!.contents).toBe("notes!")
    })

    test("addSession and deleteSession during recording each record a 'session' Complete", async () => {
      const { recorder } = createWithSessions()

      await recorder.start()
      recorder.addSession({ name: "extra.txt", contents: "extra", mode: "ace/mode/text" })
      recorder.deleteSession("notes.txt")
      await recorder.stop()

      const sessionCompletes = completes(recorder.src!.records).filter((r) => r.reason === "session")
      expect(sessionCompletes.map((r) => r.sessionInfo!.map((s) => s.name))).toEqual([
        ["Main.java", "notes.txt", "extra.txt"],
        ["Main.java", "extra.txt"],
      ])
    })

    test("batch addSessions and deleteSessions record one 'session' Complete each", async () => {
      const { recorder } = createWithSessions()

      await recorder.start()
      recorder.addSessions([
        { name: "a.txt", contents: "a", mode: "ace/mode/text" },
        { name: "b.txt", contents: "b", mode: "ace/mode/text" },
      ])
      recorder.deleteSessions(["a.txt", "notes.txt"])
      await recorder.stop()

      const sessionCompletes = completes(recorder.src!.records).filter((r) => r.reason === "session")
      expect(sessionCompletes.map((r) => r.sessionInfo!.map((s) => s.name))).toEqual([
        ["Main.java", "notes.txt", "a.txt", "b.txt"],
        ["Main.java", "b.txt"],
      ])
    })

    test("session changes before recording don't record anything", async () => {
      const { recorder } = createWithSessions()
      recorder.addSession({ name: "extra.txt", contents: "", mode: "ace/mode/text" })
      recorder.deleteSession("extra.txt")

      await recorder.start()
      await recorder.stop()
      expect(reasons(recorder.src!.records)).toEqual(["start", "end"])
    })

    test("deleteSession rejects the current session and unknown names", () => {
      const { recorder } = createWithSessions()
      expect(() => recorder.deleteSession("Main.java")).toThrow("Can't delete current session Main.java")
      expect(() => recorder.deleteSession("missing")).toThrow("Session missing does not exists")
    })

    test("singleSession names the only session", async () => {
      const { recorder } = create("hello")
      recorder.singleSession({ name: "Main.kt", contents: "hello", mode: "ace/mode/kotlin" })

      await recorder.start()
      await recorder.stop()

      expect(recorder.src!.sessionName).toBe("Main.kt")
      expect(recorder.src!.sessionInfo).toEqual([{ name: "Main.kt", contents: "hello", mode: "ace/mode/kotlin" }])
      expect(reasons(recorder.src!.records)).toEqual(["start", "end"])
      expect(() => recorder.singleSession({ name: "Other.kt", contents: "", mode: "ace/mode/kotlin" })).toThrow(
        "Session map must be empty when calling singleSession",
      )
    })
  })

  describe("external state", () => {
    test("rejects a type property", () => {
      const { recorder } = create()
      expect(() => {
        recorder.external = { type: "bad" }
      }).toThrow("type property")
    })

    test("before recording, external state only appears on Completes", async () => {
      const { recorder } = create()
      recorder.external = { step: 1 }

      await recorder.start()
      await recorder.stop()

      const records = recorder.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "complete"])
      expect(completes(records).map((r) => r.external)).toEqual([{ step: 1 }, { step: 1 }])
    })

    test("during recording, external state is recorded as an ExternalChange and carried by later Completes", async () => {
      const { recorder } = create()

      await recorder.start()
      jest.advanceTimersByTime(100)
      recorder.external = { step: 2 }
      recorder.addCompleteRecord()
      await recorder.stop()

      const records = recorder.src!.records
      expect(records.map((r) => r.type)).toEqual(["complete", "external", "complete", "complete"])
      const change = records[1] as ExternalChange
      expect(ExternalChange.guard(change)).toBe(true)
      expect(change.external).toEqual({ step: 2 })
      expect(change.timestamp).toEqual(new Date(1100))
      expect(completes(records).map((r) => r.external)).toEqual([undefined, { step: 2 }, { step: 2 }])
    })
  })
})
