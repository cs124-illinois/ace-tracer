import ace, { Ace } from "ace-builds"
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"
import { AceStreamer } from "./AceStreamer"
import { AceRecord, AceTrace, ExternalChange, getComplete, SessionInfo } from "./types"

export interface AceRecorderEvents {
  record: (record: AceRecord) => void
}
export class AceRecorder extends (EventEmitter as new () => TypedEmitter<AceRecorderEvents>) {
  private editor: Ace.Editor
  private streamer: AceStreamer
  recording = false
  private records: AceRecord[] = []
  private timer?: ReturnType<typeof setInterval>
  private options?: AceRecorder.Options
  src?: AceTrace
  private sessionMap: Record<string, { session: Ace.EditSession; mode: string }> = {}
  private sessionName?: string
  private startSession?: string
  private sessionInfo: SessionInfo[] = []

  public constructor(editor: Ace.Editor, options?: AceRecorder.Options) {
    super()
    this.editor = editor
    this.streamer = new AceStreamer(editor)
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
    this.sessionInfo = Object.entries(this.sessionMap).map(([name, info]) => {
      return { name, contents: info.session.getValue(), mode: info.mode }
    })
    this.startSession = this.sessionName
    this.recording = true
  }
  public async stop() {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    this.timer && clearInterval(this.timer)
    this.streamer!.stop()
    this.src = new AceTrace([...this.records], this.sessionInfo, this.startSession)
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
    const record = getComplete(this.editor, reason, this.sessionName)
    this.records.push(record)
    this.emit("record", record)
  }
  public addSession(session: AceRecorder.Session) {
    const { name, contents, mode } = session
    if (this.sessionMap[name]) {
      throw new Error(`Session ${name} already exists`)
    }
    this.sessionMap[name] = { session: ace.createEditSession(contents, mode as any), mode }
  }
  public addSessions(sessions: AceRecorder.Session[]) {
    for (const session of sessions) {
      this.addSession(session)
    }
  }
  public setSession(name: string) {
    if (!this.sessionMap[name]) {
      throw new Error(`Session ${name} does not exist`)
    }
    this.sessionName = this.streamer.sessionName = name
    this.editor.setSession(this.sessionMap[name].session)
  }
}

export module AceRecorder {
  export type Session = { name: string; contents: string; mode: string }
  export type Options = {
    completeInterval?: number
  }
}
