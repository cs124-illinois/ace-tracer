import { AceRecord, AceTrace, RecordReplayer as AceRecordReplayer } from "@cs124/ace-recorder"
import { RecordReplayer as AudioRecordReplayer } from "@cs124/audio-recorder"
import type { Ace } from "ace-builds"
import EventEmitter from "events"

export class RecordReplayer extends EventEmitter {
  private aceRecordReplayer
  private audioRecordReplayer = new AudioRecordReplayer()
  private _state: RecordReplayer.State = "empty"
  public duration: number | undefined
  private pausing = false
  private debug = false

  public constructor(editor: Ace.Editor, options: RecordReplayer.Options) {
    super()
    this.aceRecordReplayer = new AceRecordReplayer(editor, {
      onExternalChange: options?.onExternalChange,
      labelSession: options?.labelSession,
      getSession: options?.getSession,
    })
    this.aceRecordReplayer.addListener("state", (state) => {
      if (state === "paused" && this._state === "playing" && !this.pausing) {
        this.audioRecordReplayer.state === "playing" && this.audioRecordReplayer.pause()
        this.state = "paused"
      }
    })
    this.audioRecordReplayer.addListener("state", (state) => {
      if (state === "paused" && this._state === "playing" && !this.pausing) {
        this.aceRecordReplayer.state === "playing" && this.aceRecordReplayer.pause()
        this.state = "paused"
      }
    })
    this.aceRecordReplayer.addListener("ended", () => {
      if (this._state === "playing") {
        this.emit("ended")
      }
    })
    this.audioRecordReplayer.addListener("ended", () => {
      if (this._state === "playing") {
        this.emit("ended")
      }
    })
    this.aceRecordReplayer.addListener("completeRecord", () => {
      this.emit("completeRecord")
    })
    this.aceRecordReplayer.addListener("record", (record) => {
      this.emit("record", record)
    })
    this.debug = options.debug || false
    this.emit("state", "empty")
  }
  public get state() {
    return this._state
  }
  private set state(state: RecordReplayer.State) {
    this._state = state
    this.emit("state", this._state)
  }
  public async startRecording() {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Still playing or recording")
    }
    await this.audioRecordReplayer.startRecording()
    this.aceRecordReplayer.startRecording()
    this.state = "recording"
  }
  public async stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    await this.audioRecordReplayer.stopRecording()
    this.aceRecordReplayer.stopRecording()
    if (this.aceRecordReplayer.state === "paused" && this.audioRecordReplayer.state === "paused") {
      this.state = "paused"
      const aceDuration = this.aceRecordReplayer.duration
      const audioDuration = this.audioRecordReplayer.duration * 1000
      if (Math.abs(aceDuration - audioDuration) > 100) {
        throw new Error("Recordings do not have equal length")
      }
      this.duration = Math.min(aceDuration, audioDuration)
      // this.emit("content", url)
    } else {
      this.state = "empty"
      this.duration = undefined
    }
  }
  public pause() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.pausing = true
    this.aceRecordReplayer.pause()
    this.audioRecordReplayer.pause()
    this.pausing = false
    this.state = "paused"
  }
  public stop() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.pausing = true
    this.aceRecordReplayer.stop()
    this.audioRecordReplayer.stop()
    this.pausing = false
    this.state = "paused"
  }
  public async play() {
    if (this._state !== "paused") {
      throw new Error(`No content or already playing or recording: ${this._state}`)
    }
    await this.audioRecordReplayer.play()
    this.aceRecordReplayer.play()
    this.state = "playing"
  }
  public clear() {
    this.aceRecordReplayer.clear()
    this.audioRecordReplayer.clear()
    this.state = "empty"
  }
  public sync() {
    this.aceRecordReplayer.sync()
  }
  public get content(): Promise<RecordReplayer.Content> {
    this.notEmpty()
    return this.audioRecordReplayer.base64.then((audio) => {
      return { audio, trace: this.aceRecordReplayer.trace! }
    })
  }
  public get currentTime() {
    this.notEmpty()
    const audioTime = this.audioRecordReplayer.currentTime * 1000
    const aceTime = this.aceRecordReplayer.currentTime
    if (this.debug) {
      console.debug(Math.round(Math.abs(audioTime - aceTime)))
    } else {
      this.aceRecordReplayer.currentTime = audioTime
    }
    return audioTime
  }
  public set currentTime(currentTime: number) {
    this.notEmpty()
    this.audioRecordReplayer.currentTime = currentTime / 1000
    this.aceRecordReplayer.currentTime = currentTime
  }
  public get percent() {
    this.notEmpty()
    return (this.currentTime / this.duration!) * 100
  }
  public set percent(percent: number) {
    this.notEmpty()
    if (percent < 0 || percent > 100) {
      throw new Error("Bad percent value")
    }
    this.currentTime = this.duration! * (percent / 100)
  }
  public addExternalChange(change: Record<string, unknown>) {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this.aceRecordReplayer.addExternalChange(change)
  }
  private notEmpty() {
    if (this._state === "empty") {
      throw new Error("No trace loaded")
    }
  }
  public get playbackRate(): number {
    return this.audioRecordReplayer!.playbackRate
  }
  public set playbackRate(playbackRate: number) {
    this.audioRecordReplayer!.playbackRate = playbackRate
    this.aceRecordReplayer!.playbackRate = playbackRate
  }
  public addCompleteRecord() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this.aceRecordReplayer.addCompleteRecord()
  }
}

export namespace RecordReplayer {
  export type State = "empty" | "paused" | "recording" | "playing"
  export type Content = { audio: string; trace: AceTrace }
  export type Options = {
    onExternalChange?: (externalChange: AceRecord) => void | boolean
    labelSession?: () => string
    getSession?: (name: string) => Ace.EditSession
    debug?: boolean
  }
}
