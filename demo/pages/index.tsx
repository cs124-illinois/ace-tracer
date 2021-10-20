import { AceRecord, recordreplayer, RecordReplayer, RecordReplayerState, stream } from "@cs124/ace-tracer"
import { AudioRecorder, record as recordAudio } from "@cs124/audio-recorder"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"

const PlayerControls: React.FC<{ replayer: RecordReplayer }> = ({ replayer }) => {
  const [state, setState] = useState<RecordReplayerState>("notrace")
  useEffect(() => {
    replayer.events.on("state", (s) => setState(s))
    replayer.events.on("timestamp", (t) => console.log(t))
  }, [])
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
      <button
        disabled={state === "notrace" || state === "playing" || state === "recording"}
        onClick={() => replayer.startPlaying()}
      >
        Play
      </button>
      <button disabled={state !== "notrace"} onClick={() => replayer.startRecording()}>
        Record
      </button>
      <button
        disabled={state !== "recording" && state !== "playing"}
        onClick={() => {
          state === "recording" ? replayer.stopRecording() : replayer.stopPlaying()
        }}
      >
        Stop
      </button>
      <button disabled={state === "notrace" || state === "playing" || state === "recording"} onClick={() => replayer.clearTrace()}>
        Clear
      </button>
    </div>
  )
}

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const SingleEditorStream: React.FC = () => {
  const [records, setRecords] = useState<AceRecord[]>([])

  return (
    <>
      <h2>Single Editor Stream Demo</h2>
      <p>Live edits are streamed below the editor.</p>
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        height="16rem"
        minLines={16}
        maxLines={Infinity}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          stream(ace, (record: AceRecord) => {
            setRecords((current) => [record, ...current])
          })
        }}
      />
      <button onClick={() => setRecords([])} style={{ marginTop: 8 }}>
        Clear
      </button>
      <div style={{ height: "16rem", overflow: "scroll", marginTop: 8 }}>
        {records.map((record, i) => (
          <pre key={i}>{JSON.stringify(record, null, 2)}</pre>
        ))}
      </div>
    </>
  )
}

const SingleEditorRecord: React.FC = () => {
  const [state, setState] = useState<RecordReplayerState>("notrace")
  const [replayer, setReplayer] = useState<RecordReplayer | undefined>(undefined)

  return (
    <>
      <h2>Single Editor Record and Replay Demo</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {replayer && <PlayerControls replayer={replayer} />}
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        height="16rem"
        minLines={16}
        maxLines={Infinity}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          setReplayer(recordreplayer(ace))
        }}
      />
    </>
  )
}

const AudioRecord: React.FC = () => {
  const [recording, setRecording] = useState(false)
  const recorder = useRef<AudioRecorder | undefined>()
  const [url, setUrl] = useState<string | undefined>()

  useEffect(() => {
    const toggleRecording = async (recording: boolean) => {
      if (recording) {
        recorder.current?.stop()
        recorder.current = await recordAudio()
      } else {
        setUrl(await recorder.current?.stop())
      }
    }
    toggleRecording(recording)
  }, [recording])

  return (
    <>
      <h2>Audio Recording Demo</h2>
      <div style={{ display: "flex" }}>
        <button onClick={() => (url ? setUrl(undefined) : setRecording((r) => !r))}>
          {url ? "Clear" : recording ? "Stop" : "Record"}
        </button>
        {recording && (
          <Timer>
            {() => (
              <>
                <Timer.Minutes />:<Timer.Seconds />
              </>
            )}
          </Timer>
        )}
        {url && <audio controls src={url} />}
      </div>
    </>
  )
}

export default function Home() {
  return (
    <>
      <SingleEditorRecord />
      <AudioRecord />
      <SingleEditorStream />
    </>
  )
}
