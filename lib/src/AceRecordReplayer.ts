import { Ace } from "ace-builds"
import EventEmitter from "events"
import { IRecordReplayer } from "."
import { AcePlayer } from "./AcePlayer"
import { AceRecorder } from "./AceRecorder"
import { AceRecord, RecordReplayerState } from "./types"

export class AceRecordReplayer extends AcePlayer implements IRecordReplayer {
  public recorder: AceRecorder
  private _state: RecordReplayerState = "paused"
  private emitter = new EventEmitter()

  constructor(editor: Ace.Editor, options?: AceRecordReplayer.Options) {
    super(options?.replayEditor ?? editor, {
      onExternalChange: options?.onExternalChange,
    })
    this.recorder = new AceRecorder(editor)
  }
  public set state(state: RecordReplayerState) {
    if (state === this._state) {
      return
    }
    this._state = state
    this.emitter.emit("state", state)
  }
  public get state() {
    return this._state
  }
  public async play() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    await super.play()
    this.state = "playing"
  }
  public pause() {
    if (this.state !== "playing") {
      throw new Error("Not playing")
    }
    super.pause()
    this.state = "paused"
  }
  public async record() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    this.recorder.start()
    this.state = "recording"
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    this.recorder!.stop()
    this.src = this.recorder!.src!
    this.state = "paused"
  }
  public addStateListener(listener: (state: RecordReplayerState) => void) {
    this.emitter.addListener("state", listener)
  }
  public get percent() {
    return (this.currentTime / this.duration) * 100
  }
  public set percent(percent: number) {
    this.currentTime = (this.duration * percent) / 100
  }
}

export namespace AceRecordReplayer {
  export type Options = {
    onExternalChange?: (externalChange: AceRecord) => void | boolean
    replayEditor?: Ace.Editor
  }
}

/*
export class AceRecordReplayer extends EventEmitter {
  private recorder: AceRecorder
  private player: AcePlayer
  private _state: AceRecordReplayer.State = "empty"
  private _trace: AceTrace | undefined

  constructor(editor: Ace.Editor, options?: AceRecordReplayer.Options) {
    super()
    this.recorder = new AceRecorder(editor, { labelSession: options?.labelSession })
    this.player = new AcePlayer(options?.replayEditor ?? editor, {
      onExternalChange: options?.onExternalChange,
      getSession: options?.getSession,
    })
    this.recorder.addListener("record", (record) => {
      this.emit("record", record)
    })
    this.emit("state", "empty")
  }
  public get state() {
    return this._state
  }
  private set state(state: AceRecordReplayer.State) {
    this._state = state
    this.emit("state", this._state)
  }
  public startRecording() {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Still playing or recording")
    }
    this.recorder.start()
    this.state = "recording"
  }
  public stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this.recorder.stop()
    this._trace = this.recorder.trace!
    this.player.trace = this._trace
    this.state = "paused"
    this.emit("content", this._trace)
  }
  public pause() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.player.pause()
    this.state = "paused"
  }
  public stop() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.pause()
    this.player.currentTime = 0
    this.player.sync()
  }
  public play() {
    if (this._state !== "paused") {
      throw new Error(`No content or already playing or recording: ${this._state}`)
    }
    this.player.play()
    this.state = "playing"
  }
  public sync() {
    this.notEmpty()
    this.player.sync()
  }
  public clear() {
    this.player.pause()
    this._trace = undefined
    this.state = "empty"
  }
  public get trace() {
    return this._trace
  }
  public set trace(trace: AceTrace | undefined) {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Currently playing or recording")
    }
    if (trace === undefined) {
      this.clear()
    } else {
      this._trace = trace
      this.state = "paused"
    }
  }
  public get duration() {
    this.notEmpty()
    return this._trace!.duration
  }
  public get currentTime() {
    this.notEmpty()
    return this.player.currentTime
  }
  public set currentTime(currentTime: number) {
    this.notEmpty()
    this.player.currentTime = currentTime
  }
  public addExternalChange(change: Record<string, unknown>) {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this.recorder.addExternalChange(change)
  }
  public addCompleteRecord(reason: string = "manual") {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this.recorder.addCompleteRecord(reason)
  }
  public get playbackRate(): number {
    return this.player!.playbackRate
  }
  public set playbackRate(playbackRate: number) {
    this.player!.playbackRate = playbackRate
  }
  private notEmpty() {
    if (this._state === "empty") {
      throw new Error("No trace loaded")
    }
  }
  public get scrollToCursor() {
    return this.player.scrollToCursor
  }
  public set scrollToCursor(scrollToCursor: boolean) {
    this.player.scrollToCursor = scrollToCursor
  }
}
*/
