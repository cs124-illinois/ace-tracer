import { AceRecord, AceTrace, Complete, CompleteReasons, ExternalChange, SessionInfo } from "@cs124/ace-recorder-types"
import ace, { Ace } from "ace-builds"
import EventEmitter from "events"
import { TypedEmitter } from "tiny-typed-emitter"
import AceStreamer, { getComplete } from "./Streamer"

export interface AceRecorderEvents {
  record: (record: AceRecord) => void
}

class AceRecorder extends (EventEmitter as new () => TypedEmitter<AceRecorderEvents>) {
  public static defaultOptions: AceRecorder.Options = {
    completeCount: 0,
    completeInterval: 32,
  }

  private editor: Ace.Editor
  private streamer: AceStreamer
  public recording = false
  private records: AceRecord[] = []
  private timer?: ReturnType<typeof setInterval>
  private options?: AceRecorder.Options
  public src?: AceTrace
  private sessionMap: Record<string, { session: Ace.EditSession; mode: string }> = {}
  private sessionName?: string
  private startSession = ""
  private sessionInfo: SessionInfo[] = []
  private _external?: Record<string, unknown>

  public constructor(editor: Ace.Editor, options?: AceRecorder.Options) {
    super()
    this.editor = editor
    this.streamer = new AceStreamer(editor)
    this.options = options
  }
  public async start() {
    const completeInterval = this.options?.completeInterval ?? AceRecorder.defaultOptions.completeInterval!
    if (completeInterval < 0) {
      throw new Error(`completeInterval must be greater than or equal to zero`)
    }

    const completeCount = this.options?.completeCount ?? AceRecorder.defaultOptions.completeInterval!
    if (completeCount <= 0) {
      throw new Error(`completeCount must be greater than zero`)
    }

    this.records = []
    this.src = undefined

    let counter = 0
    if (Object.keys(this.sessionMap).length === 0 && this.sessionName === undefined) {
      this.sessionMap[""] = {
        session: this.editor.getSession(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: (this.editor.getSession() as any).$modeId,
      }
      this.sessionName = ""
    } else if (Object.keys(this.sessionMap).length === 0 || this.sessionName === undefined) {
      throw new Error(`Session information not properly configured: ${this.sessionName}`)
    }

    this.sessionInfo = Object.entries(this.sessionMap).map(([name, info]) => {
      return { name, contents: info.session.getValue(), mode: info.mode }
    })
    this.startSession = this.sessionName || ""

    this.streamer.start((record: AceRecord) => {
      if (Complete.guard(record)) {
        const currentSessions = [...Object.keys(this.sessionMap)]
        const currentSessionInfo = currentSessions.map((v) => {
          return { name: v, contents: this.sessionMap[v].session.getValue(), mode: this.sessionMap[v].mode }
        })
        record["sessionInfo"] = currentSessionInfo
      } else {
        counter++
        if (counter === completeCount) {
          this.addCompleteRecord("counter")
          counter = 0
        }
      }
      this.records.push(record)
      this.emit("record", record)
    })

    if (completeInterval > 0) {
      this.timer = setInterval(() => {
        this.addCompleteRecord("timer")
      }, completeInterval)
    } else {
      this.timer = undefined
    }

    this.recording = true
  }
  public async stop() {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    this.recording = false
    this.timer && clearInterval(this.timer)
    this.streamer!.stop()
    this.src = new AceTrace([...this.records], this.sessionInfo, this.startSession)
  }
  public addCompleteRecord(reason: CompleteReasons = "manual") {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    const record = getComplete(this.editor, reason, this.sessionName, this._external)
    const currentSessions = [...Object.keys(this.sessionMap)]
    const currentSessionInfo = currentSessions.map((v) => {
      return { name: v, contents: this.sessionMap[v].session.getValue(), mode: this.sessionMap[v].mode }
    })
    record["sessionInfo"] = currentSessionInfo
    this.records.push(record)
    this.emit("record", record)
  }
  public addSession(session: AceRecorder.Session) {
    const { name, contents, mode } = session
    if (this.sessionMap[name]) {
      throw new Error(`Session ${name} already exists`)
    }
    if (this.recording) {
      this.sessionInfo.push({ name, contents: contents, mode: mode })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.sessionMap[name] = { session: ace.createEditSession(contents, mode as any), mode }
  }
  public addSessions(sessions: AceRecorder.Session[]) {
    for (const session of sessions) {
      this.addSession(session)
    }
  }

  public getSessionsInfo() {
    return Object.entries(this.sessionMap).map(([name, info]) => {
      return { name, contents: info.session.getValue(), mode: info.mode }
    })
  }

  public clearSessions() {
    if (this.recording) {
      throw new Error("cannot clear sessions while recording")
    }
    this.sessionMap = {}
  }

  public setSession(name: string) {
    if (!this.sessionMap[name]) {
      throw new Error(`Session ${name} does not exist`)
    }
    this.sessionName = this.streamer.sessionName = name
    this.editor.setSession(this.sessionMap[name].session)
  }
  public singleSession(session: AceRecorder.Session) {
    if (Object.keys(this.sessionMap).length > 0) {
      throw new Error("Session map must be empty when calling singleSession")
    }
    this.addSession(session)
    this.sessionName = session.name
  }
  public set external(external: Record<string, unknown>) {
    if (external.type !== undefined) {
      throw new Error("type property in external changes is overwritten")
    }
    this._external = external
    this.streamer.external = external
    if (this.recording) {
      const record = ExternalChange.check({
        external,
        type: "external",
        timestamp: new Date(),
      })
      this.records.push(record)
      this.emit("record", record)
    }
  }
}

module AceRecorder {
  export type Session = { name: string; contents: string; mode: string }
  export type Options = {
    completeInterval?: number
    completeCount?: number
  }
}

export default AceRecorder
