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

export const Selection = RuntypeRecord({
  start: EditorLocation,
  end: EditorLocation,
})
export type Selection = Static<typeof Selection>

export const SelectionChange = RuntypeRecord({
  type: Literal("selectionchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  start: EditorLocation,
  end: EditorLocation,
})
export type SelectionChange = Static<typeof SelectionChange>

export const CursorChange = RuntypeRecord({
  type: Literal("cursorchange"),
  timestamp: AceTimestamp,
  focused: Boolean,
  location: EditorLocation,
})
export type CursorChange = Static<typeof CursorChange>

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
  triggeredByCursorChange: Boolean,
})
export type ScrollChange = Static<typeof ScrollChange>

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
  sessionName: string

  constructor(records: AceRecord[], sessionInfo: SessionInfo[], sessionName: string) {
    if (records.length === 0) {
      throw new Error("Empty trace")
    }
    this.records = records
    this.startTime = new Date(records[0].timestamp)
    this.duration = new Date(records.slice(-1)[0].timestamp).valueOf() - new Date(records[0].timestamp).valueOf()
    if (sessionInfo.length > 1 && sessionInfo.find(({ name }) => !name)) {
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

export const deserializeAceRecordTimestamp = (aceRecord: AceRecord): AceRecord => {
  aceRecord.timestamp = new Date(aceRecord.timestamp)
  return aceRecord
}

export interface IRecordReplayer {
  state: IRecordReplayer.State
  hasRecording: boolean
  src: unknown | undefined
  currentTime: number
  playbackRate: number
  percent: number
  readonly duration: number
  play: () => Promise<void>
  pause: () => void
  record: () => Promise<void>
  stop: () => Promise<void>
  addStateListener: (listener: (state: IRecordReplayer.State) => void) => void
  addEventListener: (listener: (state: IRecordReplayer.Event) => void) => void
}
export namespace IRecordReplayer {
  export type State = "paused" | "playing" | "recording"
  export type Event = "ended" | "srcChanged" | "seeked" | "playbackRateChange" | "startedRecording"
}
