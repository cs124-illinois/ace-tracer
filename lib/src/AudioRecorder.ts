import ysFixWebmDuration from "fix-webm-duration"
import MimeType from "whatwg-mimetype"

// import { Decoder, Reader, tools } from "ts-ebml"

export class AudioRecorder {
  private recorder: MediaRecorder | undefined
  private listener: (({ data }: { data: Blob }) => void) | undefined
  private started: number = 0

  private chunks: Blob[] = []
  blob: Blob | undefined

  public async start() {
    this.recorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }))
    this.listener = ({ data }: { data: Blob }) => {
      data && data.size > 0 && this.chunks.push(data)
    }
    this.recorder.addEventListener("dataavailable", this.listener)
    this.blob = undefined

    return new Promise<void>((resolve, reject) => {
      this.blob = undefined
      this.recorder!.addEventListener(
        "start",
        () => {
          this.chunks = []
          this.started = Date.now()
          resolve()
        },
        { once: true }
      )
      this.recorder!.addEventListener("error", reject, { once: true })
      this.recorder!.start(1000)
    })
  }
  public async stop() {
    return new Promise<void>((resolve) => {
      this.recorder!.addEventListener(
        "stop",
        async () => {
          const duration = Date.now() - this.started
          this.recorder!.removeEventListener("dataavailable", this.listener!)
          this.recorder!.stream.getTracks()[0].stop()
          this.blob = new Blob(this.chunks, { type: this.recorder!.mimeType })
          const mimeType = new MimeType(this.recorder!.mimeType)
          if (mimeType.subtype === "webm") {
            this.blob = await ysFixWebmDuration(new Blob(this.chunks, { type: this.recorder!.mimeType }), duration, {
              logger: false,
            })
          }
          // this.blob = await injectMetadata(new Blob(this.chunks, { type: "audio/webm" }))
          resolve()
        },
        { once: true }
      )
      this.recorder!.stop()
    })
  }
  public get src() {
    return this.blob && URL.createObjectURL(this.blob)
  }
  public get base64() {
    return urlToBase64(this.src!)
  }
}

const urlToBase64 = async (url: string): Promise<string> => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve, _) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result!.toString().split(",")[1])
    reader.readAsDataURL(blob)
  })
}

/*
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
    return new Promise<AudioRecorder>((resolve, reject) => {
      this.audioRecorder!.addEventListener("start", () => resolve(this), { once: true })
      this.audioRecorder!.addEventListener("error", reject, { once: true })
      this.audioRecorder!.start(1000)
    })
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
*/
