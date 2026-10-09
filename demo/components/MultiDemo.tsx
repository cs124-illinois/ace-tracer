import { Ace, MultiRecordReplayer } from "@cs124/ace-recorder"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createTimeModel, useTimeModel } from "react-compound-timer"
import DefaultAceEditor from "./DefaultAceEditor"
import PlayerControls from "./PlayerControls"

const RecordingTimer: React.FC = () => {
  const timer = useMemo(() => createTimeModel({ initialTime: 0, direction: "forward", startImmediately: true }), [])
  const { value } = useTimeModel(timer)
  return (
    <>
      {value.m}:{String(value.s).padStart(2, "0")}
    </>
  )
}

const Demo: React.FC = () => {
  const editors = useRef<Record<string, Ace.Editor>>({})
  const initialized = useRef(false)

  const [recordReplayer, setRecordReplayer] = useState<MultiRecordReplayer | undefined>()
  const [state, setState] = useState<MultiRecordReplayer.State>("paused")

  const finishInitialization = useCallback(() => {
    if (initialized.current || Object.keys(editors.current).length !== 2) {
      return
    }
    initialized.current = true
    setRecordReplayer(new MultiRecordReplayer(editors.current))
  }, [])

  useEffect(() => {
    if (!recordReplayer) {
      return
    }
    const listener = (s: MultiRecordReplayer.State) => setState(s)
    recordReplayer.addStateListener(listener)
    return () => recordReplayer.removeStateListener(listener)
  }, [recordReplayer])

  return (
    <div data-testid="multi-demo">
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      {recordReplayer && <PlayerControls recordReplayer={recordReplayer} />}
      <div style={{ display: "flex" }}>{state === "recording" && <RecordingTimer />}</div>

      <DefaultAceEditor
        name="multi-first"
        onLoad={(ace) => {
          editors.current["First.java"] = ace
          finishInitialization()
        }}
      />

      <DefaultAceEditor
        name="multi-second"
        onLoad={(ace) => {
          editors.current["Second.java"] = ace
          finishInitialization()
        }}
      />
    </div>
  )
}
export default Demo
