import { Ace, MultiRecordReplayer } from "@cs124/ace-recorder"
import { useCallback, useRef, useState } from "react"
import Timer from "react-compound-timer"
import DefaultAceEditor from "./DefaultAceEditor"
import PlayerControls from "./PlayerControls"

const Demo: React.FC = () => {
  const editors = useRef<Record<string, Ace.Editor>>({})

  const recordReplayer = useRef<MultiRecordReplayer | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [state, setState] = useState<MultiRecordReplayer.State>("paused")

  const finishInitialization = useCallback(() => {
    if (Object.keys(editors.current).length !== 2) {
      return
    }
    const newRecordReplayer = new MultiRecordReplayer(editors.current)
    newRecordReplayer.addStateListener((state) => {
      setState(state)
    })
    recordReplayer.current = newRecordReplayer
    setLoaded(true)
  }, [])

  return (
    <>
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      {loaded && <PlayerControls recordReplayer={recordReplayer.current!} />}
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
