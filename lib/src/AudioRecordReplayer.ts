import EventEmitter from "events"
import { IRecordReplayer, RecordReplayerState } from "."
import { AudioRecorder } from "./AudioRecorder"

export class AudioRecordReplayer implements IRecordReplayer {
  public player: HTMLAudioElement
  public recorder = new AudioRecorder()
  private _state: RecordReplayerState = "paused"
  private emitter = new EventEmitter()

  constructor() {
    this.player = new Audio()
    this.player.addEventListener("ended", () => {
      this.state = "paused"
    })
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
    await this.player.play()
    this.state = "playing"
  }
  public pause() {
    if (this.state !== "playing") {
      throw new Error("Not playing")
    }
    this.player.pause()
    this.state = "paused"
  }
  public async record() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    await this.recorder!.start()
    this.state = "recording"
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    await this.recorder!.stop()
    this.src = this.recorder!.src!
    this.state = "paused"
  }
  public set src(src: string) {
    this.player.src = src
    this.player.load()
  }
  public get src() {
    return this.player.src
  }
  public addStateListener(listener: (state: RecordReplayerState) => void) {
    this.emitter.addListener("state", listener)
  }
  public get currentTime() {
    return this.player.currentTime
  }
  public set currentTime(currentTime: number) {
    this.player.currentTime = currentTime
  }
  public get percent() {
    return (this.player.currentTime / this.player.duration) * 100
  }
  public set percent(percent: number) {
    this.player.currentTime = (this.player.duration * percent) / 100
  }
}

// customElements.define("audio-recordreplayer", AudioRecordReplayer, { extends: "audio" })

/*
export class AudioRecordReplayer extends EventEmitter {
  private recorder: AudioRecorder | undefined //  = new AudioRecorder()
  private player: HTMLAudioElement | undefined
  private _state: AudioRecordReplayer.State = "empty"
  private _playbackRate: number = 1

  public constructor() {
    super()
    this.emit("state", "empty")
  }
  public get state() {
    return this._state
  }
  private set state(state: AudioRecordReplayer.State) {
    this._state = state
    this.emit("state", this._state)
  }
  private async setRecorder() {
    if (this.recorder) {
      return
    }
    this.recorder = new AudioRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }))
  }
  public async startRecording() {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Still playing or recording")
    }
    await this.setRecorder()
    await this.recorder!.start()
    this.state = "recording"
  }
  private setPlayer() {
    if (this.player) {
      return
    }
    this.player = new Audio()
    this.player.addEventListener("ended", () => {
      if (this._state === "playing") {
        this.emit("ended")
        this.pause()
      }
    })
    this.player.addEventListener("canplaythrough", () => {
      if (this._state === "loading") {
        this.state = "paused"
      }
    })
  }
  public async stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    await this.setRecorder()
    await this.recorder!.stop()
    this.setPlayer()
    const recording = (this.player!.src = this.recorder?.url || "")

    await new Promise((resolve) => {
      this.player!.addEventListener("loadeddata", resolve, { once: true })
      this.player!.load()
    })

    if (recording) {
      this.state = "paused"
      this.emit("content", recording)
    } else {
      this.state = "empty"
    }
  }
  public pause() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.player?.pause()
    this.state = "paused"
  }
  public stop() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.pause()
    this.currentTime = 0
  }
  public async play() {
    if (this._state !== "paused") {
      throw new Error("No content or already playing or recording")
    }
    this.setPlayer()

    let resolver: (value: unknown) => void
    const waitForStart = new Promise((resolve) => {
      resolver = resolve
    })
    const listener = () => {
      this.state = "playing"
      resolver(undefined)
    }
    this.player!.addEventListener("playing", listener)
    this.player!.play()
    this.player!.playbackRate = this._playbackRate

    return waitForStart
  }
  public clear() {
    if (this.player) {
      this.player.pause()
      this.player.src = ""
    }
    this.state = "empty"
  }
  public get src() {
    return this.player?.src || ""
  }
  public set src(src: string) {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Currently playing or recording")
    }
    this.setPlayer()
    this.player!.src = src
    this.player!.load()
    this.state = src === "" ? "empty" : "loading"
  }
  public get duration() {
    this.notEmpty()
    return this.player!.duration
  }
  public get currentTime() {
    this.notEmpty()
    return this.player!.currentTime
  }
  public set currentTime(currentTime: number) {
    this.notEmpty()
    this.player!.currentTime = currentTime
  }
  public get percent() {
    this.notEmpty()
    return (this.currentTime / this.player!.duration) * 100
  }
  public set percent(percent: number) {
    this.notEmpty()
    this.currentTime = (this.player!.duration * percent) / 100
  }
  public get base64(): Promise<string> {
    this.notEmpty()
    return urlToBase64(this.player!.src)
  }
  private notEmpty() {
    if (this._state === "empty") {
      throw new Error("No trace loaded")
    }
  }
  public get playbackRate() {
    return this._playbackRate
  }
  public set playbackRate(playbackRate: number) {
    this._playbackRate = playbackRate
  }
}

export namespace AudioRecordReplayer {
  export type State = "empty" | "paused" | "recording" | "loading" | "playing"
}
*/
