import {
  AceRecord,
  CursorChange,
  Delta,
  EditorLocation,
  ScrollChange,
  ScrollPosition,
  Selection,
  SelectionChange,
  WindowSize,
  WindowSizeChange,
} from "@cs124/ace-recorder-types"
import { Ace } from "ace-builds"
import { throttle } from "throttle-debounce"
import { Complete } from ".."

class AceStreamer {
  private editor: Ace.Editor
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private _stop: () => void = () => {}
  running = false
  public sessionName?: string

  public constructor(editor: Ace.Editor) {
    this.editor = editor
  }

  public start(callback: (record: AceRecord) => void) {
    let beforeEndOperation = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer = this.editor.renderer as any
    let { width, height } = renderer.$size
    let lastWindowSize = WindowSize.check({
      width,
      height,
      rows: height === 0 ? 0 : this.editor.renderer.getScrollBottomRow() - this.editor.renderer.getScrollTopRow() + 1,
      fontSize: parseInt(this.editor.getFontSize()),
      lineHeight: renderer.$textLayer.getLineHeight(),
    })
    const windowSizeListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      beforeEndOperation = false
      const { width: newWidth, height: newHeight } = renderer.$size
      const windowSize = WindowSize.check({
        width: newWidth,
        height: newHeight,
        rows: newHeight === 0 ? 0 : this.editor.renderer.getScrollBottomRow() - this.editor.renderer.getScrollTopRow() + 1,
        fontSize: parseInt(this.editor.getFontSize()),
        lineHeight: renderer.$textLayer.getLineHeight(),
      })
      if (
        windowSize.width === lastWindowSize.width &&
        windowSize.height === lastWindowSize.height &&
        windowSize.rows === lastWindowSize.rows &&
        windowSize.fontSize === lastWindowSize.fontSize &&
        windowSize.lineHeight === lastWindowSize.lineHeight
      ) {
        return
      }
      width = newWidth
      height = newHeight
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

    let lastValue = this.editor.getValue()
    const changeListener = (delta: { [key: string]: unknown }) => {
      if (!this.running) {
        return
      }
      beforeEndOperation = false
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
      beforeEndOperation = false
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
      beforeEndOperation = false
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
      const triggeredByCursorChange = beforeEndOperation
      beforeEndOperation = false

      let top = this.editor.renderer.getScrollTop()
      if (top < 0) {
        top = 0
      }
      if (top > height) {
        top = height
      }
      let left = this.editor.renderer.getScrollLeft()
      if (left < 0) {
        left = 0
      }
      if (left > width) {
        left = width
      }
      const scroll = ScrollPosition.check({ top, left })
      if (scroll.top === lastScroll.top && scroll.left === lastScroll.left) {
        return
      }
      lastScroll = scroll

      callback(
        ScrollChange.check({
          type: "scrollchange",
          timestamp: new Date(),
          focused: this.editor.isFocused(),
          triggeredByCursorChange,
          ...scroll,
        })
      )
    })

    const changeSessionListener = ({
      session,
      oldSession,
    }: {
      session: Ace.EditSession
      oldSession: Ace.EditSession
    }) => {
      beforeEndOperation = false

      oldSession.removeEventListener("change", changeListener)
      oldSession.removeEventListener("changeScrollTop", scrollListener)
      oldSession.removeEventListener("changeScrollTop", windowSizeListener)

      if (!this.sessionName) {
        throw new Error("Must set sessionName if switching sessions during recording")
      }

      callback(getComplete(this.editor, "session", this.sessionName))

      session.addEventListener("change", changeListener)
      session.addEventListener("changeScrollTop", scrollListener)
      session.addEventListener("changeScrollTop", windowSizeListener)
    }

    const beforeEndListener = () => {
      beforeEndOperation = true
    }

    callback(getComplete(this.editor, "start", this.sessionName))
    this.editor.session.addEventListener("change", changeListener)
    this.editor.addEventListener("changeSelection", selectionListener)
    this.editor.addEventListener("changeSelection", cursorListener)
    this.editor.session.addEventListener("changeScrollTop", scrollListener)
    this.editor.renderer.addEventListener("resize", windowSizeListener)
    this.editor.addEventListener("changeSession", changeSessionListener)
    this.editor.addEventListener("beforeEndOperation", beforeEndListener)

    this.running = true

    this._stop = () => {
      this.editor.removeEventListener("beforeEndOperation", beforeEndListener)
      this.editor.removeEventListener("changeSession", changeSessionListener)
      this.editor.session.removeEventListener("resize", windowSizeListener)
      this.editor.session.removeEventListener("changeScrollTop", scrollListener)
      this.editor.removeEventListener("changeSelection", cursorListener)
      this.editor.removeEventListener("changeSelection", selectionListener)
      this.editor.session.removeEventListener("change", changeListener)
      callback(getComplete(this.editor, "end", this.sessionName))

      this.running = false
    }
  }

  public stop() {
    if (!this.running) {
      throw new Error("Not running")
    }
    this._stop()
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this._stop = () => {}
  }
}

export default AceStreamer

const compareEditorLocations = (first: EditorLocation, second: EditorLocation): boolean =>
  first.column === second.column && first.row === second.row

const compareSelections = (first: Selection, second: Selection): boolean =>
  compareEditorLocations(first.start, second.start) && compareEditorLocations(first.end, second.end)

const getComplete = (editor: Ace.Editor, reason: string, sessionName?: string): Complete => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      rows: height === 0 ? 0 : editor.renderer.getScrollBottomRow() - editor.renderer.getScrollTopRow() + 1,
      fontSize: parseInt(editor.getFontSize()),
      lineHeight: renderer.$textLayer.getLineHeight(),
    },
    reason,
    ...(sessionName && { sessionName }),
  })
}

const selectionIsEmpty = (selection: Selection): boolean =>
  selection.start.column === selection.end.column && selection.start.row === selection.end.row
