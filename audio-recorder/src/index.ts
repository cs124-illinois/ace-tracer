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
  private waiter: Promise<string> = new Promise((resolve) => {
    resolve("")
  })

  public async start() {
    this.audioRecorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }))
    this.recording = true
    this.chunks = []
    this.waiter = new Promise<string>((resolve) => {
      this.resolver = resolve
    })
    this.audioRecorder.addEventListener("dataavailable", async ({ data }) => {
      const blob = await injectMetadata(data)
      this.chunks.push(blob)
      if (!this.recording) {
        this.resolver(window.URL.createObjectURL(new Blob(this.chunks)))
      }
    })
    try {
      this.audioRecorder.start()
    } catch (err) {
      console.log(err)
    }
  }
  public async stop() {
    if (!this.recording || !this.audioRecorder || this.audioRecorder.state === "inactive") {
      return ""
    }
    this.recording = false
    this.audioRecorder.stop()
    this.audioRecorder.stream.getTracks()[0].stop()

    return this.waiter
  }
}

export const urlToBase64 = async (url: string): Promise<string | undefined> => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve, _) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result?.toString())
    reader.readAsDataURL(blob)
  })
}

export class RecordReplayer extends EventEmitter {
  private recorder = new AudioRecorder()
  private player: HTMLAudioElement | undefined
  private _state: RecordReplayer.State = "empty"

  public constructor() {
    super()
    this.emit("state", "empty")
  }
  public get state() {
    return this._state
  }
  private set state(state: RecordReplayer.State) {
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
      this.pause()
    })
  }
  public async stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    const url = await this.recorder.stop()
    this.setPlayer()
    this.player!.src = url
    if (url !== "") {
      this.state = "paused"
      this.emit("content", url)
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
  public play() {
    if (this._state !== "paused") {
      throw new Error("No content or already playing or recording")
    }
    this.setPlayer()
    this.player!.play()
    this.state = "playing"
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
    this.state = src === "" ? "empty" : "paused"
  }
  public get duration() {
    if (this._state === "empty") {
      throw new Error("No audio loaded")
    }
    return this.player!.duration
  }
  public async srcBase64() {
    if (!this.player || this.player.src === "") {
      throw new Error("Source is empty")
    }
    return await urlToBase64(this.player.src)
  }
}

export namespace RecordReplayer {
  export type State = "empty" | "paused" | "recording" | "playing"
}
