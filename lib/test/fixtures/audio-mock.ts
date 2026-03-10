type EventHandler = (...args: any[]) => void

export class MockAudioElement {
  private _listeners: Record<string, EventHandler[]> = {}
  private _src = ""
  private _currentTime = 0
  private _duration = 0
  private _playbackRate = 1
  private _paused = true

  get src() {
    return this._src
  }
  set src(value: string) {
    this._src = value
  }
  get currentTime() {
    return this._currentTime
  }
  set currentTime(value: number) {
    this._currentTime = value
  }
  get duration() {
    return this._duration
  }
  set duration(value: number) {
    this._duration = value
  }
  get playbackRate() {
    return this._playbackRate
  }
  set playbackRate(value: number) {
    this._playbackRate = value
  }
  get paused() {
    return this._paused
  }

  async play() {
    this._paused = false
    this.fireEvent("playing")
  }
  pause() {
    this._paused = true
    this.fireEvent("pause")
  }
  load() {}

  addEventListener(event: string, handler: EventHandler, options?: { once?: boolean }) {
    if (!this._listeners[event]) this._listeners[event] = []
    if (options?.once) {
      const wrapped = (...args: any[]) => {
        handler(...args)
        this.removeEventListener(event, wrapped)
      }
      this._listeners[event].push(wrapped)
    } else {
      this._listeners[event].push(handler)
    }
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }

  fireEvent(event: string, ...args: any[]) {
    for (const handler of [...(this._listeners[event] || [])]) {
      handler(...args)
    }
  }
}

export class MockMediaRecorder {
  private _listeners: Record<string, EventHandler[]> = {}
  public state: "inactive" | "recording" | "paused" = "inactive"
  public mimeType = "audio/webm"
  public stream: { getTracks: () => { stop: () => void }[] }

  constructor() {
    this.stream = {
      getTracks: () => [{ stop: () => {} }],
    }
  }

  start() {
    this.state = "recording"
    setTimeout(() => this.fireEvent("start"), 0)
  }
  stop() {
    this.state = "inactive"
    this.fireEvent("dataavailable", { data: new Blob(["fake-audio"], { type: this.mimeType }) })
    setTimeout(() => this.fireEvent("stop"), 0)
  }

  addEventListener(event: string, handler: EventHandler, options?: { once?: boolean }) {
    if (!this._listeners[event]) this._listeners[event] = []
    if (options?.once) {
      const wrapped = (...args: any[]) => {
        handler(...args)
        this.removeEventListener(event, wrapped)
      }
      this._listeners[event].push(wrapped)
    } else {
      this._listeners[event].push(handler)
    }
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }

  private fireEvent(event: string, ...args: any[]) {
    for (const handler of [...(this._listeners[event] || [])]) {
      handler(...args)
    }
  }
}

export function installAudioMocks() {
  ;(globalThis as any).MediaRecorder = MockMediaRecorder
  ;(globalThis.navigator as any).mediaDevices = {
    getUserMedia: async () => ({
      getTracks: () => [{ stop: () => {} }],
    }),
  }
}
