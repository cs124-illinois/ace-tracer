import ysFixWebmDuration from "fix-webm-duration"
import MimeType from "whatwg-mimetype"

class AudioRecorder {
  private recorder: MediaRecorder | undefined
  private listener: (({ data }: { data: Blob }) => void) | undefined
  private started = 0

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
}

export default AudioRecorder
