import { IRecordReplayer } from "@cs124/ace-recorder-types"
import EventEmitter from "events"
import AudioRecorder from "./Recorder"

class AudioRecordReplayer implements IRecordReplayer {
  public static metadataTimeout = 2000

  public player: HTMLAudioElement
  public recorder = new AudioRecorder()
  private _state: IRecordReplayer.State = "paused"
  private emitter = new EventEmitter()
  private stopping = false
  private _playbackRate = 1.0
  public hasRecording = false

  constructor() {
    this.player = new Audio()
    this.player.addEventListener("ended", () => {
      this.state = "paused"
      this.emitter.emit("event", "ended")
    })
    // Track pauses and plays that don't come through this class, such as media keys or the browser pausing audio
    this.player.addEventListener("pause", () => {
      if (this.state === "playing") {
        this.state = "paused"
      }
    })
    this.player.addEventListener("play", () => {
      if (this.state === "paused") {
        this.state = "playing"
      }
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
    this.player.playbackRate = this._playbackRate
    try {
      await this.player.play()
    } catch (err) {
      // A pause() while play() is pending interrupts it. That's an ordinary user action, not a failure.
      if (err instanceof DOMException && err.name === "AbortError" && this.player.paused) {
        this.state = "paused"
        return
      }
      throw err
    }
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
    await this.recorder.start()
    this.hasRecording = false
    this.state = "recording"
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    try {
      await this.recorder.stop()
      this.stopping = true
      this.src = this.recorder.src!
    } finally {
      this.stopping = false
      this.state = "paused"
    }
    this.hasRecording = true
    await this.loadedMetadata()
  }
  // Duration is NaN until metadata loads, which happens asynchronously after the src changes
  private loadedMetadata() {
    if (!Number.isNaN(this.player.duration) || this.player.src === "") {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.player.removeEventListener("loadedmetadata", done)
        this.player.removeEventListener("error", done)
        resolve()
      }
      const timer = setTimeout(done, AudioRecordReplayer.metadataTimeout)
      this.player.addEventListener("loadedmetadata", done)
      this.player.addEventListener("error", done)
    })
  }
  public set src(src: string) {
    if (!this.stopping && (this.state === "playing" || this.state === "recording")) {
      throw new Error("Can't change src while playing or recording")
    }
    this.player.src = src
    if (src !== "") {
      this.player.load()
    }
    // load() resets playbackRate to defaultPlaybackRate
    this.player.playbackRate = this._playbackRate
    this.state = "paused"
    this.hasRecording = false
  }
  public get src() {
    if (this.state === "recording") {
      throw new Error("Still recording")
    }
    return this.player.src
  }
  public addStateListener(listener: (state: IRecordReplayer.State) => void) {
    this.emitter.addListener("state", listener)
  }
  public removeStateListener(listener: (state: IRecordReplayer.State) => void) {
    this.emitter.removeListener("state", listener)
  }
  public addEventListener(listener: (event: IRecordReplayer.Event) => void) {
    this.emitter.addListener("event", listener)
  }
  public removeEventListener(listener: (event: IRecordReplayer.Event) => void) {
    this.emitter.removeListener("event", listener)
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
    this._playbackRate = playbackRate
    this.player.defaultPlaybackRate = playbackRate
    this.player.playbackRate = playbackRate
  }
  public get duration() {
    return this.player.duration
  }
}

export default AudioRecordReplayer
