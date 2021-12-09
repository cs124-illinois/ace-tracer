import { IRecordReplayer, RecordReplayerState } from "@cs124/aceaudio-recorder"
import { useCallback, useEffect, useRef, useState } from "react"

const PlayerControls: React.FC<{
  recordReplayer: IRecordReplayer
}> = ({ recordReplayer }) => {
  const [state, setState] = useState<RecordReplayerState>("paused")
  const [wasPlaying, setWasPlaying] = useState(false)
  useEffect(() => {
    recordReplayer.addStateListener((s) => setState(s))
  }, [recordReplayer])
  const [value, setValue] = useState(0)
  const handleChange = useCallback(
    (event) => {
      recordReplayer.percent = event.target.value
      setValue(event.target.value)
    },
    [recordReplayer]
  )
  const timer = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    if (state === "playing") {
      timer.current = setInterval(() => {
        setValue(recordReplayer.percent)
      }, 100)
    } else {
      timer.current && clearInterval(timer.current)
    }
  }, [state, recordReplayer])

  return (
    <div>
      <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
        <button
          disabled={state === "recording"}
          onClick={() => {
            if (state === "paused") {
              recordReplayer.play()
            } else {
              recordReplayer.pause()
            }
          }}
        >
          {state === "paused" ? <>Play</> : <>Pause</>}
        </button>
        <button
          disabled={state !== "paused"}
          onClick={() => {
            recordReplayer.record()
          }}
        >
          Record
        </button>
        <button
          disabled={state === "paused"}
          onClick={() => {
            if (state === "recording") {
              recordReplayer.stop()
            } else {
              recordReplayer.pause()
            }
          }}
        >
          Stop
        </button>
        {/*
        <button
          disabled={state === "playing" || state === "recording"}
          onClick={async () => {
            let trace = acereplayer?.trace
            let audio = await audioreplayer?.recorder?.base64
            if (aceaudioreplayer) {
              let { trace: t, audio: a } = await aceaudioreplayer?.content
              trace = t
              audio = a
            }
            console.log({
              ...(trace && { trace }),
              ...(audio && { audio }),
            })
          }}
        >
          Log
        </button>
        */}
      </div>
      <input
        disabled={state === "recording"}
        type="range"
        min="0"
        max="100"
        step="1"
        onChange={handleChange}
        onMouseDown={() => {
          if (state === "playing" && !wasPlaying) {
            setWasPlaying(true)
            recordReplayer.pause()
          }
        }}
        onMouseUp={() => {
          wasPlaying && recordReplayer.play()
          setWasPlaying(false)
        }}
        value={value}
        style={{ width: "100%" }}
      />
    </div>
  )
}
export default PlayerControls
