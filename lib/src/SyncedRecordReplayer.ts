import { IRecordReplayer } from "@cs124/ace-recorder-types"
import EventEmitter from "events"
import AudioRecordReplayer from "./audio/RecordReplayer"

// The Ace half of a synchronized replayer: AceRecordReplayer for one editor, AceMultiRecordReplayer for several
export interface AceSide<T> extends IRecordReplayer {
  src: T | undefined
  sync: () => void
}

// Keeps Ace replay in step with audio playback. Audio is the clock: Ace follows its play, pause, seek and stall events.
abstract class SyncedRecordReplayer<T, A extends AceSide<T>> implements IRecordReplayer {
  // Seconds of drift between audio and Ace before Ace is resynchronized
  private readonly tolerance = 0.1
  // Seconds the audio and Ace recordings may differ in length before stop() reports a mismatch
  public static durationTolerance = 1

  protected _ace: A
  private _audio = new AudioRecordReplayer()
  private emitter = new EventEmitter()
  private _state: IRecordReplayer.State = "paused"
  // Set during record() and stop(), when audio and Ace change state at different moments
  private transitioning = false
  public hasRecording = false

  protected constructor(ace: A) {
    this._ace = ace

    this._audio.addStateListener((state) => {
      if (this.transitioning || this._state === state) {
        return
      }
      if (this._ace.state !== state && state === "paused") {
        this.pauseAce()
      }
      this.state = state
    })
    this._audio.player.addEventListener("ended", () => {
      this.emitter.emit("event", "ending")
      this.currentTime = 0
      this.emitter.emit("event", "ended")
    })
    for (const event of ["waiting", "stalled", "pause"]) {
      this._audio.player.addEventListener(event, () => this.pauseAce())
    }
    this._audio.player.addEventListener("playing", () => {
      if (this._ace.state !== "playing") {
        try {
          this._ace.currentTime = this._audio.currentTime
          this._ace.play()
        } catch {}
      }
    })
    this._audio.player.addEventListener("timeupdate", () => {
      if (this._ace.state === "recording") {
        return
      }
      if (Math.abs(this._ace.currentTime - this._audio.currentTime) > this.tolerance) {
        this._ace.currentTime = this._audio.currentTime
        // While playing, setting currentTime reschedules Ace. While paused (a seek from native audio controls), the
        // editor only changes on sync().
        if (this._ace.state !== "playing") {
          this._ace.sync()
        }
      }
    })
  }
  private pauseAce() {
    if (this._ace.state === "playing") {
      this._ace.pause()
    }
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
    if (!this.src) {
      throw new Error("No source")
    }
    this.emitter.emit("event", "starting")
    await this._audio.play()
    // Audio stays paused if a pause() interrupted it while starting
    this.state = this._audio.state
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
    this.emitter.emit("event", "startingRecording")
    this.transitioning = true
    try {
      await this._audio.record()
      try {
        await this._ace.record()
      } catch (err) {
        await this._audio.stop()
        throw err
      }
    } finally {
      this.transitioning = false
    }
    this.hasRecording = false
    this.state = "recording"
    this.emitter.emit("event", "startedRecording")
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    this.transitioning = true
    try {
      // Stop Ace first: its end timestamp is taken immediately, while stopping audio waits on the encoder
      await this._ace.stop()
      await this._audio.stop()
    } finally {
      this.transitioning = false
    }
    const audioDuration = this._audio.duration
    const aceDuration = this._ace.duration
    if (
      Number.isFinite(audioDuration) &&
      Math.abs(audioDuration - aceDuration) > SyncedRecordReplayer.durationTolerance
    ) {
      this.hasRecording = false
      this.state = "paused"
      throw new Error(`Recordings do not have equal length: Audio ${audioDuration}s <-> Ace ${aceDuration}s`)
    }
    this.hasRecording = true
    this.emitter.emit("event", "srcChanged")
    this.state = "paused"
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
  public set src(src: { audio: string; ace: T | undefined } | undefined) {
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

export default SyncedRecordReplayer
