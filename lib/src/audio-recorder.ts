import EventEmitter from "events"
import { Decoder, Reader, tools } from "ts-ebml"

const readAsArrayBuffer = function (blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(blob)
    reader.onloadend = () => {
      resolve(reader.result as ArrayBuffer)
    }
    reader.onerror = (err) => {
      reject(err)
    }
  })
}

const injectMetadata = async function (blob: Blob): Promise<Blob> {
  const decoder = new Decoder()
  const reader = new Reader()
  reader.logging = false
  reader.drop_default_duration = false

  const buffer = await readAsArrayBuffer(blob)
  const elms = decoder.decode(buffer)
  elms.forEach((elm) => {
    reader.read(elm)
  })
  reader.stop()
  const refinedMetadataBuf = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues)
  const body = buffer.slice(reader.metadataSize)
  const result_1 = new Blob([refinedMetadataBuf, body], { type: blob.type })
  return result_1
}

export class AudioRecorder {
  private audioRecorder: MediaRecorder | undefined
  recording = false
  private chunks: Blob[] = []
  private resolver: (value: string) => void = () => {}
  private waiter: Promise<string | undefined> = new Promise((resolve) => {
    resolve(undefined)
  })

  public async start() {
    this.audioRecorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }))
    this.recording = true
    this.chunks = []
    this.waiter = new Promise<string | undefined>((resolve) => {
      this.resolver = resolve
    })
    this.audioRecorder.addEventListener("dataavailable", async ({ data }) => {
      const blob = await injectMetadata(data)
      this.chunks.push(blob)
      if (!this.recording) {
        this.resolver(window.URL.createObjectURL(new Blob(this.chunks)))
      }
    })

    let resolver: (value: unknown) => void
    const waitForStart = new Promise((resolve) => {
      resolver = resolve
    })
    const listener = () => {
      resolver(undefined)
    }
    this.audioRecorder?.addEventListener("start", listener)
    this.audioRecorder.start()
    return waitForStart
  }
  public async stop(): Promise<string | undefined> {
    if (!this.recording || !this.audioRecorder || this.audioRecorder.state === "inactive") {
      return undefined
    }
    this.recording = false
    this.audioRecorder.stop()
    this.audioRecorder.stream.getTracks()[0].stop()

    return this.waiter
  }
}

export const urlToBase64 = async (url: string): Promise<string> => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve, _) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result!.toString().split(",")[1])
    reader.readAsDataURL(blob)
  })
}

export class AudioRecordReplayer extends EventEmitter {
  private recorder = new AudioRecorder()
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
  public async startRecording() {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Still playing or recording")
    }
    await this.recorder.start()
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
  }
  public async stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    const recording = await this.recorder.stop()
    this.setPlayer()
    this.player!.src = recording || ""

    let resolver: (value: unknown) => void
    const waitForDuration = new Promise((resolve) => {
      resolver = resolve
    })
    const listener = () => {
      resolver(undefined)
    }
    this.player?.addEventListener("loadeddata", listener)
    this.player!.load()
    await waitForDuration
    this.player?.removeEventListener("loadeddata", listener)

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
    this.state = src === "" ? "empty" : "paused"
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
  export type State = "empty" | "paused" | "recording" | "playing"
}