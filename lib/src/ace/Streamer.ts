import { Ace } from "ace-builds"
import { throttle } from "throttle-debounce"
import {
  AceRecord,
  compareEditorLocations,
  compareSelections,
  CursorChange,
  Delta,
  EditorLocation,
  getComplete,
  ScrollChange,
  ScrollPosition,
  Selection,
  SelectionChange,
  selectionIsEmpty,
  WindowSize,
  WindowSizeChange,
} from "../types"

class AceStreamer {
  private editor: Ace.Editor
  private _stop: () => void = () => {}
  running = false
  public sessionName?: string

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

    const renderer = this.editor.renderer as any
    const { width, height } = renderer.$size
    let lastWindowSize = WindowSize.check({
      width,
      height,
      rows: this.editor.renderer.getScrollBottomRow() - this.editor.renderer.getScrollTopRow() + 1,
      fontSize: parseInt(this.editor.getFontSize()),
      lineHeight: renderer.$textLayer.getLineHeight(),
    })
    const windowSizeListener = throttle(100, () => {
      if (!this.running) {
        return
      }
      const { width, height } = renderer.$size
      const windowSize = WindowSize.check({
        width,
        height,
        rows: this.editor.renderer.getScrollBottomRow() - this.editor.renderer.getScrollTopRow() + 1,
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

    const changeSessionListener = ({
      session,
      oldSession,
    }: {
      session: Ace.EditSession
      oldSession: Ace.EditSession
    }) => {
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

    callback(getComplete(this.editor, "start", this.sessionName))

    this.editor.session.addEventListener("change", changeListener)
    this.editor.addEventListener("changeSelection", selectionListener)
    this.editor.addEventListener("changeSelection", cursorListener)
    this.editor.session.addEventListener("changeScrollTop", scrollListener)
    this.editor.renderer.addEventListener("changeScrollTop", windowSizeListener) // change to resize
    this.editor.addEventListener("changeSession", changeSessionListener)

    this.running = true

    this._stop = () => {
      this.editor.session.removeEventListener("change", changeListener)
      this.editor.removeEventListener("changeSelection", selectionListener)
      this.editor.removeEventListener("changeSelection", cursorListener)
      this.editor.session.removeEventListener("changeScrollTop", scrollListener)
      this.editor.session.removeEventListener("changeScrollTop", windowSizeListener)
      this.editor.removeEventListener("changeSession", changeSessionListener)
      callback(getComplete(this.editor, "end", this.sessionName))
      this.running = false
    }
  }

  public stop() {
    if (!this.running) {
      throw new Error("Not running")
    }
    this._stop()
  }
}

export default AceStreamer