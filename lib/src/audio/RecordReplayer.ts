import EventEmitter from "events"
import { IRecordReplayer } from "../types"
import AudioRecorder from "./Recorder"

class AudioRecordReplayer implements IRecordReplayer {
  public player: HTMLAudioElement
  public recorder = new AudioRecorder()
  private _state: IRecordReplayer.State = "paused"
  private emitter = new EventEmitter()
  private stopping = false

  constructor() {
    this.player = new Audio()
    this.player.addEventListener("ended", () => {
      this.state = "paused"
    })
  }
  public set state(state: IRecordReplayer.State) {
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
    this.stopping = true
    this.src = this.recorder!.src!
    this.state = "paused"
    this.stopping = false
  }
  public set src(src: string) {
    if (!this.stopping && (this.state === "playing" || this.state === "recording")) {
      throw new Error("Can't change src while playing or recording")
    }
    this.player.src = src
    if (src !== "") {
      this.player.load()
      this.state = "paused"
    } else {
      this.state = "empty"
    }
  }
  public get src() {
    return this.player.src
  }
  public addStateListener(listener: (state: IRecordReplayer.State) => void) {
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
  public get playbackRate() {
    return this.player.playbackRate
  }
  public set playbackRate(playbackRate: number) {
    this.player.playbackRate = playbackRate
  }
  public get duration() {
    return this.player.duration
  }
}

export default AudioRecordReplayer
