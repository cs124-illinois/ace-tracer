type EventHandler = (...args: any[]) => void

export class MockEditSession {
  private _value = ""
  private _scrollTop = 0
  private _scrollLeft = 0
  private _listeners: Record<string, EventHandler[]> = {}
  public selection: MockSelection
  public $modeId = "text"

  constructor(value = "", mode = "text") {
    this._value = value
    this.selection = new MockSelection()
    this.$modeId = mode
  }

  getValue() {
    return this._value
  }
  setValue(value: string) {
    this._value = value
  }
  getDocument() {
    return {
      applyDelta: (delta: any) => {
        if (delta.action === "insert") {
          const lines = this._value.split("\n")
          const row = delta.start.row
          const col = delta.start.column
          const line = lines[row] || ""
          const insertText = delta.lines.join("\n")
          lines[row] = line.substring(0, col) + insertText + line.substring(col)
          this._value = lines.join("\n")
        } else if (delta.action === "remove") {
          const lines = this._value.split("\n")
          const row = delta.start.row
          const col = delta.start.column
          const endCol = delta.end.column
          const line = lines[row] || ""
          lines[row] = line.substring(0, col) + line.substring(endCol)
          this._value = lines.join("\n")
        }
      },
    }
  }
  setScrollTop(top: number) {
    this._scrollTop = top
    this._emit("changeScrollTop", top)
  }
  setScrollLeft(left: number) {
    this._scrollLeft = left
  }
  getScrollTop() {
    return this._scrollTop
  }
  getScrollLeft() {
    return this._scrollLeft
  }
  addEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }
  private _emit(event: string, ...args: any[]) {
    for (const handler of this._listeners[event] || []) {
      handler(...args)
    }
  }
}

export class MockSelection {
  private _cursor = { row: 0, column: 0 }
  private _range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }

  getCursor() {
    return { ...this._cursor }
  }
  moveCursorTo(row: number, column: number) {
    this._cursor = { row, column }
  }
  getRange() {
    return JSON.parse(JSON.stringify(this._range))
  }
  setSelectionRange(range: { start: { row: number; column: number }; end: { row: number; column: number } }) {
    this._range = JSON.parse(JSON.stringify(range))
  }
  toJSON() {
    return JSON.parse(JSON.stringify(this._range))
  }
  fromJSON(json: any) {
    this._range = JSON.parse(JSON.stringify(json))
  }
}

export class MockRenderer {
  private _scrollTop = 0
  private _scrollLeft = 0
  private _listeners: Record<string, EventHandler[]> = {}

  $size = { width: 800, height: 600 }
  $cursorLayer = {
    isVisible: true,
    isBlinking: false,
    element: { style: { opacity: 1 } },
    setBlinking: (b: boolean) => {
      this.$cursorLayer.isBlinking = b
    },
  }
  $textLayer = {
    getLineHeight: () => 18,
  }

  getScrollBottomRow() {
    return 29
  }
  getScrollTopRow() {
    return 0
  }
  getScrollTop() {
    return this._scrollTop
  }
  getScrollLeft() {
    return this._scrollLeft
  }
  scrollToY(y: number) {
    this._scrollTop = y
  }
  scrollToX(x: number) {
    this._scrollLeft = x
  }
  scrollCursorIntoView() {}
  addEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }
}

export class MockEditor {
  public session: MockEditSession
  public renderer: MockRenderer
  public selection: MockSelection
  private _listeners: Record<string, EventHandler[]> = {}
  private _focused = true

  constructor(value = "") {
    this.session = new MockEditSession(value)
    this.renderer = new MockRenderer()
    this.selection = this.session.selection
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
  setSession(session: any) {
    const oldSession = this.session
    this.session = session
    this.selection = session.selection
    this._emit("changeSession", { session, oldSession })
  }
  addEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: EventHandler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler)
  }
  private _emit(event: string, ...args: any[]) {
    for (const handler of this._listeners[event] || []) {
      handler(...args)
    }
  }

  simulateChange(delta: any) {
    this.session.getDocument().applyDelta(delta)
    // Trigger change on session listeners
    ;(this.session as any)._emit?.("change", delta)
  }
}

export function createMockEditor(value = ""): MockEditor {
  return new MockEditor(value)
}
