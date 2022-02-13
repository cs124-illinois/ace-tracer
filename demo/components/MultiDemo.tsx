import { Ace, MultiRecordReplayer } from "@cs124/ace-recorder"
import { useCallback, useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"
import DefaultAceEditor from "./DefaultAceEditor"
import PlayerControls from "./PlayerControls"

const Demo: React.FC = () => {
  const editors = useRef<Record<string, Ace.Editor>>({})

  const [recordReplayer, setRecordReplayer] = useState<MultiRecordReplayer | undefined>(undefined)
  const [state, setState] = useState<MultiRecordReplayer.State>("paused")

  useEffect(() => {
    recordReplayer?.addStateListener((s) => setState(s))
  }, [recordReplayer])

  const finishInitialization = useCallback(() => {
    if (Object.keys(editors.current).length !== 2) {
      return
    }
    const newRecordReplayer = new MultiRecordReplayer(editors.current)
    setRecordReplayer(newRecordReplayer)
  }, [])

  return (
    <>
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      {recordReplayer && <PlayerControls recordReplayer={recordReplayer} />}
      <div style={{ display: "flex" }}>
        {state === "recording" && (
          <Timer>
            {() => (
              <>
                <Timer.Minutes />:<Timer.Seconds />
              </>
            )}
          </Timer>
        )}
      </div>

      <DefaultAceEditor
        onLoad={(ace) => {
          editors.current["First.java"] = ace
          finishInitialization()
        }}
      />

      <DefaultAceEditor
        onLoad={(ace) => {
          editors.current["Second.java"] = ace
          finishInitialization()
        }}
      />
    </>
  )
}
export default Demo
