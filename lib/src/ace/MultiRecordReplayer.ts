import { AceRecord, AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
import { Ace } from "ace-builds"
import EventEmitter from "events"
import AcePlayer from "./Player"
import AceRecorder from "./Recorder"

class AceMultiRecordReplayer implements IRecordReplayer {
  public players: Record<string, AcePlayer> = {}
  public recorders: Record<string, AceRecorder> = {}
  private _state: IRecordReplayer.State = "paused"
  private emitter = new EventEmitter()
  private stopping = false
  private _src: Record<string, AceTrace> | undefined
  public hasRecording = false

  constructor(editors: Record<string, Ace.Editor>, options?: AceMultiRecordReplayer.Options) {
    for (const name of Object.keys(editors)) {
      const player = new AcePlayer(options?.replayEditors ? options.replayEditors[name] : editors[name], {
        filterRecord: (record) => (options?.filterRecord ? options.filterRecord(record, name) : true),
      })
      // Traces can differ slightly in length, so playback ends when the last player finishes
      player.on("ended", () => {
        if (this.state === "playing" && !Object.values(this.players).some((p) => p.playing)) {
          this.state = "paused"
          this.emitter.emit("event", "ended")
        }
      })
      this.players[name] = player
      this.recorders[name] = new AceRecorder(editors[name], options?.recorderOptions)
    }
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
    for (const player of Object.values(this.players)) {
      await player.play()
    }
    this.state = Object.values(this.players).some((p) => p.playing) ? "playing" : "paused"
  }
  public pause() {
    if (this.state !== "playing") {
      throw new Error("Not playing")
    }
    for (const player of Object.values(this.players)) {
      player.pause()
    }
    this.state = "paused"
  }
  public sync() {
    for (const player of Object.values(this.players)) {
      player.sync()
    }
  }
  public async record() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    const started: AceRecorder[] = []
    try {
      for (const recorder of Object.values(this.recorders)) {
        await recorder.start()
        started.push(recorder)
      }
    } catch (err) {
      for (const recorder of started) {
        await recorder.stop()
      }
      throw err
    }
    this.hasRecording = false
    this.state = "recording"
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    const src: Record<string, AceTrace> = {}
    for (const [name, recorder] of Object.entries(this.recorders)) {
      await recorder.stop()
      src[name] = recorder.src!
    }
    this.stopping = true
    try {
      this.src = src
    } finally {
      this.stopping = false
    }
    this.hasRecording = true
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
  private get firstPlayer() {
    return this.players[Object.keys(this.players)[0]]
  }
  public get currentTime() {
    return this.firstPlayer.currentTime
  }
  public set currentTime(currentTime: number) {
    for (const player of Object.values(this.players)) {
      player.currentTime = currentTime
    }
  }
  public get playbackRate() {
    return this.firstPlayer.playbackRate
  }
  public set playbackRate(playbackRate: number) {
    for (const player of Object.values(this.players)) {
      player.playbackRate = playbackRate
    }
  }
  public get duration() {
    return this.firstPlayer.duration
  }
  public get percent() {
    return (this.currentTime / this.duration) * 100
  }
  public set percent(percent: number) {
    this.currentTime = (this.duration * percent) / 100
  }
  public set src(src: Record<string, AceTrace> | undefined) {
    if (!this.stopping && (this.state === "playing" || this.state === "recording")) {
      throw new Error("Can't change src while playing or recording")
    }
    this._src = src
    for (const [name, player] of Object.entries(this.players)) {
      player.src = src?.[name]
    }
    this.state = "paused"
    this.hasRecording = false
  }
  public get src() {
    if (this.state === "recording") {
      throw new Error("Still recording")
    }
    return this._src
  }
}

namespace AceMultiRecordReplayer {
  export type Options = {
    filterRecord?: (record: AceRecord, name: string) => boolean
    replayEditors?: Record<string, Ace.Editor>
    recorderOptions?: AceRecorder.Options
  }
}

export default AceMultiRecordReplayer
