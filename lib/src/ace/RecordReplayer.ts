import { Ace } from "ace-builds"
import EventEmitter from "events"
import { AceRecord, AceTrace, IRecordReplayer } from "../types"
import AcePlayer from "./Player"
import AceRecorder from "./Recorder"

class AceRecordReplayer extends AcePlayer implements IRecordReplayer {
  public recorder: AceRecorder
  private _state: IRecordReplayer.State = "paused"
  private emitter = new EventEmitter()
  private stopping = false
  public hasRecording = false

  constructor(editor: Ace.Editor, options?: AceRecordReplayer.Options) {
    super(options?.replayEditor ?? editor, {
      filterRecord: options?.filterRecord,
    })
    this.recorder = new AceRecorder(editor)
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
    this.stopping = true
    this.src = this.recorder!.src!
    this.state = "paused"
    this.stopping = false
    this.hasRecording = true
  }
  public addStateListener(listener: (state: IRecordReplayer.State) => void) {
    this.emitter.addListener("state", listener)
  }
  public get percent() {
    return (this.currentTime / this.duration) * 100
  }
  public set percent(percent: number) {
    this.currentTime = (this.duration * percent) / 100
  }
  public set src(src: AceTrace | undefined) {
    if (!this.stopping && (this.state === "playing" || this.state === "recording")) {
      throw new Error("Can't change src while playing or recording")
    }
    super.src = src
    this.state = "paused"
    this.hasRecording = false
  }
  public get src() {
    if (this.state === "recording") {
      throw new Error("Still recording")
    }
    return super.src
  }
}

namespace AceRecordReplayer {
  export type Options = {
    filterRecord?: (record: AceRecord) => boolean
    replayEditor?: Ace.Editor
  }
}

export default AceRecordReplayer
