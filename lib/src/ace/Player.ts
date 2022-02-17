import ace, { Ace } from "ace-builds"
import EventEmitter from "events"
import type TypedEmitter from "typed-emitter"
import { CursorChange, Delta, ScrollChange, SelectionChange } from ".."
import { AceRecord, AceTrace, Complete, ScrollPosition } from "@cs124/ace-recorder-types"

export interface AcePlayerEvents {
  record: (record: AceRecord) => void
}
class AcePlayer extends (EventEmitter as new () => TypedEmitter<AcePlayerEvents>) {
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
  private filterRecord?: (record: AceRecord) => boolean
  public playing = false
  private _playbackRate: number
  // private _currentSession?: Ace.EditSession
  public scrollToCursor = false
  private sessionMap: Record<string, Ace.EditSession> = {}

  public constructor(editor: Ace.Editor, options?: AcePlayer.Options) {
    super()
    this.editor = editor
    this.filterRecord = options?.filterRecord

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
      const offset = new Date(record.timestamp).valueOf() - new Date(trace.startTime).valueOf()
      const index = Math.ceil(offset / 1000)
      if (complete) {
        this.traceIndex[index] = i
      }
      return { complete, offset }
    })

    if (this._trace.sessionName) {
      this.sessionMap = {}
      for (const { name, contents, mode } of this._trace.sessionInfo) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.sessionMap[name] = ace.createEditSession(contents, mode as any)
      }
      this.editor.setSession(this.sessionMap[this._trace.sessionName])
    }
    let lastIndex = 0
    for (let i = 0; i < Math.floor(this.traceTimes[this.endIndex - 1].offset) / 1000; i++) {
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
      const apply = this.filterRecord ? this.filterRecord(aceRecord) : true
      if (apply !== false) {
        if (Complete.guard(aceRecord) && !!aceRecord.sessionName) {
          this.editor.setSession(this.sessionMap[aceRecord.sessionName])
        }
        if (!ScrollPosition.guard(aceRecord) || !(this.scrollToCursor && aceRecord.triggeredByCursorChange)) {
          applyAceRecord(this.editor!, aceRecord, !this.scrollToCursor)
          this.emit("record", aceRecord)
        }
        if (
          (Delta.guard(aceRecord) || CursorChange.guard(aceRecord) || SelectionChange.guard(aceRecord)) &&
          this.scrollToCursor
        ) {
          this.editor.renderer.scrollCursorIntoView(this.editor.session!.selection.getCursor()!)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}

module AcePlayer {
  export type Options = {
    filterRecord?: (record: AceRecord) => boolean
  }
}
export default AcePlayer

const applyAceRecord = (editor: Ace.Editor, aceRecord: AceRecord, applyScroll = true): void => {
  if (Complete.guard(aceRecord)) {
    applyComplete(editor.session, aceRecord, applyScroll)
  } else if (Delta.guard(aceRecord)) {
    applyDelta(editor.session, aceRecord)
  } else if (SelectionChange.guard(aceRecord)) {
    applySelectionChange(editor.session, aceRecord)
  } else if (CursorChange.guard(aceRecord)) {
    applyCursorChange(editor.session, aceRecord)
  } else if (ScrollChange.guard(aceRecord)) {
    applyScrollChange(editor.renderer, aceRecord)
  }
}

const applyComplete = (session: Ace.EditSession, complete: Complete, setScroll = true): void => {
  if (session.getValue() !== complete.value) {
    safeChangeValue(session, complete.value)
  }

  const { row, column } = complete.cursor
  session.selection.moveCursorTo(row, column)

  const { start, end } = complete.selection
  session.selection.setSelectionRange({
    start: { row: start.row, column: start.column },
    end: { row: end.row, column: end.column },
  })

  if (setScroll) {
    const { top, left } = complete.scroll
    session.setScrollTop(top)
    session.setScrollLeft(left)
  }
}

const applyDelta = (session: Ace.EditSession, delta: Delta): void => session.getDocument().applyDelta(delta)

const applySelectionChange = (session: Ace.EditSession, selectionChange: SelectionChange): void =>
  session.selection.setSelectionRange(selectionChange)

const applyCursorChange = (session: Ace.EditSession, cursorChange: CursorChange): void =>
  session.selection.moveCursorTo(cursorChange.location.row, cursorChange.location.column)

const applyScrollChange = (renderer: Ace.VirtualRenderer, scrollChange: ScrollChange): void => {
  renderer.scrollToY(scrollChange.top)
  renderer.scrollToX(scrollChange.left)
}

const safeChangeValue = (session: Ace.EditSession, value: string): void => {
  const position = session.selection.toJSON()
  session.setValue(value)
  session.selection.fromJSON(position)
}
