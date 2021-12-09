import { AudioRecordReplayer } from "@cs124/aceaudio-recorder"
import { useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer/build"
import PlayerControls from "./PlayerControls"

const AudioRecord: React.FC = () => {
  const replayer = useRef(new AudioRecordReplayer())
  const [state, setState] = useState<AudioRecordReplayer.State>("empty")
  useEffect(() => {
    replayer.current?.on("state", (s) => setState(s))
  }, [])

  return (
    <>
      <h2>Audio Recording Demo</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {replayer && <PlayerControls audioreplayer={replayer.current} />}
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
    </>
  )
}
export default AudioRecord
