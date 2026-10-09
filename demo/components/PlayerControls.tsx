import RecordReplayer, { IRecordReplayer, MultiRecordReplayer } from "@cs124/ace-recorder"
import { useCallback, useEffect, useRef, useState } from "react"

type Replayer = RecordReplayer | MultiRecordReplayer

// The src getter throws while recording, and after stop() the recording is available before the src is readable
const hasSource = (recordReplayer: Replayer) => {
  if (recordReplayer.hasRecording) {
    return true
  }
  try {
    return recordReplayer.src !== undefined
  } catch {
    return false
  }
}

const currentPercent = (recordReplayer: Replayer) => {
  const percent = recordReplayer.percent
  return Number.isFinite(percent) ? percent : 0
}

const PlayerControls: React.FC<{
  recordReplayer: Replayer
}> = ({ recordReplayer }) => {
  // Property setters on the replayer are called through a ref so that the component never mutates its props
  const replayer = useRef(recordReplayer)
  useEffect(() => {
    replayer.current = recordReplayer
  }, [recordReplayer])

  const [state, setState] = useState<IRecordReplayer.State>(recordReplayer.state)
  const [loaded, setLoaded] = useState(() => hasSource(recordReplayer))
  const [seekable, setSeekable] = useState(() => Number.isFinite(recordReplayer.duration))
  const [value, setValue] = useState(() => currentPercent(recordReplayer))
  const [wasPlaying, setWasPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState("1.0")
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    const stateListener = (s: IRecordReplayer.State) => {
      setState(s)
      setLoaded(hasSource(recordReplayer))
    }
    const eventListener = (e: IRecordReplayer.Event) => {
      if (e === "srcChanged") {
        setLoaded(hasSource(recordReplayer))
      }
      if (e === "srcChanged" || e === "seeked" || e === "ended") {
        setValue(currentPercent(recordReplayer))
      }
    }
    const durationListener = () => setSeekable(Number.isFinite(recordReplayer.duration))
    recordReplayer.addStateListener(stateListener)
    recordReplayer.addEventListener(eventListener)
    recordReplayer.audio.player.addEventListener("durationchange", durationListener)
    recordReplayer.audio.player.addEventListener("emptied", durationListener)
    return () => {
      recordReplayer.removeStateListener(stateListener)
      recordReplayer.removeEventListener(eventListener)
      recordReplayer.audio.player.removeEventListener("durationchange", durationListener)
      recordReplayer.audio.player.removeEventListener("emptied", durationListener)
    }
  }, [recordReplayer])

  useEffect(() => {
    if (state !== "playing") {
      return
    }
    const timer = setInterval(() => setValue(currentPercent(recordReplayer)), 100)
    return () => clearInterval(timer)
  }, [state, recordReplayer])

  const run = useCallback((action: () => Promise<void> | void) => {
    const report = (err: unknown) => {
      console.error(err)
      setError(String(err))
    }
    setError(undefined)
    try {
      Promise.resolve(action()).catch(report)
    } catch (err) {
      report(err)
    }
  }, [])

  const canSeek = loaded && seekable && state !== "recording"

  return (
    <div>
      <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
        <button
          data-testid="play"
          disabled={state === "paused" && !loaded}
          onClick={() => {
            if (state === "paused") {
              run(() => recordReplayer.play())
            } else if (state === "recording") {
              run(() => recordReplayer.stop())
            } else {
              run(() => recordReplayer.pause())
            }
          }}
        >
          {state === "paused" ? <>Play</> : state === "recording" ? <>Stop</> : <>Pause</>}
        </button>
        <button data-testid="record" disabled={state !== "paused"} onClick={() => run(() => recordReplayer.record())}>
          Record
        </button>
        <select
          data-testid="playbackRate"
          aria-label="Playback rate"
          onChange={(e) => {
            setPlaybackRate(e.target.value)
            replayer.current.playbackRate = parseFloat(e.target.value)
          }}
          value={playbackRate}
        >
          <option value="0.5">0.5</option>
          <option value="1.0">1.0</option>
          <option value="2.0">2.0</option>
        </select>
        {error && (
          <span role="alert" style={{ marginLeft: 8, color: "red" }}>
            {error}
          </span>
        )}
      </div>
      <input
        data-testid="seek"
        aria-label="Seek"
        disabled={!canSeek}
        type="range"
        min="0"
        max="100"
        step="0.1"
        onChange={(e) => {
          const percent = Number(e.target.value)
          replayer.current.percent = percent
          setValue(percent)
        }}
        onMouseDown={() => {
          if (state === "playing" && !wasPlaying) {
            setWasPlaying(true)
            run(() => recordReplayer.pause())
          }
        }}
        onMouseUp={() => {
          wasPlaying && run(() => recordReplayer.play())
          setWasPlaying(false)
        }}
        value={canSeek ? value : 0}
        style={{ width: "100%" }}
      />
    </div>
  )
}
export default PlayerControls
