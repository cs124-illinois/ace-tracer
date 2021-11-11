import EventEmitter from "event-emitter"
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

export const urlToBase64 = async (url: string): Promise<string | undefined> => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve, _) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result?.toString())
    reader.readAsDataURL(blob)
  })
}

export type RecordReplayerState = "loading" | "blank" | "recording" | "recorded" | "playing"
export type RecordReplayStateChangeListener = (state: RecordReplayerState) => void
export interface RecordReplayer {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  startPlaying: () => void
  stopPlaying: () => void
  clear: () => void
  events: EventEmitter.Emitter
  getAudio: () => Promise<string | undefined>
}

export const recordreplayer = (): RecordReplayer => {
  let url: string | undefined
  let recorder: AudioRecorder | undefined
  let state: RecordReplayerState
  let replayer: HTMLAudioElement | undefined

  const events = EventEmitter()

  const setState = (newState: RecordReplayerState) => {
    state = newState
    events.emit("state", state)
  }
  setState("blank")

  const startRecording = async () => {
    if (recorder) {
      throw new Error("Recorder is still running")
    }
    recorder = await record()
    setState("recording")
  }
  const stopRecording = async () => {
    if (!recorder) {
      throw new Error("Recorder was not started")
    }
    url = await recorder.stop()
    recorder = undefined
    setState("recorded")
    events.emit("content", url)
  }

  const stopPlaying = () => {
    if (!replayer) {
      throw new Error("Replayer was not started")
    }
    replayer.pause()
    replayer = undefined
    setState("recorded")
  }
  const startPlaying = () => {
    if (!url) {
      throw new Error("Recording not available")
    }
    if (replayer) {
      throw new Error("Replayer is still running")
    }
    replayer = new Audio(url)
    replayer.play()
    replayer.addEventListener("ended", () => {
      stopPlaying()
    })
    setState("playing")
  }

  const clear = () => {
    replayer && replayer.pause()
    replayer = undefined
    url = undefined
    setState("blank")
  }

  const getAudio = async () => {
    return url ? urlToBase64(url) : undefined
  }

  return {
    startRecording,
    stopRecording,
    startPlaying,
    stopPlaying,
    clear,
    events,
    getAudio,
  }
}
