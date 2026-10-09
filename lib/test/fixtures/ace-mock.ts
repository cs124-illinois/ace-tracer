// Minimal stand-ins for the parts of Ace that the library touches. Behavior follows ace-builds where tests depend on
// it: the renderer reads scroll positions from the session, the selection is an anchor/lead pair that edits shift,
// and setValue emits the same remove/insert deltas as Ace's Document.setValue.

type EventHandler = (...args: any[]) => void
type Point = { row: number; column: number }
type Range = { start: Point; end: Point }
type MockDelta = { action: "insert" | "remove"; start: Point; end: Point; lines: string[] }

class Emitter {
  private _listeners: Record<string, EventHandler[]> = {}

  addEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }
  listenerCount(event: string) {
    return this._listeners[event]?.length ?? 0
  }
  emit(event: string, ...args: any[]) {
    for (const handler of [...(this._listeners[event] || [])]) {
      handler(...args)
    }
  }
}

const comparePoints = (a: Point, b: Point) => (a.row === b.row ? a.column - b.column : a.row - b.row)

// Port of Ace's $getTransformedPoint for anchors with $insertRight = false: a point at an insert position moves
const transformPoint = (delta: MockDelta, point: Point): Point => {
  const isInsert = delta.action === "insert"
  const rowShift = (isInsert ? 1 : -1) * (delta.end.row - delta.start.row)
  const columnShift = (isInsert ? 1 : -1) * (delta.end.column - delta.start.column)
  const end = isInsert ? delta.start : delta.end
  if (comparePoints(point, delta.start) < 0) {
    return { ...point }
  }
  if (comparePoints(end, point) <= 0) {
    return { row: point.row + rowShift, column: point.column + (point.row === end.row ? columnShift : 0) }
  }
  return { ...delta.start }
}

export class MockSelection {
  private anchor: Point = { row: 0, column: 0 }
  private lead: Point = { row: 0, column: 0 }
  private empty = true

  getCursor() {
    return { ...this.lead }
  }
  // Like Ace, only the lead moves: an empty selection stays collapsed at the cursor, a non-empty one is extended
  moveCursorTo(row: number, column: number) {
    this.lead = { row, column }
  }
  clearSelection() {
    this.empty = true
  }
  moveTo(row: number, column: number) {
    this.clearSelection()
    this.moveCursorTo(row, column)
  }
  isEmpty() {
    return this.empty || comparePoints(this.anchor, this.lead) === 0
  }
  getRange(): Range {
    if (this.empty) {
      return { start: { ...this.lead }, end: { ...this.lead } }
    }
    return comparePoints(this.anchor, this.lead) <= 0
      ? { start: { ...this.anchor }, end: { ...this.lead } }
      : { start: { ...this.lead }, end: { ...this.anchor } }
  }
  // Like Ace, reverse puts the cursor (lead) at the start of the range
  setSelectionRange(range: Range, reverse = false) {
    this.anchor = { ...(reverse ? range.end : range.start) }
    this.lead = { ...(reverse ? range.start : range.end) }
    this.empty = comparePoints(this.anchor, this.lead) === 0
  }
  toJSON() {
    return this.getRange()
  }
  fromJSON(range: Range) {
    this.setSelectionRange(range)
  }
  onChange(delta: MockDelta) {
    this.anchor = transformPoint(delta, this.anchor)
    this.lead = transformPoint(delta, this.lead)
  }
}

export class MockEditSession extends Emitter {
  private lines: string[]
  private _scrollTop = 0
  private _scrollLeft = 0
  public selection: MockSelection
  public $modeId = "text"

  constructor(value = "", mode = "text") {
    super()
    this.lines = value.split("\n")
    this.selection = new MockSelection()
    this.$modeId = mode
  }

  getValue() {
    return this.lines.join("\n")
  }
  // Ace's Document.setValue removes everything and inserts the new text, emitting a delta for each, then
  // EditSession.setValue moves the cursor to the start
  setValue(value: string) {
    const lastRow = this.lines.length - 1
    const end = { row: lastRow, column: this.lines[lastRow].length }
    if (end.row > 0 || end.column > 0) {
      this.applyDelta({ action: "remove", start: { row: 0, column: 0 }, end, lines: [...this.lines] })
    }
    if (value !== "") {
      this.applyDelta({ action: "insert", start: { row: 0, column: 0 }, end: endOf(value), lines: value.split("\n") })
    }
    this.selection.moveTo(0, 0)
  }
  getDocument() {
    return { applyDelta: (delta: MockDelta) => this.applyDelta(delta) }
  }
  private applyDelta(delta: MockDelta) {
    const { start, end } = delta
    const before = this.lines[start.row].substring(0, start.column)
    if (delta.action === "insert") {
      const after = this.lines[start.row].substring(start.column)
      const inserted = [...delta.lines]
      inserted[0] = before + inserted[0]
      inserted[inserted.length - 1] += after
      this.lines.splice(start.row, 1, ...inserted)
    } else {
      const after = this.lines[end.row].substring(end.column)
      this.lines.splice(start.row, end.row - start.row + 1, before + after)
    }
    this.selection.onChange(delta)
    this.emit("change", delta)
  }
  // Like Ace, setting an unchanged scroll position doesn't emit
  setScrollTop(top: number) {
    if (this._scrollTop === top || Number.isNaN(top)) return
    this._scrollTop = top
    this.emit("changeScrollTop", top)
  }
  setScrollLeft(left: number) {
    if (this._scrollLeft === left || Number.isNaN(left)) return
    this._scrollLeft = left
    this.emit("changeScrollLeft", left)
  }
  getScrollTop() {
    return this._scrollTop
  }
  getScrollLeft() {
    return this._scrollLeft
  }
}

const endOf = (text: string): Point => {
  const lines = text.split("\n")
  return { row: lines.length - 1, column: lines[lines.length - 1].length }
}

// Rows are 20px so the default 600px viewport shows 30 rows
const ROW_HEIGHT = 20

export class MockRenderer extends Emitter {
  public session: MockEditSession
  public scrolledIntoView: Point[] = []

  $size = { width: 800, height: 600 }
  $cursorLayer = {
    isVisible: true,
    isBlinking: false,
    element: { style: { opacity: 1 as number | string } },
    setBlinking: (b: boolean) => {
      this.$cursorLayer.isBlinking = b
    },
  }
  $textLayer = {
    getLineHeight: () => 18,
  }

  constructor(session: MockEditSession) {
    super()
    this.session = session
  }

  getScrollBottomRow() {
    return Math.floor(this.$size.height / ROW_HEIGHT) - 1
  }
  getScrollTopRow() {
    return 0
  }
  // Ace's renderer reads scroll positions from the session
  getScrollTop() {
    return this.session.getScrollTop()
  }
  getScrollLeft() {
    return this.session.getScrollLeft()
  }
  // Ace's render loop copies the renderer's scroll position into the session; the mock does it immediately
  scrollToY(y: number) {
    this.session.setScrollTop(y)
  }
  scrollToX(x: number) {
    this.session.setScrollLeft(x)
  }
  scrollCursorIntoView(cursor: Point) {
    this.scrolledIntoView.push({ ...cursor })
  }
}

export class MockEditor extends Emitter {
  public session: MockEditSession
  public renderer: MockRenderer
  private _focused = true

  constructor(value = "") {
    super()
    this.session = new MockEditSession(value)
    this.renderer = new MockRenderer(this.session)
  }

  get selection() {
    return this.session.selection
  }
  getValue() {
    return this.session.getValue()
  }
  setValue(value: string) {
    this.session.setValue(value)
  }
  isFocused() {
    return this._focused
  }
  setFocused(f: boolean) {
    this._focused = f
  }
  getFontSize() {
    return 14
  }
  getSession() {
    return this.session
  }
  setSession(session: MockEditSession) {
    const oldSession = this.session
    this.session = session
    this.renderer.session = session
    this.emit("changeSession", { session, oldSession })
  }

  simulateChange(delta: MockDelta) {
    this.session.getDocument().applyDelta(delta)
  }

  simulateSelectionChange(start: Point, end: Point) {
    this.session.selection.setSelectionRange({ start, end })
    this.emit("changeSelection")
  }

  simulateCursorMove(row: number, column: number) {
    this.session.selection.moveTo(row, column)
    this.emit("changeSelection")
  }

  // A keyboard-driven cursor move: Ace scrolls the cursor into view at the end of the operation, after
  // beforeEndOperation fires, so the scroll is attributed to the cursor change
  simulateCursorMoveWithScroll(row: number, column: number, scrollTop: number) {
    this.simulateCursorMove(row, column)
    this.emit("beforeEndOperation")
    this.session.setScrollTop(scrollTop)
  }

  simulateResize(width: number, height: number) {
    this.renderer.$size = { width, height }
    this.renderer.emit("resize")
  }
}

export function createMockEditor(value = ""): MockEditor {
  return new MockEditor(value)
}
