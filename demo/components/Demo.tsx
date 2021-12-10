import RecordReplayer, { Ace, AceRecord, Complete, urlToBase64 } from "@cs124/aceaudio-recorder"
import { useCallback, useEffect, useRef, useState } from "react"
import AceEditor from "react-ace"
import Timer from "react-compound-timer"
import PlayerControls from "../components/PlayerControls"

type recording = {
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
] as recording[]

const Demo: React.FC = () => {
  const [trace, setTrace] = useState<recording | undefined>()
  const [records, setRecords] = useState<AceRecord[]>([])

  const recordEditor = useRef<Ace.Editor>()
  const replayEditor = useRef<Ace.Editor>()

  const [recordReplayer, setRecordReplayer] = useState<RecordReplayer | undefined>(undefined)
  const [state, setState] = useState<RecordReplayer.State>("paused")

  const [active, setActive] = useState<string>("Main.java")

  useEffect(() => {
    recordReplayer?.addStateListener((s) => setState(s))
  }, [recordReplayer])

  useEffect(() => {
    if (state === "empty") {
      setRecords([])
    }
  }, [state])

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
    newRecordReplayer.ace.recorder.addSessions([
      { name: "Main.java", contents: "", mode: "ace/mode/java" },
      { name: "Another.java", contents: "", mode: "ace/mode/java" },
    ])
    newRecordReplayer.ace.recorder.setSession("Main.java")
    setRecordReplayer(newRecordReplayer)
  }, [])

  useEffect(() => {
    if (!recordReplayer) {
      return
    }
    recordReplayer.ace.recorder.setSession(active)
  }, [active, recordReplayer])

  return (
    <>
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
      <select
        id="language"
        onChange={(e) => setTrace(RECORDINGS.find(({ stem }) => stem === e.target.value))}
        value={trace?.stem}
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
          <button
            onClick={upload}
            disabled={uploading || state === "empty" || state === "playing" || state === "recording"}
          >
            Upload
          </button>
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
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        minLines={4}
        maxLines={4}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
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
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        readOnly
        minLines={2}
        maxLines={2}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          replayEditor.current = ace
          finishInitialization()
        }}
      />

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
