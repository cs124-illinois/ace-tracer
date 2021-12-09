import type { Ace } from "ace-builds"
import EventEmitter from "events"
import { AceRecordReplayer } from "./AceRecordReplayer"
import { AudioRecordReplayer } from "./AudioRecordReplayer"
import { AceRecord, AceTrace, IRecordReplayer, RecordReplayerState } from "./types"

export class RecordReplayer implements IRecordReplayer {
  private _ace
  private _audio = new AudioRecordReplayer()
  private emitter = new EventEmitter()
  private _state: RecordReplayerState = "paused"

  // private lastTime: number = 0
  constructor(...a: ConstructorParameters<typeof AceRecordReplayer>) {
    this._ace = new AceRecordReplayer(...a)

    /*
    for (const key in this._audio.player) {
      if (/^on/.test(key)) {
        const eventType = key.substr(2)
        this._audio.player.addEventListener(eventType, () => {
          console.log(eventType)
        })
      }
    }
    */

    this._audio.addStateListener((state) => {
      if (this._state === state) {
        return
      }
      if (this._ace.state !== state) {
        if (state === "paused") {
          try {
            this._ace.pause()
          } catch (err) {}
        }
      }
      this.state = state
    })
    this.audio.player.addEventListener("ended", () => {
      this.currentTime = 0
    })
    this.audio.player.addEventListener("waiting", () => {
      if (this._ace.state !== "paused") {
        try {
          this._ace.pause()
        } catch (err) {}
      }
    })
    this.audio.player.addEventListener("stalled", () => {
      if (this._ace.state !== "paused") {
        try {
          this._ace.pause()
        } catch (err) {}
      }
    })
    this.audio.player.addEventListener("playing", () => {
      if (this._ace.state !== "playing") {
        try {
          this._ace.currentTime = this._audio.currentTime
          this._ace.play()
        } catch (err) {}
      }
    })
    this.audio.player.addEventListener("pause", () => {
      if (this._ace.state !== "paused") {
        try {
          this._ace.pause()
        } catch (err) {}
      }
    })
    this.audio.player.addEventListener("timeupdate", () => {
      if (Math.abs(this._ace.currentTime - this._audio.currentTime) > 0.1) {
        this._ace.currentTime = this._audio.currentTime
      }
    })
  }
  public get state() {
    return this._state
  }
  private set state(state: RecordReplayerState) {
    if (state === this._state) {
      return
    }
    this._state = state
    this.emitter.emit("state", this._state)
  }
  public async play() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    await this._audio.play()
    this.state = "playing"
  }
  public pause() {
    if (this.state !== "playing") {
      throw new Error("Not playing")
    }
    this._audio.pause()
    this.state = "paused"
  }
  public async record() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    await this._audio.record()
    await this._ace.record()
    this.state = "recording"
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    await this._audio.stop()
    await this._ace.stop()
    this.state = "paused"
  }
  public addStateListener(listener: (state: RecordReplayerState) => void) {
    this.emitter.addListener("state", listener)
  }
  public set src({ ace, audio }: { ace: AceTrace | undefined; audio: string }) {
    this._ace.src = ace
    this._audio.src = audio
  }
  public get src() {
    return { ace: this._ace.src, audio: this._audio.src }
  }
  public get currentTime() {
    return this._audio.currentTime
  }
  public set currentTime(currentTime: number) {
    this._audio.currentTime = currentTime
    this._ace.currentTime = currentTime
    this._ace.sync()
  }
  public get percent() {
    return this._audio.percent
  }
  public set percent(percent: number) {
    this._audio.percent = percent
    this._ace.percent = percent
    this._ace.sync()
  }
  public get ace() {
    return this._ace
  }
  public get audio() {
    return this._audio
  }
}

/*
export class RecordReplayer extends EventEmitter {
  private _ace
  private _audio = new AudioRecordReplayer()
  private _state: RecordReplayer.State = "empty"
  public duration: number | undefined
  private pausing = false
  private debug = false

  public constructor(editor: Ace.Editor, options: RecordReplayer.Options) {
    super()
    this._ace = new AceRecordReplayer(editor, {
      onExternalChange: options?.onExternalChange,
      labelSession: options?.labelSession,
      getSession: options?.getSession,
      replayEditor: options?.replayEditor,
    })
    this._ace.addStateListener((state) => {
      if (state === "paused" && this._state === "playing" && !this.pausing) {
        this._audio.state === "playing" && this._audio.pause()
        this.state = "paused"
      }
    })
    this._audio.addStateListener((state) => {
      if (state === "paused" && this._state === "playing" && !this.pausing) {
        this._ace.state === "playing" && this._ace.pause()
        this.state = "paused"
      }
    })
    this._audio.addEventListener("ended", () => {
      if (this._state === "playing") {
        this.emit("ended")
      }
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
    await this._audio.record()
    this._ace.record()
    this.state = "recording"
  }
  public async stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    await this._audio.stop()
    this._ace.stop()
    if (this._ace.state === "paused" && this._audio.state === "paused") {
      this.state = "paused"
      const aceDuration = this._ace.duration
      const audioDuration = this._audio.duration * 1000
      if (Math.abs(aceDuration - audioDuration) > 100) {
        throw new Error(`Recordings do not have equal length: ${aceDuration} <-> ${audioDuration}`)
      }
      this.duration = Math.min(aceDuration, audioDuration)
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
    this._ace.pause()
    this._audio.pause()
    this.pausing = false
    this.state = "paused"
  }
  public stop() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.pausing = true
    this._ace.stop()
    this._audio.pause()
    this._audio.currentTime = 0
    this.pausing = false
    this.state = "paused"
  }
  public async play() {
    if (this._state !== "paused") {
      throw new Error(`No content or already playing or recording: ${this._state}`)
    }
    await this._audio.play()
    this._ace.play()
    this.state = "playing"
  }
  public clear() {
    this._ace.src = undefined
    this._audio.src = ""
    this.state = "empty"
  }
  public sync() {
    this._ace.sync()
  }
  public get content(): Promise<RecordReplayer.Content> {
    this.notEmpty()
    return this._audio.recorder!.base64.then((audio) => {
      return { audio, trace: this._ace.src! }
    })
  }
  public get currentTime() {
    this.notEmpty()
    const audioTime = this._audio.currentTime * 1000
    const aceTime = this._ace.currentTime
    if (this.debug) {
      console.debug(Math.round(Math.abs(audioTime - aceTime)))
    } else {
      this._ace.currentTime = audioTime
    }
    return audioTime
  }
  public set currentTime(currentTime: number) {
    this.notEmpty()
    this._audio.currentTime = currentTime / 1000
    this._ace.currentTime = currentTime
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
    this._ace.recorder.addExternalChange(change)
  }
  private notEmpty() {
    if (this._state === "empty") {
      throw new Error("No trace loaded")
    }
  }
  public get playbackRate(): number {
    return this._audio!.playbackRate
  }
  public set playbackRate(playbackRate: number) {
    this._audio!.playbackRate = playbackRate
    this._ace!.playbackRate = playbackRate
  }
  public addCompleteRecord() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this._ace.recorder.addCompleteRecord()
  }
  public get scrollToCursor() {
    return this._ace.scrollToCursor
  }
  public set scrollToCursor(scrollToCursor: boolean) {
    this._ace.scrollToCursor = scrollToCursor
  }
  public get ace() {
    return this._ace
  }
  public get audio() {
    return this._audio
  }
}
*/

export namespace RecordReplayer {
  export type State = "empty" | "paused" | "recording" | "loading" | "playing"
  export type Content = { audio: string; trace: AceTrace }
  export type Options = {
    onExternalChange?: (externalChange: AceRecord) => void | boolean
    labelSession?: () => string
    getSession?: (name: string) => Ace.EditSession
    debug?: boolean
    replayEditor?: Ace.Editor
  }
}
