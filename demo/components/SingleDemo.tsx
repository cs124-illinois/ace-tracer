import RecordReplayer, {
  Ace,
  AceRecord,
  AceTrace,
  AceTraceContent,
  Complete,
  urlToBase64,
} from "@cs124/ace-recorder"
import { useCallback, useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"
import DefaultAceEditor from "./DefaultAceEditor"
import PlayerControls from "./PlayerControls"

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

const Demo: React.FC = () => {
  const [recording, setRecording] = useState<Recording | undefined>()
  const [records, setRecords] = useState<AceRecord[]>([])

  const recordEditor = useRef<Ace.Editor>()
  const replayEditor = useRef<Ace.Editor>()

  const [recordReplayer, setRecordReplayer] = useState<RecordReplayer | undefined>(undefined)
  const [state, setState] = useState<RecordReplayer.State>("paused")

  const [active, setActive] = useState<string>("Main.java")
  const [replayActive, setReplayActive] = useState<string | undefined>()

  useEffect(() => {
    recordReplayer?.addStateListener((s) => setState(s))
  }, [recordReplayer])

  useEffect(() => {
    if (state === "empty") {
      setRecords([])
      setReplayActive(undefined)
    } else if (state === "recording") {
      setRecording(undefined)
    }
  }, [state, recordReplayer])

  const [uploading, setUploading] = useState(false)
  const upload = useCallback(async () => {
    if (!recordReplayer || !recordReplayer.src) {
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

  const finishInitialization = useCallback(() => {
    if (!recordEditor.current || !replayEditor.current) {
      return
    }
    const newRecordReplayer = new RecordReplayer(recordEditor.current, {
      replayEditor: replayEditor.current,
    })
    newRecordReplayer.ace.scrollToCursor = true
    newRecordReplayer.ace.recorder.addListener("record", (record) => {
      setRecords((records) => [record, ...records])
    })
    newRecordReplayer.ace.addListener("record", (record) => {
      Complete.guard(record) && setReplayActive(record.sessionName)
    })
    newRecordReplayer.ace.recorder.addSessions([
      { name: "Main.java", contents: "", mode: "ace/mode/java" },
      { name: "Another.java", contents: "", mode: "ace/mode/java" },
    ])
    newRecordReplayer.ace.recorder.setSession("Main.java")
    setRecordReplayer(newRecordReplayer)
  }, [])

  useEffect(() => {
    recordReplayer?.ace.recorder.setSession(active)
  }, [active, recordReplayer])

  useEffect(() => {
    if (!recording || !recordReplayer) {
      return
    }
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${recording.stem}.json`)
      .then((r) => r.json())
      .then((t) => {
        const ace = AceTraceContent.check(t) as AceTrace
        recordReplayer!.src = { ace, audio: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${recording.stem}.mp4` }
      })
  }, [recording, recordReplayer])

  return (
    <>
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      <select
        id="language"
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
            <button
              onClick={upload}
              disabled={uploading || state === "empty" || state === "playing" || state === "recording"}
            >
              Upload
            </button>
          )}
        </>
      )}
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

      <span>Record</span>
      <DefaultAceEditor
        onLoad={(ace) => {
          recordEditor.current = ace
          finishInitialization()
        }}
      />
      <div style={{ display: "flex", flexDirection: "row", marginBottom: 8 }}>
        <button onClick={() => setActive("Main.java")}>
          <kbd style={{ fontWeight: active === "Main.java" ? "bold" : "inherit" }}>Main.java</kbd>
        </button>
        <button onClick={() => setActive("Another.java")}>
          <kbd style={{ fontWeight: active === "Another.java" ? "bold" : "inherit" }}>Another.java</kbd>
        </button>
      </div>

      <span>Play</span>
      <DefaultAceEditor
        readOnly
        minLines={2}
        maxLines={2}
        onLoad={(ace) => {
          replayEditor.current = ace
          finishInitialization()
        }}
      />
      <div>
        <span>{replayActive ?? <>&nbsp;</>}</span>
      </div>

      <div style={{ height: "16rem", overflow: "scroll", marginTop: 8 }}>
        {records
          .filter((record) => !Complete.guard(record) || record.reason !== "timer")
          .map((record, i) => (
            <pre key={i}>{JSON.stringify(record, null, 2)}</pre>
          ))}
      </div>
    </>
  )
}
export default Demo
