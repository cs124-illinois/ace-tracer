import ysFixWebmDuration from "fix-webm-duration"
import { MIMEType } from "whatwg-mimetype"

class AudioRecorder {
  private recorder: MediaRecorder | undefined
  private listener: (({ data }: { data: Blob }) => void) | undefined
  private started = 0
  private url: string | undefined

  private chunks: Blob[] = []
  blob: Blob | undefined

  public async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const releaseMicrophone = () => {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    try {
      this.recorder = new MediaRecorder(stream)
    } catch (err) {
      releaseMicrophone()
      throw err
    }
    this.listener = ({ data }: { data: Blob }) => {
      data && data.size > 0 && this.chunks.push(data)
    }
    this.recorder.addEventListener("dataavailable", this.listener)
    this.blob = undefined

    return new Promise<void>((resolve, reject) => {
      this.recorder!.addEventListener(
        "start",
        () => {
          this.chunks = []
          this.started = Date.now()
          resolve()
        },
        { once: true },
      )
      this.recorder!.addEventListener(
        "error",
        (event) => {
          releaseMicrophone()
          const error = (event as ErrorEvent).error
          reject(error instanceof Error ? error : new Error(`MediaRecorder failed to start: ${event.type}`))
        },
        { once: true },
      )
      try {
        this.recorder!.start(1000)
      } catch (err) {
        releaseMicrophone()
        reject(err)
      }
    })
  }
  public async stop() {
    const recorder = this.recorder
    if (!recorder) {
      throw new Error("Not recording")
    }
    return new Promise<void>((resolve, reject) => {
      recorder.addEventListener(
        "stop",
        async () => {
          try {
            const duration = Date.now() - this.started
            recorder.removeEventListener("dataavailable", this.listener!)
            for (const track of recorder.stream.getTracks()) {
              track.stop()
            }
            const blob = new Blob(this.chunks, { type: recorder.mimeType })
            const mimeType = new MIMEType(recorder.mimeType)
            this.blob = mimeType.subtype === "webm" ? await ysFixWebmDuration(blob, duration, { logger: false }) : blob
            if (this.url) {
              URL.revokeObjectURL(this.url)
            }
            this.url = URL.createObjectURL(this.blob)
            resolve()
          } catch (err) {
            reject(err)
          }
        },
        { once: true },
      )
      recorder.stop()
    })
  }
  public get src() {
    return this.url
  }
}

export default AudioRecorder
