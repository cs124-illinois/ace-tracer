import type { Ace } from "ace-builds"
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
  window: RuntypeRecord({
    width: Number,
    height: Number,
    rows: Number,
    fontSize: Number,
    lineHeight: Number,
  }),
  reason: Union(Literal("start"), Literal("timer"), Literal("end"), Literal("manual"), Literal("session")),
}).And(
  Partial({
    sessionName: String,
  })
)

export type Complete = Static<typeof Complete>

export const getComplete = (editor: Ace.Editor, reason: string, sessionName?: string): Complete => {
  const renderer = editor.renderer as any
  const { width, height } = renderer.$size
  return Complete.check({
    type: "complete",
    timestamp: new Date(),
    focused: editor.isFocused(),
    value: editor.session.getValue(),
    selection: editor.session.selection.getRange(),
    cursor: editor.session.selection.getCursor(),
    scroll: {
      top: editor.renderer.getScrollTop(),
      left: editor.renderer.getScrollLeft(),
    },
    window: {
      width,
      height,
      rows: editor.renderer.getScrollBottomRow() - editor.renderer.getScrollTopRow() + 1,
      fontSize: parseInt(editor.getFontSize()),
      lineHeight: renderer.$textLayer.getLineHeight(),
    },
    reason,
    ...(sessionName && { sessionName }),
  })
}

export const applyComplete = (session: Ace.EditSession, complete: Complete, setScroll = true): void => {
  if (session.getValue() !== complete.value) {
    safeChangeSessionValue(session, complete.value)
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

export const applyDelta = (session: Ace.EditSession, delta: Delta): void => session.getDocument().applyDelta(delta)

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

export const applySelectionChange = (session: Ace.EditSession, selectionChange: SelectionChange): void =>
  session.selection.setSelectionRange(selectionChange)

export const CursorChange = RuntypeRecord({
  type: Literal("cursorchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  location: EditorLocation,
})
export type CursorChange = Static<typeof CursorChange>

export const applyCursorChange = (session: Ace.EditSession, cursorChange: CursorChange): void =>
  session.selection.moveCursorTo(cursorChange.location.row, cursorChange.location.column)

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

export const applyScrollChange = (renderer: Ace.VirtualRenderer, scrollChange: ScrollChange): void => {
  renderer.scrollToY(scrollChange.top)
  renderer.scrollToX(scrollChange.left)
}

export const WindowSize = RuntypeRecord({
  width: Number,
  height: Number,
  rows: Number,
  fontSize: Number,
  lineHeight: Number,
})
export type WindowSize = Static<typeof WindowSize>

export const WindowSizeChange = RuntypeRecord({
  type: Literal("windowsizechange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  rows: Number,
})
export type WindowSizeChange = Static<typeof WindowSizeChange>

export const SessionInfo = RuntypeRecord({
  name: String,
  contents: String,
  mode: String,
})
export type SessionInfo = Static<typeof SessionInfo>

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

export const AceTraceContent = RuntypeRecord({
  records: Array(AceRecord),
  duration: Number,
  startTime: AceTimestamp,
  sessionInfo: Array(SessionInfo),
}).And(
  Partial({
    sessionName: String,
  })
)
export class AceTrace {
  records: AceRecord[]
  duration: number
  startTime: Date
  sessionInfo: SessionInfo[]
  sessionName?: string

  constructor(records: AceRecord[], sessionInfo: SessionInfo[], sessionName?: string) {
    if (records.length === 0) {
      throw new Error("Empty trace")
    }
    this.records = records
    this.startTime = new Date(records[0].timestamp)
    this.duration = new Date(records.slice(-1)[0].timestamp).valueOf() - new Date(records[0].timestamp).valueOf()
    if (sessionInfo.find(({ name }) => !name)) {
      throw new Error("Session names must not be blank")
    }
    if (!sessionInfo.find(({ name }) => name === sessionName)) {
      throw new Error("Must set sessionName when trace includes multiple sessions")
    }
    this.sessionInfo = sessionInfo
    this.sessionName = sessionName
    AceTraceContent.check(this)
  }
}

export const applyAceRecord = (editor: Ace.Editor, aceRecord: AceRecord, applyScroll = true): void => {
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

export const deserializeAceRecordTimestamp = (aceRecord: AceRecord): AceRecord => {
  aceRecord.timestamp = new Date(aceRecord.timestamp)
  return aceRecord
}

export const safeChangeValue = (editor: Ace.Editor, value: string): void => {
  const position = editor.session.selection.toJSON()
  editor.setValue(value)
  editor.session.selection.fromJSON(position)
}

export const safeChangeSessionValue = (session: Ace.EditSession, value: string): void => {
  const position = session.selection.toJSON()
  session.setValue(value)
  session.selection.fromJSON(position)
}

export type RecordReplayerState = "empty" | "paused" | "playing" | "recording"

export interface IRecordReplayer {
  state: RecordReplayerState
  src: unknown | undefined
  currentTime: number
  playbackRate: number
  percent: number
  readonly duration: number
  play: () => Promise<void>
  pause: () => void
  record: () => Promise<void>
  stop: () => Promise<void>
  addStateListener: (listener: (state: RecordReplayerState) => void) => void
}
