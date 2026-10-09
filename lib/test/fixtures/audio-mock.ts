import { afterEach, beforeEach } from "bun:test"
import { generateSilentWav, wavDuration } from "./wav-generator"
import { webmDuration, webmWithoutDuration } from "./webm"

// Browser audio stand-ins. happy-dom's <audio> never loads media, so its duration stays NaN. MockAudioElement reads
// the duration from the WAV or WebM bytes behind its src and fires loadedmetadata, the way a browser does.

export class MockMediaStreamTrack {
  public readyState: "live" | "ended" = "live"
  stop() {
    this.readyState = "ended"
  }
}

export class MockMediaStream {
  private tracks = [new MockMediaStreamTrack()]
  getTracks() {
    return [...this.tracks]
  }
}

export type AudioMockOptions = {
  // The recording's container. WAV recordings carry their duration; WebM ones don't until fix-webm-duration patches
  // the file, as with Chrome's MediaRecorder. Any other type produces bytes the mock <audio> can't decode.
  mimeType?: "audio/wav" | "audio/webm" | string
  // Milliseconds of audio missing from a WAV recording, as when the encoder drops data
  lostMs?: number
  // Fire "error" instead of "start" when recording starts
  failStart?: boolean
}

let options: AudioMockOptions = {}
// Blobs behind object URLs, since happy-dom can't fetch blob: URLs
const blobs = new Map<string, Blob>()

export class MockMediaRecorder extends EventTarget {
  public static instances: MockMediaRecorder[] = []

  public state: "inactive" | "recording" | "paused" = "inactive"
  public mimeType: string
  public stream: MockMediaStream
  public timeslice?: number
  private startedAt = 0

  constructor(stream: MockMediaStream) {
    super()
    this.stream = stream
    this.mimeType = options.mimeType ?? "audio/wav"
    MockMediaRecorder.instances.push(this)
  }

  start(timeslice?: number) {
    this.timeslice = timeslice
    this.state = "recording"
    setTimeout(() => {
      if (options.failStart) {
        this.state = "inactive"
        this.dispatchEvent(new Event("error"))
        return
      }
      this.startedAt = Date.now()
      this.dispatchEvent(new Event("start"))
    }, 0)
  }
  // The recording is as long as the recorder ran. Like MediaRecorder, the final dataavailable comes before stop.
  stop() {
    const durationMs = Date.now() - this.startedAt
    this.state = "inactive"
    const data =
      this.mimeType === "audio/wav"
        ? generateSilentWav(Math.max(durationMs - (options.lostMs ?? 0), 0), 1000)
        : new Blob([this.mimeType === "audio/webm" ? webmWithoutDuration() : "undecodable"], { type: this.mimeType })
    setTimeout(() => {
      this.dispatchEvent(Object.assign(new Event("dataavailable"), { data }))
      this.dispatchEvent(new Event("stop"))
    }, 0)
  }
}

export class MockAudioElement extends EventTarget {
  public static instances: MockAudioElement[] = []

  private _src = ""
  private _duration = NaN
  private loads = 0
  public currentTime = 0
  public playbackRate = 1
  public defaultPlaybackRate = 1
  public paused = true
  public ended = false
  public readyState = 0

  constructor() {
    super()
    MockAudioElement.instances.push(this)
  }

  get src() {
    return this._src
  }
  // Like a browser, setting src starts loading it
  set src(value: string) {
    this._src = value
    this.load()
  }
  get duration() {
    return this._duration
  }

  async play() {
    if (!this.paused) {
      return
    }
    this.paused = false
    this.ended = false
    this.dispatchEvent(new Event("play"))
    this.dispatchEvent(new Event("playing"))
  }
  pause() {
    if (this.paused) {
      return
    }
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  }
  // Like the media element load algorithm: resets playback state, then metadata arrives asynchronously. A later load
  // supersedes one still in progress.
  load() {
    const load = ++this.loads
    this.paused = true
    this.playbackRate = this.defaultPlaybackRate
    this.ended = false
    this.currentTime = 0
    this._duration = NaN
    this.readyState = 0
    if (this._src === "") {
      return
    }
    this.dispatchEvent(new Event("emptied"))
    void readMedia(this._src).then((bytes) => {
      if (load !== this.loads) {
        return
      }
      const duration = bytes && (wavDuration(bytes) ?? webmDuration(bytes))
      if (duration === undefined) {
        this.dispatchEvent(new Event("error"))
        return
      }
      this._duration = duration
      this.readyState = 1
      this.dispatchEvent(new Event("durationchange"))
      this.dispatchEvent(new Event("loadedmetadata"))
    })
  }

  // Advance playback the way the browser's media clock does: timeupdate, then at the end pause and ended
  advanceTo(seconds: number) {
    this.currentTime = Math.min(seconds, this._duration)
    this.dispatchEvent(new Event("timeupdate"))
    if (this.currentTime >= this._duration && !this.paused) {
      this.paused = true
      this.ended = true
      this.dispatchEvent(new Event("pause"))
      this.dispatchEvent(new Event("ended"))
    }
  }
}

const readMedia = async (src: string): Promise<Uint8Array | undefined> => {
  const blob = blobs.get(src)
  if (blob) {
    return new Uint8Array(await blob.arrayBuffer())
  }
  const match = /^data:[^;,]*;base64,(.*)$/.exec(src)
  return match ? new Uint8Array(Buffer.from(match[1], "base64")) : undefined
}

// Resolves once the element has metadata, or rejects if it failed to load
export const loadedMetadata = (element: { readyState: number; addEventListener: EventTarget["addEventListener"] }) =>
  new Promise<void>((resolve, reject) => {
    if (element.readyState > 0) {
      resolve()
      return
    }
    element.addEventListener("loadedmetadata", () => resolve(), { once: true })
    element.addEventListener("error", () => reject(new Error("Audio failed to load")), { once: true })
  })

type Saved = {
  MediaRecorder: unknown
  Audio: unknown
  mediaDevices: PropertyDescriptor | undefined
  createObjectURL: typeof URL.createObjectURL
  revokeObjectURL: typeof URL.revokeObjectURL
}
let saved: Saved | undefined

// Replaces MediaRecorder, getUserMedia, and Audio with the mocks above. Calling it again while installed only
// changes the options. Bun runs every test file in one global scope, so call restoreAudioMocks() when done.
export function installAudioMocks(mockOptions: AudioMockOptions = {}) {
  options = mockOptions
  if (saved) {
    return restoreAudioMocks
  }
  const g = globalThis as any
  saved = {
    MediaRecorder: g.MediaRecorder,
    Audio: g.Audio,
    mediaDevices: Object.getOwnPropertyDescriptor(g.navigator, "mediaDevices"),
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  }
  const { createObjectURL, revokeObjectURL } = saved
  g.MediaRecorder = MockMediaRecorder
  g.Audio = MockAudioElement
  Object.defineProperty(g.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => new MockMediaStream() },
  })
  URL.createObjectURL = (blob: Blob) => {
    const url = createObjectURL.call(URL, blob)
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    blobs.delete(url)
    revokeObjectURL.call(URL, url)
  }
  return restoreAudioMocks
}

export function restoreAudioMocks() {
  if (!saved) {
    return
  }
  const g = globalThis as any
  g.MediaRecorder = saved.MediaRecorder
  g.Audio = saved.Audio
  if (saved.mediaDevices) {
    Object.defineProperty(g.navigator, "mediaDevices", saved.mediaDevices)
  } else {
    delete g.navigator.mediaDevices
  }
  URL.createObjectURL = saved.createObjectURL
  URL.revokeObjectURL = saved.revokeObjectURL
  saved = undefined
  options = {}
  blobs.clear()
  MockMediaRecorder.instances = []
  MockAudioElement.instances = []
}

// Installs the mocks before each test in the enclosing describe (or file) and restores them after
export function useAudioMocks(mockOptions: AudioMockOptions = {}) {
  beforeEach(() => {
    installAudioMocks(mockOptions)
  })
  afterEach(() => {
    restoreAudioMocks()
  })
}
