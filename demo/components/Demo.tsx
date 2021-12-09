import { Ace, AceRecord, Complete, RecordReplayer, urlToBase64 } from "@cs124/aceaudio-recorder"
import { useCallback, useEffect, useRef, useState } from "react"
import AceEditor from "react-ace"
import Timer from "react-compound-timer"
import PlayerControls from "../components/PlayerControls"

const Demo: React.FC = () => {
  const [records, setRecords] = useState<AceRecord[]>([])

  const recordEditor = useRef<Ace.Editor>()
  const replayEditor = useRef<Ace.Editor>()

  const [recordReplayer, setRecordReplayer] = useState<RecordReplayer | undefined>(undefined)
  const [state, setState] = useState<RecordReplayer.State>("empty")

  const [active, setActive] = useState<string>()
  const savedActive = useRef<string>()

  const recordSessions = useRef<Record<string, Ace.EditSession>>({})
  const replaySessions = useRef<Record<string, Ace.EditSession>>({})

  useEffect(() => {
    recordReplayer?.addStateListener((s) => setState(s))
  }, [recordReplayer])

  useEffect(() => {
    fetch(`/api/`)
      .then((r) => r.json())
      .then((response) => {
        console.log(response)
      })
  }, [])

  useEffect(() => {
    if (state === "empty") {
      setRecords([])
      Object.values(replaySessions.current).forEach((session) => {
        session.setValue("")
      })
    }
  }, [state])

  useEffect(() => {
    if (!active) {
      return
    }
    savedActive.current = active
    if (state === "recording") {
      recordEditor.current?.setSession(recordSessions.current[active])
    } else if (state === "playing") {
      replayEditor.current?.setSession(replaySessions.current[active])
    }
  }, [active, state])

  const [uploading, setUploading] = useState(false)
  const upload = useCallback(async () => {
    if (!recordReplayer) {
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
      labelSession: () => {
        return savedActive.current!
      },
      getSession: (name) => {
        setActive(name)
        return replaySessions.current[name]!
      },
    })
    // aceAudioRecorder.scrollToCursor = true
    newRecordReplayer.ace.recorder.addListener("record", (record) => {
      setRecords((records) => [record, ...records])
    })
    setRecordReplayer(newRecordReplayer)
  }, [])

  return (
    <>
      <p>Use the record button to start recording, and play to replay when you are finished.</p>
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
          recordSessions.current["Main.java"] = ace.createEditSession("", "ace/mode/java" as any)
          recordSessions.current["Another.java"] = ace.createEditSession("", "ace/mode/java" as any)
        }}
        onLoad={(ace) => {
          recordEditor.current = ace
          finishInitialization()
          ace.setSession(recordSessions.current["Main.java"])
          setActive("Main.java")
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
          replaySessions.current["Main.java"] = ace.createEditSession("", "ace/mode/java" as any)
          replaySessions.current["Another.java"] = ace.createEditSession("", "ace/mode/java" as any)
        }}
        onLoad={(ace) => {
          replayEditor.current = ace
          ace.setSession(replaySessions.current["Main.java"])
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
