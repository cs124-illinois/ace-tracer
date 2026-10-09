import {
  AceRecord,
  AceTrace,
  Complete,
  CursorChange,
  Delta,
  ScrollChange,
  SelectionChange,
  SessionInfo,
} from "@cs124/ace-recorder-types"
import ace, { Ace } from "ace-builds"
import EventEmitter from "events"
import { TypedEmitter } from "tiny-typed-emitter"

export interface AcePlayerEvents {
  record: (record: AceRecord) => void
  ended: () => void
}
class AcePlayer extends (EventEmitter as new () => TypedEmitter<AcePlayerEvents>) {
  private _editor: Ace.Editor
  private wasVisible: boolean
  private wasBlinking: boolean
  private previousOpacity: number
  private _trace: AceTrace | undefined
  private timer?: ReturnType<typeof setTimeout>
  private startTime?: number
  private _currentTime = 0
  private syncTime?: number
  private currentIndex = 0
  private endIndex = 0
  private traceTimes: { complete: boolean; offset: number }[] = []
  private completeIndices: number[] = []
  private filterRecord?: (record: AceRecord) => boolean
  public playing = false
  private _playbackRate: number
  // private _currentSession?: Ace.EditSession
  public scrollToCursor = false
  private sessionMap: Record<string, { session: Ace.EditSession; mode: string }> = {}
  public sessionName?: string

  public constructor(editor: Ace.Editor, options?: AcePlayer.Options) {
    super()
    this._editor = editor
    this.filterRecord = options?.filterRecord

    const renderer = this._editor.renderer as any
    this.wasVisible = renderer.$cursorLayer.isVisible
    this.wasBlinking = renderer.$cursorLayer.isBlinking
    this.previousOpacity = renderer.$cursorLayer.element.style.opacity
    this._playbackRate = 1
  }
  public set src(trace: AceTrace | undefined) {
    this.stopPlayback()
    this._trace = trace
    this._currentTime = 0
    this.currentIndex = 0
    if (!trace) {
      this.endIndex = 0
      this.traceTimes = []
      this.completeIndices = []
      return
    }
    this.endIndex = trace.records.length
    this.completeIndices = []
    this.traceTimes = trace.records.map((record, i) => {
      const complete = Complete.guard(record)
      const offset = new Date(record.timestamp).valueOf() - new Date(trace.startTime).valueOf()
      if (complete) {
        this.completeIndices.push(i)
      }
      return { complete, offset }
    })

    if (trace.sessionName) {
      this.sessionMap = {}
      this.updateSessions(trace.sessionInfo)
      this.setSession(trace.sessionName)
    }
  }
  public get src() {
    return this._trace
  }

  public getSessionsInfo() {
    return Object.entries(this.sessionMap).map(([name, { session, mode }]) => {
      return { name, contents: session.getValue(), mode }
    })
  }

  // Sessions can be added or removed during a recording, so a Complete's sessionInfo may name sessions that the
  // trace-level sessionInfo (captured when recording stopped) doesn't include.
  private updateSessions(sessionInfo: SessionInfo[]) {
    for (const { name, contents, mode } of sessionInfo) {
      const existing = this.sessionMap[name]
      if (!existing) {
        this.sessionMap[name] = { session: ace.createEditSession(contents, mode as any), mode }
      } else if (name !== this.sessionName && existing.session.getValue() !== contents) {
        existing.session.setValue(contents)
      }
    }
  }

  public async play() {
    this.startPlayback()
  }
  // startPlayback and stopPlayback aren't virtual: subclasses override play() and pause() with state checks that
  // must not run when the playback rate changes or playback ends on its own.
  private startPlayback() {
    if (!this._trace) {
      throw new Error("No trace loaded")
    }
    if (this._currentTime >= this._trace.duration) {
      this._currentTime = 0
    }

    const renderer = this._editor.renderer as any
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
    }
  }

  public setSession(name: string) {
    if (!this.sessionMap[name]) {
      throw new Error(`Session ${name} does not exist`)
    }
    this.sessionName = name
    this._editor.setSession(this.sessionMap[name].session)
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
          if (aceRecord.sessionInfo) {
            this.updateSessions(aceRecord.sessionInfo)
          }
          this.setSession(aceRecord.sessionName)
        }
        if (!ScrollChange.guard(aceRecord) || !(this.scrollToCursor && aceRecord.triggeredByCursorChange)) {
          applyAceRecord(this._editor!, aceRecord, !this.scrollToCursor)
          this.emit("record", aceRecord)
        }
        if (
          (Delta.guard(aceRecord) || CursorChange.guard(aceRecord) || SelectionChange.guard(aceRecord)) &&
          this.scrollToCursor
        ) {
          this._editor.renderer.scrollCursorIntoView(this._editor.session!.selection.getCursor()!)
        }
      }
    }
    this.currentIndex = i
    if (this.playing && this.currentIndex === this.endIndex) {
      this.stopPlayback()
      this._currentTime = this._trace.duration
      this.emit("ended")
      return -1
    }
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
      this.timer = setTimeout(() => {
        this.next()
      }, nextWait)
    }
  }
  private stopPlayback(reset = true) {
    if (this.playing) {
      this._currentTime = Math.min((new Date().valueOf() - this.startTime!) * this._playbackRate, this.durationMs)
    }
    this.clearTimeout()
    const wasPlaying = this.playing
    this.playing = false

    if (reset && wasPlaying) {
      const renderer = this._editor.renderer as any
      renderer.$cursorLayer.element.style.opacity = this.previousOpacity
      renderer.$cursorLayer.setBlinking(this.wasBlinking)
      renderer.$cursorLayer.isVisible = this.wasVisible
    }
  }
  public pause(reset = true) {
    this.stopPlayback(reset)
  }
  private get durationMs() {
    return this._trace?.duration ?? 0
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
    const currentTimeMs = currentTimeSec * 1000
    this.syncTime = new Date().valueOf()
    this.startTime = this.syncTime - currentTimeMs / this.playbackRate

    // Binary search completeIndices for last Complete with offset <= currentTimeMs
    let lo = 0
    let hi = this.completeIndices.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.traceTimes[this.completeIndices[mid]].offset <= currentTimeMs) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    this.currentIndex = this.completeIndices.length > 0 ? this.completeIndices[lo] : 0
    this._currentTime = currentTimeMs
    if (this.playing) {
      // Reschedule: the pending timer was computed for the old position
      this.next(false)
    }
  }
  public get playbackRate() {
    return this._playbackRate
  }
  public set playbackRate(playbackRate: number) {
    const wasPlaying = this.playing
    if (wasPlaying) {
      this.stopPlayback(false)
    }
    this._playbackRate = playbackRate
    if (wasPlaying) {
      this.startPlayback()
    }
  }
  public get editor() {
    return this._editor
  }
}

namespace AcePlayer {
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

  const { start, end } = complete.selection
  const { row, column } = complete.cursor
  // The cursor is the selection's lead, so a cursor at the start of a non-empty range means a backwards selection
  const reverse = (start.row !== end.row || start.column !== end.column) && row === start.row && column === start.column
  session.selection.setSelectionRange(
    { start: { row: start.row, column: start.column }, end: { row: end.row, column: end.column } },
    reverse,
  )

  if (setScroll) {
    const { top, left } = complete.scroll
    session.setScrollTop(top)
    session.setScrollLeft(left)
  }
}

const applyDelta = (session: Ace.EditSession, delta: Delta): void => session.getDocument().applyDelta(delta)

const applySelectionChange = (session: Ace.EditSession, selectionChange: SelectionChange): void =>
  session.selection.setSelectionRange(selectionChange)

// Cursor changes are only recorded with an empty selection, so replaying one also clears any selection
const applyCursorChange = (session: Ace.EditSession, cursorChange: CursorChange): void => {
  const { row, column } = cursorChange.location
  session.selection.setSelectionRange({ start: { row, column }, end: { row, column } })
}

const applyScrollChange = (renderer: Ace.VirtualRenderer, scrollChange: ScrollChange): void => {
  renderer.scrollToY(scrollChange.top)
  renderer.scrollToX(scrollChange.left)
}

const safeChangeValue = (session: Ace.EditSession, value: string): void => {
  const position = session.selection.toJSON()
  session.setValue(value)
  session.selection.fromJSON(position)
}
