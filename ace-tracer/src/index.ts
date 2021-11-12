import type { Ace } from "ace-builds"
import EventEmitter from "events"
import {
  Array,
  Boolean,
  InstanceOf,
  Literal,
  Number,
  Partial,
  Record as RuntypeRecord,
  Static,
  String,
  Union,
} from "runtypes"
import { throttle } from "throttle-debounce"

export const AceTimestamp = Union(
  InstanceOf(Date),
  String.withConstraint((s) => !isNaN(Date.parse(s).valueOf()))
)
export type AceTimestamp = Static<typeof AceTimestamp>

export const EditorLocation = RuntypeRecord({
  row: Number,
  column: Number,
})
export type EditorLocation = Static<typeof EditorLocation>

export const compareEditorLocations = (first: EditorLocation, second: EditorLocation): boolean =>
  first.column === second.column && first.row === second.row

export const Complete = RuntypeRecord({
  type: Literal("complete"),
  timestamp: AceTimestamp,
  focused: Boolean,
  value: String,
  selection: RuntypeRecord({
    start: EditorLocation,
    end: EditorLocation,
  }),
  cursor: EditorLocation,
  scroll: RuntypeRecord({
    top: Number,
    left: Number,
  }),
})
export type Complete = Static<typeof Complete>

export const getComplete = (editor: Ace.Editor): Complete =>
  Complete.check({
    type: "complete",
    timestamp: new Date(),
    focused: editor.isFocused(),
    value: editor.getValue(),
    selection: editor.selection.getRange(),
    cursor: editor.selection.getCursor(),
    scroll: {
      top: editor.renderer.getScrollTop(),
      left: editor.renderer.getScrollLeft(),
    },
  })

export const applyComplete = (editor: Ace.Editor, complete: Complete, valueOnly = false): void => {
  if (editor.getValue() !== complete.value) {
    safeChangeValue(editor, complete.value)
  }
  if (valueOnly) {
    return
  }
  const { row, column } = complete.cursor
  editor.selection.moveCursorTo(row, column)

  const { start, end } = complete.selection
  editor.selection.setSelectionRange({
    start: { row: start.row, column: start.column },
    end: { row: end.row, column: end.column },
  })

  const { top, left } = complete.scroll
  editor.renderer.scrollToY(top)
  editor.renderer.scrollToX(left)
}

export const Delta = RuntypeRecord({
  type: Literal("delta"),
  timestamp: AceTimestamp,
  focused: Boolean,
  start: EditorLocation,
  end: EditorLocation,
  action: Union(Literal("insert"), Literal("remove")),
  lines: Array(String),
}).And(
  Partial({
    id: Number,
  })
)
export type Delta = Static<typeof Delta>

export const applyDelta = (editor: Ace.Editor, delta: Delta): void => editor.session.getDocument().applyDelta(delta)

export const Selection = RuntypeRecord({
  start: EditorLocation,
  end: EditorLocation,
})
export type Selection = Static<typeof Selection>

export const compareSelections = (first: Selection, second: Selection): boolean =>
  compareEditorLocations(first.start, second.start) && compareEditorLocations(first.end, second.end)

export const selectionIsEmpty = (selection: Selection): boolean =>
  selection.start.column === selection.end.column && selection.start.row === selection.end.row

export const SelectionChange = RuntypeRecord({
  type: Literal("selectionchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  start: EditorLocation,
  end: EditorLocation,
})
export type SelectionChange = Static<typeof SelectionChange>

export const applySelectionChange = (editor: Ace.Editor, selectionChange: SelectionChange): void =>
  editor.selection.setSelectionRange(selectionChange)

export const CursorChange = RuntypeRecord({
  type: Literal("cursorchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  location: EditorLocation,
})
export type CursorChange = Static<typeof CursorChange>

export const applyCursorChange = (editor: Ace.Editor, cursorChange: CursorChange): void =>
  editor.selection.moveCursorTo(cursorChange.location.row, cursorChange.location.column)

export const ScrollPosition = RuntypeRecord({
  top: Number,
  left: Number,
})
export type ScrollPosition = Static<typeof ScrollPosition>

export const ScrollChange = RuntypeRecord({
  type: Literal("scrollchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  top: Number,
  left: Number,
})
export type ScrollChange = Static<typeof ScrollChange>

export const applyScrollChange = (editor: Ace.Editor, scrollChange: ScrollChange): void => {
  editor.renderer.scrollToY(scrollChange.top)
  editor.renderer.scrollToX(scrollChange.left)
}

export const WindowSize = RuntypeRecord({
  top: Number,
  bottom: Number,
})
export type WindowSize = Static<typeof WindowSize>

export const WindowSizeChange = RuntypeRecord({
  type: Literal("windowsizechange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  top: Number,
  bottom: Number,
})
export type WindowSizeChange = Static<typeof WindowSizeChange>

export const ExternalChange = RuntypeRecord({
  type: Literal("external"),
  timestamp: AceTimestamp,
})
export type ExternalChange = Static<typeof ExternalChange>

export const AceRecord = Union(
  Complete,
  Delta,
  SelectionChange,
  CursorChange,
  ScrollChange,
  WindowSizeChange,
  ExternalChange
)
export type AceRecord = Static<typeof AceRecord>

export const applyAceRecord = (editor: Ace.Editor, aceRecord: AceRecord): void => {
  if (Complete.guard(aceRecord)) {
    applyComplete(editor, aceRecord)
  } else if (Delta.guard(aceRecord)) {
    applyDelta(editor, aceRecord)
  } else if (SelectionChange.guard(aceRecord)) {
    applySelectionChange(editor, aceRecord)
  } else if (CursorChange.guard(aceRecord)) {
    applyCursorChange(editor, aceRecord)
  } else if (ScrollChange.guard(aceRecord)) {
    applyScrollChange(editor, aceRecord)
  }
}

export const deserializeAceRecordTimestamp = (aceRecord: AceRecord): AceRecord => {
  aceRecord.timestamp = new Date(aceRecord.timestamp)
  return aceRecord
}

export const safeChangeValue = (editor: Ace.Editor, value: string): void => {
  const position = editor.session.selection.toJSON()
  editor.setValue(value)
  editor.session.selection.fromJSON(position)
}

// const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class AceStreamer {
  private editor: Ace.Editor
  private _stop: () => void = () => {}
  running = false

  public constructor(editor: Ace.Editor) {
    this.editor = editor
  }

  public start(callback: (record: AceRecord) => void) {
    let lastValue = this.editor.getValue()
    const changeListener = (delta: { [key: string]: unknown }) => {
      if (!this.running) {
        return
      }
      if (this.editor.getValue() === lastValue) {
        return
      }
      lastValue = this.editor.getValue()
      callback(
        Delta.check({
          type: "delta",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          ...delta,
        })
      )
    }

    let lastSelection = Selection.check(this.editor.selection.getRange())
    const selectionListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      const selection = Selection.check(this.editor.selection.getRange())
      if (compareSelections(selection, lastSelection) || selectionIsEmpty(selection)) {
        lastSelection = selection
        return
      }
      lastSelection = selection
      callback(
        SelectionChange.check({
          type: "selectionchange",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          ...selection,
        })
      )
    })

    let lastCursor = EditorLocation.check(this.editor.selection.getCursor())
    const cursorListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      const cursor = EditorLocation.check(this.editor.selection.getCursor())
      if (compareEditorLocations(cursor, lastCursor) || !selectionIsEmpty(this.editor.selection.getRange())) {
        lastCursor = cursor
        return
      }
      lastCursor = cursor
      callback(
        CursorChange.check({
          type: "cursorchange",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          location: cursor,
        })
      )
    })

    let lastScroll = ScrollPosition.check({
      top: this.editor.renderer.getScrollTop(),
      left: this.editor.renderer.getScrollLeft(),
    })
    const scrollListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      const scroll = ScrollPosition.check({
        top: this.editor.renderer.getScrollTop(),
        left: this.editor.renderer.getScrollLeft(),
      })
      if (scroll.top === lastScroll.top && scroll.left === lastScroll.left) {
        return
      }
      lastScroll = scroll
      callback(
        ScrollChange.check({
          type: "scrollchange",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          ...scroll,
        })
      )
    })

    let lastWindowSize = WindowSize.check({
      top: this.editor.renderer.getScrollTopRow(),
      bottom: this.editor.renderer.getScrollBottomRow(),
    })
    const windowSizeListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      const windowSize = WindowSize.check({
        top: this.editor.renderer.getScrollTopRow(),
        bottom: this.editor.renderer.getScrollBottomRow(),
      })
      if (windowSize.top === lastWindowSize.top && windowSize.bottom === lastWindowSize.bottom) {
        return
      }
      lastWindowSize = windowSize
      callback(
        WindowSizeChange.check({
          type: "windowsizechange",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          ...windowSize,
        })
      )
    })

    this.editor.session.addEventListener("change", changeListener)
    this.editor.addEventListener("changeSelection", selectionListener)
    this.editor.addEventListener("changeSelection", cursorListener)
    this.editor.session.addEventListener("changeScrollTop", scrollListener)
    this.editor.session.addEventListener("changeScrollTop", windowSizeListener)

    this.running = true

    this._stop = () => {
      this.editor.session.removeEventListener("change", changeListener)
      this.editor.removeEventListener("changeSelection", selectionListener)
      this.editor.removeEventListener("changeSelection", cursorListener)
      this.editor.session.removeEventListener("changeScrollTop", scrollListener)
    }
  }

  public stop() {
    if (!this.running) {
      throw new Error("Not running")
    }
    this._stop()
  }
}

export class AceRecorder {
  private editor: Ace.Editor
  private streamer: AceStreamer
  recording = false
  private records: AceRecord[] = []
  private timer: ReturnType<typeof setInterval> | undefined

  public constructor(editor: Ace.Editor) {
    this.editor = editor
    this.streamer = new AceStreamer(editor)
  }

  public start(options?: AceRecorder.Options) {
    const interval = options?.interval || 1000
    this.records = [getComplete(this.editor)]
    this.streamer.start((record: AceRecord) => this.records.push(record))
    this.timer = setInterval(() => this.records.push(getComplete(this.editor)), interval)
    this.recording = true
  }
  public addExternalChange(change: Record<string, unknown>) {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    this.records.push(
      ExternalChange.check({
        ...change,
        type: "external",
        timestamp: new Date(),
      })
    )
  }
  public stop() {
    if (!this.recording) {
      throw new Error("Not recording")
    }
    this.timer && clearInterval(this.timer)
    this.streamer?.stop()
    this.records.push(getComplete(this.editor))
    return [...this.records]
  }
}

export module AceRecorder {
  export type Options = {
    interval?: number
  }
}

export class AcePlayer extends EventEmitter {
  private editor: Ace.Editor
  private wasVisible: boolean
  private wasBlinking: boolean
  private previousOpacity: number
  private _src: AceRecord[] = []
  private timer?: ReturnType<typeof setTimeout>
  private timerStarted: number | undefined
  private startTime?: number
  private traceTime = 0
  private currentIndex = 0
  private traceTimes: { complete: boolean; offset: number }[] = []
  private onExternalChange?: (externalChange: ExternalChange) => void

  public constructor(editor: Ace.Editor, onExternalChange?: (externalChange: ExternalChange) => void) {
    super()
    this.editor = editor
    this.onExternalChange = onExternalChange

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = this.editor.renderer as any
    this.wasVisible = renderer.$cursorLayer.isVisible
    this.wasBlinking = renderer.$cursorLayer.isBlinking
    this.previousOpacity = renderer.$cursorLayer.element.style.opacity
  }
  public set src(src: AceRecord[]) {
    if (src.length === 0) {
      throw new Error("Empty source")
    }
    this._src = src
    const traceStartTime = new Date(this._src[0].timestamp).valueOf()
    this.traceTimes = this._src.map((record) => {
      return { complete: AceRecord.guard(record), offset: new Date(record.timestamp).valueOf() - traceStartTime }
    })
  }

  public play() {
    if (!this._src) {
      throw new Error("No source loaded")
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = this.editor.renderer as any
    renderer.$cursorLayer.isVisible = true
    renderer.$cursorLayer.setBlinking(true)
    renderer.$cursorLayer.element.style.opacity = 1

    this.startTime = new Date().valueOf() - this.traceTime
    this.next()
  }

  private next() {
    this.timer && clearTimeout(this.timer)
    this.timerStarted = undefined

    const aceRecord = this._src[this.currentIndex]
    this.traceTime = this.traceTimes[this.currentIndex].offset
    this.emit("timestamp", this.traceTime)
    if (ExternalChange.guard(aceRecord) && this.onExternalChange) {
      this.onExternalChange(aceRecord)
    } else {
      applyAceRecord(this.editor, aceRecord)
    }

    this.currentIndex++
    if (this._src[this.currentIndex]) {
      const nextTime = this.startTime! + this.traceTimes[this.currentIndex].offset
      this.timerStarted = new Date().valueOf()
      const delay = Math.max(nextTime - this.timerStarted, 0)
      this.timer = setTimeout(() => {
        this.next()
      }, delay)
    } else {
      this.emit("ended")
      this.traceTime = 0
      this.currentIndex = 0
    }
  }

  public pause() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.traceTime += new Date().valueOf() - this.timerStarted!
    }

    const renderer = this.editor.renderer as any
    renderer.$cursorLayer.element.style.opacity = this.previousOpacity
    renderer.$cursorLayer.setBlinking(this.wasBlinking)
    renderer.$cursorLayer.isVisible = this.wasVisible
  }
}
/*
export interface AceReplayer {
  promise: Promise<void>
  stop: () => void
}
export interface ReplayOptions {
  start?: number
  seek?: boolean
  onExternalChange?: (externalChange: ExternalChange) => void
}
export const replay: (
  editor: Ace.Editor,
  trace: AceRecord[],
  options?: ReplayOptions,
  events?: EventEmitter.Emitter
) => AceReplayer = (editor, trace, options = { start: 0, seek: false }, events) => {
  const replayer: AceReplayer = {} as AceReplayer

  let cancelled = false
  let resolve: (value: void) => void
  replayer.promise = new Promise((_resolve) => {
    resolve = _resolve
  })

  Promise.resolve().then(async () => {
    const start = options.start || 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = editor.renderer as any
    const wasVisible = renderer.$cursorLayer.isVisible
    renderer.$cursorLayer.isVisible = true
    const wasBlinking = renderer.$cursorLayer.isBlinking
    renderer.$cursorLayer.setBlinking(true)
    const previousOpacity = renderer.$cursorLayer.element.style.opacity
    renderer.$cursorLayer.element.style.opacity = 1

    const startTime = new Date().valueOf()
    const traceStartTime = new Date(trace[0].timestamp).valueOf()

    let startIndex = 0
    if (start > 0) {
      let i = 0
      for (; i < trace.length; i++) {
        const record = trace[i]
        const currentTime = new Date(record.timestamp).valueOf() - traceStartTime
        if (currentTime < start && Complete.guard(record)) {
          startIndex = i
        }
      }
    }

    if (options.seek) {
      applyAceRecord(editor, trace[startIndex])
      return resolve()
    }

    for (let i = startIndex; i < trace.length && !cancelled; i++) {
      const aceRecord = trace[i]
      events?.emit("timestamp", aceRecord.timestamp)
      if (ExternalChange.guard(aceRecord) && options.onExternalChange) {
        options.onExternalChange(aceRecord)
      } else {
        applyAceRecord(editor, aceRecord)
      }
      if (trace[i + 1]) {
        const traceNextTime = new Date(trace[i + 1].timestamp).valueOf()
        const nextTime = startTime + (traceNextTime - (traceStartTime + start))
        const delay = nextTime - new Date().valueOf()
        if (delay > 0) {
          await sleep(delay)
        }
      }
    }

    renderer.$cursorLayer.element.style.opacity = previousOpacity
    renderer.$cursorLayer.setBlinking(wasBlinking)
    renderer.$cursorLayer.isVisible = wasVisible

    resolve()
  })
  replayer.stop = () => {
    cancelled = true
  }
  return replayer
}
*/

export class RecordReplayer extends EventEmitter {
  private recorder: AceRecorder
  private player: AcePlayer
  private _state: RecordReplayer.State = "empty"
  private _trace: AceRecord[] = []

  constructor(editor: Ace.Editor) {
    super()
    this.recorder = new AceRecorder(editor)
    this.player = new AcePlayer(editor)
    this.player.addListener("ended", () => {
      this.pause()
    })
    this.emit("state", "empty")
  }
  public get state() {
    return this._state
  }
  private set state(state: RecordReplayer.State) {
    this._state = state
    this.emit("state", this._state)
  }
  public startRecording(options?: AceRecorder.Options) {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Still playing or recording")
    }
    this.recorder.start(options)
    this.state = "recording"
  }
  public stopRecording() {
    if (this._state !== "recording") {
      throw new Error("Not recording")
    }
    this._trace = this.recorder.stop()
    this.state = "paused"
    this.emit("content", this._trace)
  }
  public pause() {
    if (this._state !== "playing") {
      throw new Error("Not playing")
    }
    this.player.pause()
    this.state = "paused"
  }
  public play() {
    if (this._state !== "paused") {
      throw new Error("No content or already playing or recording")
    }
    this.player.src = this._trace!
    this.player.play()
    this.state = "playing"
  }
  public clear() {
    this.player.pause()
    this._trace = []
    this.state = "empty"
  }
  public get src() {
    return this._trace
  }
  public set src(src: AceRecord[]) {
    if (this._state === "playing" || this._state === "recording") {
      throw new Error("Currently playing or recording")
    }
    this._trace = src
    this.state = src.length === 0 ? "empty" : "paused"
  }
}
export namespace RecordReplayer {
  export type State = "empty" | "paused" | "recording" | "playing"
}
