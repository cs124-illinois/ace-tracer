import { describe, expect, test } from "bun:test"
import AceRecordReplayer from "../../src/ace/RecordReplayer"
import { createMockEditor } from "../fixtures/ace-mock"
import { makeTrace } from "../fixtures/traces"

function createAceRR(value = "hello world") {
  const editor = createMockEditor(value)
  const rr = new AceRecordReplayer(editor as any)
  return { editor, rr }
}

describe("AceRecordReplayer", () => {
  describe("state machine transitions", () => {
    test("initial state is paused", () => {
      const { rr } = createAceRR()
      expect(rr.state).toBe("paused")
    })

    test("paused → recording → paused", async () => {
      const { rr } = createAceRR()

      await rr.record()
      expect(rr.state).toBe("recording")

      await rr.stop()
      expect(rr.state).toBe("paused")
    })

    test("paused → playing → paused (with loaded src)", async () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 3000, records: 7 })

      await rr.play()
      expect(rr.state).toBe("playing")

      rr.pause()
      expect(rr.state).toBe("paused")
    })

    test("play while recording throws", async () => {
      const { rr } = createAceRR()
      await rr.record()

      expect(rr.play()).rejects.toThrow("Not paused")
      await rr.stop()
    })

    test("record while playing throws", async () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 3000, records: 7 })
      await rr.play()

      expect(rr.record()).rejects.toThrow("Not paused")
      rr.pause()
    })

    test("pause while paused throws", () => {
      const { rr } = createAceRR()
      expect(() => rr.pause()).toThrow("Not playing")
    })

    test("stop while paused throws", async () => {
      const { rr } = createAceRR()
      expect(rr.stop()).rejects.toThrow("Not recording")
    })
  })

  describe("src management", () => {
    test("src setter throws during playing", async () => {
      const { rr } = createAceRR()
      rr.src = makeTrace({ durationMs: 3000, records: 7 })
      await rr.play()

      expect(() => {
        rr.src = makeTrace({ durationMs: 2000, records: 5 })
      }).toThrow("Can't change src while playing or recording")

      rr.pause()
    })

    test("src setter throws during recording", async () => {
      const { rr } = createAceRR()
      await rr.record()

      expect(() => {
        rr.src = makeTrace({ durationMs: 2000, records: 5 })
      }).toThrow("Can't change src while playing or recording")

      await rr.stop()
    })

    test("src getter throws during recording", async () => {
      const { rr } = createAceRR()
      await rr.record()

      expect(() => rr.src).toThrow("Still recording")

      await rr.stop()
    })
  })

  describe("percent", () => {
    test("percent calculated correctly", () => {
      const { rr } = createAceRR()
      const trace = makeTrace({ durationMs: 4000, records: 9 })
      rr.src = trace

      rr.currentTime = 2
      expect(rr.percent).toBeCloseTo(50, 0)
    })

    test("setting percent updates currentTime", () => {
      const { rr } = createAceRR()
      const trace = makeTrace({ durationMs: 4000, records: 9 })
      rr.src = trace

      rr.percent = 50
      expect(rr.currentTime).toBeCloseTo(2, 0)
    })
  })

  describe("state listeners", () => {
    test("state listener fires on transitions", async () => {
      const { rr } = createAceRR()
      const states: string[] = []
      rr.addStateListener((state) => states.push(state))

      await rr.record()
      await rr.stop()

      expect(states).toContain("recording")
      expect(states).toContain("paused")
    })
  })

  describe("hasRecording", () => {
    test("hasRecording is false initially", () => {
      const { rr } = createAceRR()
      expect(rr.hasRecording).toBe(false)
    })

    test("hasRecording is true after stop", async () => {
      const { rr } = createAceRR()
      await rr.record()
      await rr.stop()
      expect(rr.hasRecording).toBe(true)
    })

    test("hasRecording resets when src changes", async () => {
      const { rr } = createAceRR()
      await rr.record()
      await rr.stop()
      expect(rr.hasRecording).toBe(true)

      rr.src = makeTrace({ durationMs: 2000, records: 5 })
      expect(rr.hasRecording).toBe(false)
    })
  })
})
