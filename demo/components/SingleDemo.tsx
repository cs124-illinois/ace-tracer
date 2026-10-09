import RecordReplayer, { Ace, AceRecord, AceTrace, AceTraceContent, Complete, urlToBase64 } from "@cs124/ace-recorder"
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

type Recording = {
  name: string
  stem: string
  audio: string[]
}
const RECORDINGS = [
  {
    name: "Hello, world!",
    stem: "helloworld",
    audio: ["webm", "mp4"],
  },
  {
    name: "Multiple Editors",
    stem: "multieditor",
    audio: ["webm", "mp4"],
  },
  {
    name: "Scrolling Demo",
    stem: "scrolldemo",
    audio: ["webm", "mp4"],
  },
] as Recording[]

const AUDIO_TYPES: Record<string, string> = {
  webm: 'audio/webm; codecs="opus"',
  mp4: 'audio/mp4; codecs="mp4a.40.2"',
}
const pickAudioFormat = (formats: string[]) => {
  const audio = document.createElement("audio")
  return formats.find((format) => audio.canPlayType(AUDIO_TYPES[format]) !== "") ?? formats[formats.length - 1]
}

const MAX_RECORDS = 100

const Demo: React.FC = () => {
  const [recording, setRecording] = useState<Recording | undefined>()
  const [records, setRecords] = useState<{ id: number; record: AceRecord }[]>([])
  const nextRecordId = useRef(0)

  const recordEditor = useRef<Ace.Editor>(undefined)
  const replayEditor = useRef<Ace.Editor>(undefined)

  const initialized = useRef(false)
  const [recordReplayer, setRecordReplayer] = useState<RecordReplayer | undefined>()

  const [sessions, setSessions] = useState<string[]>(["Main.java", "Another.java"])
  const [active, setActive] = useState<string>("Main.java")
  const [state, setState] = useState<RecordReplayer.State>("paused")
  const [replayActive, setReplayActive] = useState<string | undefined>()

  const [uploading, setUploading] = useState(false)
  const upload = useCallback(async () => {
    if (!recordReplayer?.src) {
      return
    }
    setUploading(true)
    const { ace, audio: audioURL } = recordReplayer.src
    const audio = await urlToBase64(audioURL)
    fetch(`/api/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ ace, audio }),
    }).finally(() => {
      setUploading(false)
    })
  }, [recordReplayer])

  const finishInitialization = useCallback((sessions: string[]) => {
    if (initialized.current || !recordEditor.current || !replayEditor.current) {
      return
    }
    initialized.current = true
    const newRecordReplayer = new RecordReplayer(recordEditor.current, {
      replayEditor: replayEditor.current,
    })
    newRecordReplayer.ace.scrollToCursor = true
    newRecordReplayer.ace.recorder.addSessions(
      sessions.map((name) => {
        return { name, contents: "", mode: "ace/mode/java" }
      }),
    )
    newRecordReplayer.ace.recorder.setSession(sessions[0])
    setRecordReplayer(newRecordReplayer)
  }, [])

  useEffect(() => {
    if (!recordReplayer) {
      return
    }
    const recordListener = (record: AceRecord) => {
      if (Complete.guard(record) && record.reason === "timer") {
        return
      }
      const id = nextRecordId.current++
      setRecords((records) => [{ id, record }, ...records].slice(0, MAX_RECORDS))
    }
    const replayListener = (record: AceRecord) => {
      Complete.guard(record) && setReplayActive(record.sessionName)
    }
    const stateListener = (s: RecordReplayer.State) => {
      if (s === "recording") {
        setRecording(undefined)
      }
      setState(s)
    }
    const mousewheelListener = (e: { defaultPrevented: boolean }) => {
      if (recordReplayer.state === "recording") {
        e.defaultPrevented = true
        return false
      }
    }
    const editor = recordEditor.current
    recordReplayer.ace.recorder.addListener("record", recordListener)
    recordReplayer.ace.addListener("record", replayListener)
    recordReplayer.addStateListener(stateListener)
    editor?.on("mousewheel", mousewheelListener)
    return () => {
      recordReplayer.ace.recorder.removeListener("record", recordListener)
      recordReplayer.ace.removeListener("record", replayListener)
      recordReplayer.removeStateListener(stateListener)
      editor?.off("mousewheel", mousewheelListener)
    }
  }, [recordReplayer])

  useEffect(() => {
    recordReplayer?.ace.recorder.setSession(active)
  }, [active, recordReplayer])

  useEffect(() => {
    if (!recording || !recordReplayer) {
      return
    }
    // Abort on cleanup so that a slow response for an earlier selection can never replace a later one
    const controller = new AbortController()
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
    fetch(`${base}/${recording.stem}.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load ${recording.stem}: ${r.status}`)
        }
        return r.json()
      })
      .then((t) => {
        if (controller.signal.aborted) {
          return
        }
        const ace = AceTraceContent.check(t) as AceTrace
        if (recordReplayer.state === "playing") {
          recordReplayer.pause()
        }
        recordReplayer.src = { ace, audio: `${base}/${recording.stem}.${pickAudioFormat(recording.audio)}` }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error(err)
        }
      })
    return () => controller.abort()
  }, [recording, recordReplayer])

  return (
    <div data-testid="single-demo">
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      <select
        id="language"
        aria-label="Recording"
        disabled={state !== "paused"}
        onChange={(e) => setRecording(RECORDINGS.find(({ stem }) => stem === e.target.value))}
        value={recording?.stem ?? ""}
      >
        <option value="" key=""></option>
        {RECORDINGS.map(({ name, stem }) => (
          <option key={stem} value={stem}>
            {name}
          </option>
        ))}
      </select>
      {recordReplayer && (
        <>
          <PlayerControls recordReplayer={recordReplayer} />
          {process.env.NODE_ENV === "development" && (
            <button onClick={upload} disabled={uploading || state === "playing" || state === "recording"}>
              Upload
            </button>
          )}
        </>
      )}
      <div style={{ display: "flex" }}>{state === "recording" && <RecordingTimer />}</div>

      <span>Record</span>
      <DefaultAceEditor
        name="single-record"
        onLoad={(ace) => {
          recordEditor.current = ace
          finishInitialization(sessions)
        }}
      />
      <div style={{ display: "flex", flexDirection: "row", marginBottom: 8 }}>
        {sessions.map((name) => (
          <div key={name} style={{ marginRight: 8 }}>
            <button onClick={() => setActive(name)}>
              <kbd style={{ fontWeight: active === name ? "bold" : "inherit" }}>{name}</kbd>
            </button>
            {sessions.length > 1 && (
              <button
                onClick={() => {
                  const nextSessions = sessions.filter((sessionName) => name !== sessionName)
                  if (active === name) {
                    recordReplayer?.ace.recorder.setSession(nextSessions[0])
                  }
                  recordReplayer?.ace.recorder.deleteSession(name)
                  setSessions(nextSessions)
                  if (active === name) {
                    setActive(nextSessions[0])
                  }
                }}
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>

      <span>Play</span>
      <DefaultAceEditor
        name="single-replay"
        readOnly
        minLines={2}
        maxLines={2}
        onLoad={(ace) => {
          replayEditor.current = ace
          finishInitialization(sessions)
        }}
      />
      <div>
        <span>{replayActive ?? <>&nbsp;</>}</span>
      </div>

      <div data-testid="records" style={{ height: "16rem", overflow: "scroll", marginTop: 8 }}>
        {records.map(({ id, record }) => (
          <pre key={id}>{JSON.stringify(record, null, 2)}</pre>
        ))}
      </div>
    </div>
  )
}
export default Demo
