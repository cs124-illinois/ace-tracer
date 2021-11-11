import type { Ace } from "ace-builds"
import EventEmitter from "event-emitter"
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

export interface AceStreamer {
  pause: () => void
  restart: () => void
  stop: () => void
}
export const stream: (editor: Ace.Editor, callback: (record: AceRecord) => void) => AceStreamer = (
  editor,
  callback
) => {
  let running = true

  let lastValue = editor.getValue()
  const changeListener = (delta: { [key: string]: unknown }) => {
    if (!running) {
      return
    }
    if (editor.getValue() === lastValue) {
      return
    }
    lastValue = editor.getValue()
    callback(
      Delta.check({
        type: "delta",
        timestamp: new Date(),
        focused: editor.isFocused(),
        ...delta,
      })
    )
  }

  let lastSelection = Selection.check(editor.selection.getRange())
  const selectionListener = throttle(100, () => {
    if (!running) {
      return
    }
    const selection = Selection.check(editor.selection.getRange())
    if (compareSelections(selection, lastSelection) || selectionIsEmpty(selection)) {
      lastSelection = selection
      return
    }
    lastSelection = selection
    callback(
      SelectionChange.check({
        type: "selectionchange",
        timestamp: new Date(),
        focused: editor.isFocused(),
        ...selection,
      })
    )
  })

  let lastCursor = EditorLocation.check(editor.selection.getCursor())
  const cursorListener = throttle(100, () => {
    if (!running) {
      return
    }
    const cursor = EditorLocation.check(editor.selection.getCursor())
    if (compareEditorLocations(cursor, lastCursor) || !selectionIsEmpty(editor.selection.getRange())) {
      lastCursor = cursor
      return
    }
    lastCursor = cursor
    callback(
      CursorChange.check({
        type: "cursorchange",
        timestamp: new Date(),
        focused: editor.isFocused(),
        location: cursor,
      })
    )
  })

  let lastScroll = ScrollPosition.check({
    top: editor.renderer.getScrollTop(),
    left: editor.renderer.getScrollLeft(),
  })
  const scrollListener = throttle(100, () => {
    if (!running) {
      return
    }
    const scroll = ScrollPosition.check({
      top: editor.renderer.getScrollTop(),
      left: editor.renderer.getScrollLeft(),
    })
    if (scroll.top === lastScroll.top && scroll.left === lastScroll.left) {
      return
    }
    lastScroll = scroll
    callback(
      ScrollChange.check({
        type: "scrollchange",
        timestamp: new Date(),
        focused: editor.isFocused(),
        ...scroll,
      })
    )
  })

  let lastWindowSize = WindowSize.check({
    top: editor.renderer.getScrollTopRow(),
    bottom: editor.renderer.getScrollBottomRow(),
  })
  const windowSizeListener = throttle(100, () => {
    if (!running) {
      return
    }
    const windowSize = WindowSize.check({
      top: editor.renderer.getScrollTopRow(),
      bottom: editor.renderer.getScrollBottomRow(),
    })
    if (windowSize.top === lastWindowSize.top && windowSize.bottom === lastWindowSize.bottom) {
      return
    }
    lastWindowSize = windowSize
    callback(
      WindowSizeChange.check({
        type: "windowsizechange",
        timestamp: new Date(),
        focused: editor.isFocused(),
        ...windowSize,
      })
    )
  })

  editor.session.addEventListener("change", changeListener)
  editor.addEventListener("changeSelection", selectionListener)
  editor.addEventListener("changeSelection", cursorListener)
  editor.session.addEventListener("changeScrollTop", scrollListener)
  editor.session.addEventListener("changeScrollTop", windowSizeListener)

  let restartTimer: ReturnType<typeof setTimeout>
  const pause = () => {
    clearTimeout(restartTimer)
    running = false
  }
  const restart = () => {
    restartTimer = setTimeout(() => {
      running = true
    }, 200)
  }
  const stop = () => {
    clearTimeout(restartTimer)
    editor.session.removeEventListener("change", changeListener)
    editor.removeEventListener("changeSelection", selectionListener)
    editor.removeEventListener("changeSelection", cursorListener)
    editor.session.removeEventListener("changeScrollTop", scrollListener)
  }

  return { stop, pause, restart }
}

export interface AceRecorder {
  addExternalChange: (change: Record<string, unknown>) => void
  stop: () => AceRecord[]
}
export interface RecordOptions {
  interval?: number
}
export const record: (editor: Ace.Editor, options?: RecordOptions) => AceRecorder = (
  editor,
  options = { interval: 1000 }
) => {
  const interval = options.interval || 1000
  const records: AceRecord[] = [getComplete(editor)]
  const { stop: cancel } = stream(editor, (record: AceRecord) => records.push(record))
  const timer = setInterval(() => records.push(getComplete(editor)), interval)
  const addExternalChange = (change: Record<string, unknown>) => {
    records.push(
      ExternalChange.check({
        ...change,
        type: "external",
        timestamp: new Date(),
      })
    )
  }
  const stop = () => {
    clearInterval(timer)
    cancel()
    records.push(getComplete(editor))
    return records
  }
  return { stop, addExternalChange }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

export const safeChangeValue = (editor: Ace.Editor, value: string): void => {
  const position = editor.session.selection.toJSON()
  editor.setValue(value)
  editor.session.selection.fromJSON(position)
}

export type RecordReplayerState = "loading" | "blank" | "recording" | "recorded" | "playing"
export type RecordReplayStateChangeListener = (state: RecordReplayerState) => void
export interface RecordReplayer {
  startRecording: (options?: RecordOptions) => void
  stopRecording: () => void
  startPlaying: (options?: ReplayOptions) => void
  stopPlaying: () => void
  clear: () => void
  events: EventEmitter.Emitter
  getTrace: () => AceRecord[] | undefined
}

export const recordreplayer = (editor: Ace.Editor): RecordReplayer => {
  let trace: AceRecord[] | undefined
  let recorder: AceRecorder | undefined
  let state: RecordReplayerState
  let replayer: AceReplayer | undefined

  const events = EventEmitter()

  const setState = (newState: RecordReplayerState) => {
    state = newState
    events.emit("state", state)
  }
  setState("blank")

  const startRecording = (options?: RecordOptions) => {
    if (recorder) {
      throw new Error("Recorder is still running")
    }
    recorder = record(editor, options)
    setState("recording")
  }
  const stopRecording = () => {
    if (!recorder) {
      throw new Error("Recorder was not started")
    }
    trace = recorder.stop()
    recorder = undefined
    setState("recorded")
    events.emit("content", trace)
  }

  const stopPlaying = () => {
    if (!replayer) {
      throw new Error("Replayer was not started")
    }
    replayer.stop()
    replayer = undefined
    setState("recorded")
  }
  const startPlaying = (options?: ReplayOptions) => {
    if (!trace) {
      throw new Error("Recording not available")
    }
    if (replayer) {
      throw new Error("Replayer is still running")
    }
    replayer = replay(editor, trace, options, events)
    replayer.promise.then(() => stopPlaying())
    setState("playing")
  }

  const clear = () => {
    replayer && replayer.stop()
    replayer = undefined
    trace = []
    setState("blank")
  }

  const getTrace = () => {
    return trace
  }

  return {
    startRecording,
    stopRecording,
    startPlaying,
    stopPlaying,
    clear,
    events,
    getTrace
  }
}
