import { AceRecord, AudioRecordReplayer, RecordReplayer } from "@cs124/aceaudio-recorder"
import type { Ace } from "ace-builds"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer/build"
import PlayerControls from "./PlayerControls"

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const MultiWithAudioRecord: React.FC = () => {
  const [records, setRecords] = useState<AceRecord[]>([])
  const [aceAudioReplayer, setAceAudioReplayer] = useState<RecordReplayer | undefined>(undefined)
  const aceEditor = useRef<Ace.Editor>()
  const aceSessions = useRef<Record<string, Ace.EditSession>>({})
  const [state, setState] = useState<AudioRecordReplayer.State>("empty")
  const [active, setActive] = useState<string>()
  const savedActive = useRef<string>()
  useEffect(() => {
    aceAudioReplayer?.on("state", (s) => setState(s))
  }, [aceAudioReplayer])
  useEffect(() => {
    if (!active) {
      return
    }
    savedActive.current = active
    aceEditor.current?.setSession(aceSessions.current[active])
  }, [active])

  return (
    <>
      <h2>Single Editor Record and Replay Demo (With Audio)</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {aceAudioReplayer && <PlayerControls aceaudioreplayer={aceAudioReplayer} />}
      {aceAudioReplayer && (
        <div style={{ display: "flex", flexDirection: "row", marginBottom: 8 }}>
          <button onClick={() => setActive("Main.java")}>
            <kbd style={{ fontWeight: active === "Main.java" ? "bold" : "inherit" }}>Main.java</kbd>
          </button>
          <button onClick={() => setActive("Another.java")}>
            <kbd style={{ fontWeight: active === "Another.java" ? "bold" : "inherit" }}>Another.java</kbd>
          </button>
        </div>
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
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        height="16rem"
        minLines={1}
        maxLines={1}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
          aceSessions.current["Main.java"] = ace.createEditSession("", "ace/mode/java" as any)
          aceSessions.current["Another.java"] = ace.createEditSession("", "ace/mode/java" as any)
        }}
        onLoad={(ace) => {
          const aceAudioRecorder = new RecordReplayer(ace, {
            labelSession: () => {
              return savedActive.current!
            },
            getSession: (name) => {
              setActive(name)
              return aceSessions.current[name]!
            },
          })

          aceAudioRecorder.addListener("record", (record) => {
            console.log(record)
            // setRecords((records) => [record, ...records])
          })
          // aceAudioRecorder.playbackRate = 2
          setAceAudioReplayer(aceAudioRecorder)
          ace.setSession(aceSessions.current["Main.java"])
          setActive("Main.java")
          aceEditor.current = ace
        }}
      />
    </>
  )
}
export default MultiWithAudioRecord
