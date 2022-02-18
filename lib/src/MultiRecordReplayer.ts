import { AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
import EventEmitter from "events"
import AceMultiRecordReplayer from "./ace/MultiRecordReplayer"
import AudioRecordReplayer from "./audio/RecordReplayer"

class MultiRecordReplayer implements IRecordReplayer {
  private _ace
  private _audio = new AudioRecordReplayer()
  private emitter = new EventEmitter()
  private _state: IRecordReplayer.State = "paused"
  private readonly tolerance = 0.1
  public hasRecording = false

  constructor(...a: ConstructorParameters<typeof AceMultiRecordReplayer>) {
    this._ace = new AceMultiRecordReplayer(...a)

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
      this.emitter.emit("event", "ended")
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
      if (Math.abs(this._ace.currentTime - this._audio.currentTime) > this.tolerance) {
        this._ace.currentTime = this._audio.currentTime
      }
    })
  }
  public get state() {
    return this._state
  }
  private set state(state: IRecordReplayer.State) {
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
    this.hasRecording = true
    await this._audio.stop()
    await this._ace.stop()
    if (Math.abs(this._audio.duration - this._ace.duration) > 100) {
      this.hasRecording = false
      throw new Error(
        `Recordings do not have equal length: Audio ${this._audio.duration} <-> Ace ${this._ace.duration}`
      )
    }
    this.hasRecording && this.emitter.emit("event", "srcChanged")
    this.state = "paused"
  }
  public addStateListener(listener: (state: IRecordReplayer.State) => void) {
    this.emitter.addListener("state", listener)
  }
  public addEventListener(listener: (state: IRecordReplayer.Event) => void) {
    this.emitter.addListener("event", listener)
  }
  public set src(src: MultiRecordReplayer.Content | undefined) {
    if (this.state === "playing" || this.state === "recording") {
      throw new Error("Can't change source while recording or playing")
    }
    this._ace.src = src ? src.ace : undefined
    this._audio.src = src ? src.audio : ""
    this.hasRecording = false
    this.state = "paused"
    this.emitter.emit("event", "srcChanged")
  }
  public get src() {
    if (this.state === "recording") {
      throw new Error("Still recording")
    }
    return this._ace.src ? { ace: this._ace.src, audio: this._audio.src } : undefined
  }
  public get currentTime() {
    return this._audio.currentTime
  }
  public set currentTime(currentTime: number) {
    this._audio.currentTime = currentTime
    this._ace.currentTime = currentTime
    this._ace.sync()
    this.emitter.emit("event", "seeked")
  }
  public get percent() {
    return this._audio.percent
  }
  public set percent(percent: number) {
    this._audio.percent = percent
    this._ace.percent = percent
    this._ace.sync()
    this.emitter.emit("event", "seeked")
  }
  public get ace() {
    return this._ace
  }
  public get audio() {
    return this._audio
  }
  public set playbackRate(playbackRate: number) {
    this._audio.playbackRate = playbackRate
    this._ace.playbackRate = playbackRate
    this.emitter.emit("event", "playbackRateChange")
  }
  public get playbackRate() {
    return this._audio.playbackRate
  }
  public get duration() {
    return this._audio.duration
  }
}

namespace MultiRecordReplayer {
  export type Content = { audio: string; ace: Record<string, AceTrace> | undefined }
  export type State = IRecordReplayer.State
}

export default MultiRecordReplayer
