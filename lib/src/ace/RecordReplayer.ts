import { Ace } from "ace-builds"
import EventEmitter from "events"
import { AceRecord, AceTrace, IRecordReplayer, RecordReplayerState } from "../types"
import AcePlayer from "./Player"
import AceRecorder from "./Recorder"

class AceRecordReplayer extends AcePlayer implements IRecordReplayer {
  public recorder: AceRecorder
  private _state: RecordReplayerState = "paused"
  private emitter = new EventEmitter()
  private stopping = false

  constructor(editor: Ace.Editor, options?: AceRecordReplayer.Options) {
    super(options?.replayEditor ?? editor, {
      onExternalChange: options?.onExternalChange,
    })
    this.recorder = new AceRecorder(editor)
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
  }
  public addStateListener(listener: (state: RecordReplayerState) => void) {
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
    if (src) {
      this.state = "paused"
    } else {
      this.state = "empty"
    }
  }
}

namespace AceRecordReplayer {
  export type Options = {
    onExternalChange?: (externalChange: AceRecord) => void | boolean
    replayEditor?: Ace.Editor
  }
}

export default AceRecordReplayer
