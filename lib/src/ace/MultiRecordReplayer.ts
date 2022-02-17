import { Ace } from "ace-builds"
import EventEmitter from "events"
import { AceRecord, AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
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
      this.players[name] = new AcePlayer(options?.replayEditors ? options.replayEditors[name] : editors[name], {
        filterRecord: (record) => (options?.filterRecord ? options.filterRecord(record, name) : true),
      })
      this.recorders[name] = new AceRecorder(editors[name])
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
    for (const name of Object.keys(this.players)) {
      await this.players[name].play()
    }
    this.state = "playing"
  }
  public pause() {
    if (this.state !== "playing") {
      throw new Error("Not playing")
    }
    for (const name of Object.keys(this.players)) {
      this.players[name].pause()
    }
    this.state = "paused"
  }
  public sync() {
    for (const name of Object.keys(this.players)) {
      this.players[name].sync()
    }
  }
  public async record() {
    if (this.state !== "paused") {
      throw new Error("Not paused")
    }
    for (const name of Object.keys(this.recorders)) {
      this.recorders[name].start()
    }
    this.state = "recording"
    this.hasRecording = true
  }
  public async stop() {
    if (this.state !== "recording") {
      throw new Error("Not recording")
    }
    this.stopping = true
    const src: Record<string, AceTrace> = {}
    for (const name of Object.keys(this.recorders)) {
      this.recorders[name].stop()
      src[name] = this.recorders[name].src!
    }
    this.src = src
    this.state = "paused"
    this.stopping = false
  }
  public addStateListener(listener: (state: IRecordReplayer.State) => void) {
    this.emitter.addListener("state", listener)
  }
  public get currentTime() {
    return this.players[Object.keys(this.players)[0]].currentTime
  }
  public set currentTime(currentTime: number) {
    for (const name of Object.keys(this.players)) {
      this.players[name].currentTime = currentTime
    }
  }
  public get playbackRate() {
    return this.players[Object.keys(this.players)[0]].playbackRate
  }
  public set playbackRate(playbackRate: number) {
    for (const name of Object.keys(this.players)) {
      this.players[name].playbackRate = playbackRate
    }
  }
  public get duration() {
    return this.players[Object.keys(this.players)[0]].duration
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
    if (src) {
      for (const name of Object.keys(src)) {
        this.players[name].src = src[name]
      }
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
  }
}

export default AceMultiRecordReplayer
