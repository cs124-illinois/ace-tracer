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

export const injectMetadata = async function (blob: Blob): Promise<Blob> {
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

export interface AudioRecorder {
  stop: () => Promise<string | undefined>
}
export const record = async (): Promise<AudioRecorder> => {
  const audioRecorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }))
  let recording = true
  const chunks: Blob[] = []
  let resolver: (value: string) => void
  const waiter = new Promise<string>((resolve) => {
    resolver = resolve
  })
  audioRecorder.addEventListener("dataavailable", async ({ data }) => {
    const blob = await injectMetadata(data)
    chunks.push(blob)
    if (!recording) {
      resolver(window.URL.createObjectURL(new Blob(chunks)))
    }
  })
  audioRecorder.start()
  const stop = async () => {
    if (!recording || audioRecorder.state === "inactive") {
      return
    }
    recording = false
    audioRecorder.stop()
    audioRecorder.stream.getTracks()[0].stop()
    return waiter
  }
  return { stop }
}
