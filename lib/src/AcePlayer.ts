import { Ace } from "ace-builds"
import { AceRecord, AceTrace, applyAceRecord, Complete, ScrollPosition } from "."

export class AcePlayer {
  private editor: Ace.Editor
  private wasVisible: boolean
  private wasBlinking: boolean
  private previousOpacity: number
  private _trace: AceTrace | undefined
  private timer?: ReturnType<typeof setTimeout>
  private timerStarted: number | undefined
  private startTime?: number
  private _currentTime = 0
  private syncTime?: number
  private currentIndex = 0
  private endIndex = 0
  private traceTimes: { complete: boolean; offset: number }[] = []
  private traceIndex: Record<number, number> = {}
  private onExternalChange?: (externalChange: AceRecord) => boolean | void
  private getSession?: (name: string) => Ace.EditSession
  public playing = false
  private _playbackRate: number
  private _currentSession?: Ace.EditSession
  private _scrollToCursor = false

  public constructor(editor: Ace.Editor, options?: AcePlayer.Options) {
    this.editor = editor
    this.onExternalChange = options?.onExternalChange
    this.getSession = options?.getSession

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = this.editor.renderer as any
    this.wasVisible = renderer.$cursorLayer.isVisible
    this.wasBlinking = renderer.$cursorLayer.isBlinking
    this.previousOpacity = renderer.$cursorLayer.element.style.opacity
    this._playbackRate = 1
  }
  public set src(trace: AceTrace | undefined) {
    if (!trace) {
      this._trace = trace
      return
    }
    this._trace = trace
    this.endIndex = trace.records.length
    this.traceTimes = this._trace.records.map((record, i) => {
      const complete = Complete.guard(record)
      const offset = new Date(record.timestamp).valueOf() - trace.startTime.valueOf()
      const index = Math.ceil(offset / 1000)
      if (complete) {
        this.traceIndex[index] = i
      }
      return { complete, offset }
    })
    if (!this._trace.sessionChanges) {
      this._currentSession = this.editor.session
    }
    let lastIndex = 0
    for (var i = 0; i < Math.floor(this.traceTimes[this.endIndex - 1].offset) / 1000; i++) {
      if (this.traceIndex[i]) {
        lastIndex = i
      } else {
        this.traceIndex[i] = lastIndex
      }
    }
  }
  public get src() {
    return this._trace
  }
  public async play() {
    if (!this._trace) {
      throw new Error("No trace loaded")
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = this.editor.renderer as any
    renderer.$cursorLayer.isVisible = true
    renderer.$cursorLayer.setBlinking(true)
    renderer.$cursorLayer.element.style.opacity = 1

    this.currentTime = this._currentTime / 1000
    this.syncTime = new Date().valueOf()
    this.startTime = this.syncTime - this._currentTime / this.playbackRate
    this.playing = true
    this.next(false)
  }
  private clearTimeout() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.timerStarted = undefined
    }
  }
  public sync() {
    if (!this._trace) {
      throw new Error("Can't sync without trace")
    }
    let nextWait = -1
    let i
    for (i = this.currentIndex; i < this.endIndex; i++) {
      nextWait = this.startTime! + this.traceTimes[i].offset / this.playbackRate - this.syncTime!
      if (nextWait > 0) {
        break
      }
      const aceRecord = this._trace.records[i]
      let apply: boolean = true
      if (this.onExternalChange) {
        apply = this.onExternalChange(aceRecord) ?? true
      }
      if (apply !== false) {
        if (Complete.guard(aceRecord) && !!aceRecord.sessionName) {
          this._currentSession = this.getSession!(aceRecord.sessionName)
        }
        if (!(this._scrollToCursor && ScrollPosition.guard(aceRecord))) {
          applyAceRecord(this._currentSession!, aceRecord, !this._scrollToCursor)
        }
        if (this._scrollToCursor) {
          this.editor.renderer.scrollCursorIntoView(this._currentSession?.selection.getCursor()!)
        }
      }
    }
    if (this.playing && this.currentIndex === this.endIndex) {
      this.playing = false
    }
    this.currentIndex = i
    return nextWait
  }
  private next(sync = true) {
    if (!this._trace) {
      throw new Error("Timer shouldn't fire when trace is empty")
    }
    if (!this.playing) {
      return
    }
    this.clearTimeout()
    const now = new Date().valueOf()
    if (sync) {
      this.syncTime = now
      this._currentTime = (now - this.startTime!) * this._playbackRate
    }

    const nextWait = this.sync()
    if (nextWait > 0) {
      this.timerStarted = new Date().valueOf()
      this.timer = setTimeout(() => {
        this.next()
      }, nextWait)
    }
  }
  public pause(reset = true) {
    if (this.timerStarted) {
      this._currentTime += (new Date().valueOf() - this.timerStarted) * this.playbackRate
    }
    this.clearTimeout()
    this.playing = false

    if (reset) {
      const renderer = this.editor.renderer as any
      renderer.$cursorLayer.element.style.opacity = this.previousOpacity
      renderer.$cursorLayer.setBlinking(this.wasBlinking)
      renderer.$cursorLayer.isVisible = this.wasVisible
    }
  }
  public get duration() {
    return this._trace!.duration / 1000
  }
  public get currentTime() {
    if (this.playing) {
      return ((new Date().valueOf() - this.startTime!) * this.playbackRate) / 1000
    } else {
      return this._currentTime / 1000
    }
  }
  public set currentTime(currentTimeSec: number) {
    if (currentTimeSec < 0 || currentTimeSec > this.duration + 0.1) {
      throw new Error(`Bad timestamp: ${currentTimeSec}`)
    }
    const currentTime = currentTimeSec * 1000
    this.syncTime = new Date().valueOf()
    this.startTime = this.syncTime - currentTime / this.playbackRate
    let newCurrentIndex = -1
    const floorValue = Math.floor(currentTimeSec)
    const startIndex = this.traceIndex[floorValue]
    if (startIndex === undefined) {
      throw new Error(`Couldn't find index for ${floorValue}: ${currentTimeSec}`)
    }
    if (this.traceTimes[startIndex].offset > currentTime) {
      throw new Error(`Bad index value: ${startIndex}`)
    }
    for (let i = startIndex; i < this.traceTimes.length; i++) {
      const traceTime = this.traceTimes[i]
      if (traceTime.complete) {
        if (traceTime.offset > currentTime) {
          break
        }
        newCurrentIndex = i
      }
    }
    this.currentIndex = newCurrentIndex
    this._currentTime = currentTime
  }
  public get playbackRate() {
    return this._playbackRate
  }
  public set playbackRate(playbackRate: number) {
    const wasPlaying = this.playing
    if (this.playing) {
      this.pause(false)
    }
    this._playbackRate = playbackRate
    if (wasPlaying) {
      this.play()
    }
  }
  public set scrollToCursor(scrollToCursor: boolean) {
    this._scrollToCursor = scrollToCursor
  }
  public get scrollToCursor() {
    return this._scrollToCursor
  }
}

export module AcePlayer {
  export type Options = {
    onExternalChange?: (externalChange: AceRecord) => boolean | void
    getSession?: (name: string) => Ace.EditSession
  }
}
