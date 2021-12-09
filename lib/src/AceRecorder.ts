import { Ace } from "ace-builds"
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"
import { AceRecord, AceStreamer, AceTrace, ExternalChange, getComplete } from "."

export interface AceRecorderEvents {
  record: (record: AceRecord) => void
}
export class AceRecorder extends (EventEmitter as new () => TypedEmitter<AceRecorderEvents>) {
  private editor: Ace.Editor
  private streamer: AceStreamer
  recording = false
  private records: AceRecord[] = []
  private timer: ReturnType<typeof setInterval> | undefined
  private options?: AceRecorder.Options
  src: AceTrace | undefined

  public constructor(editor: Ace.Editor, options?: AceRecorder.Options) {
    super()
    this.editor = editor
    this.streamer = new AceStreamer(editor, options?.labelSession)
    this.options = options
  }
  public async start() {
    const interval = this.options?.completeInterval || 1000
    this.records = []
    this.src = undefined

    this.streamer.start((record: AceRecord) => {
      this.records.push(record)
      this.emit("record", record)
    })
    this.timer = setInterval(() => {
      this.addCompleteRecord("timer")
    }, interval)
    this.recording = true
  }
  public async stop() {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    this.timer && clearInterval(this.timer)
    this.streamer!.stop()
    this.src = new AceTrace([...this.records])
  }
  public addExternalChange(change: Record<string, unknown>) {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    if (change.type !== undefined) {
      throw new Error("type property in external changes is overwritten")
    }
    const record = ExternalChange.check({
      ...change,
      type: "external",
      timestamp: new Date(),
    })
    this.records.push(record)
    this.emit("record", record)
  }
  public addCompleteRecord(reason: string = "manual") {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    const record = getComplete(this.editor, reason, this.options?.labelSession)
    this.records.push(record)
    this.emit("record", record)
  }
}

export module AceRecorder {
  export type Options = {
    labelSession?: () => string
    completeInterval?: number
  }
}
