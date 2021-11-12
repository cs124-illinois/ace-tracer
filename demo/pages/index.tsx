import { AceRecord, AceStreamer, RecordReplayer as AceRecordReplayer } from "@cs124/ace-tracer"
import { RecordReplayer as AudioRecordReplayer } from "@cs124/audio-recorder"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const PlayerControls: React.FC<{ acereplayer?: AceRecordReplayer; audioreplayer?: AudioRecordReplayer }> = ({
  acereplayer,
  audioreplayer,
}) => {
  const [state, setState] = useState<AceRecordReplayer.State>("empty")
  useEffect(() => {
    acereplayer?.on("state", (s) => setState(s))
    audioreplayer?.on("state", (s) => setState(s))
  }, [])
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
      <button
        disabled={state === "empty" || state === "playing" || state === "recording"}
        onClick={() => {
          acereplayer?.play()
          audioreplayer?.play()
        }}
      >
        Play
      </button>
      <button
        disabled={state !== "empty"}
        onClick={() => {
          acereplayer?.startRecording()
          audioreplayer?.startRecording()
        }}
      >
        Record
      </button>
      <button
        disabled={state !== "recording" && state !== "playing"}
        onClick={() => {
          if (state === "recording") {
            acereplayer?.stopRecording()
            audioreplayer?.stopRecording()
          } else {
            acereplayer?.pause()
            audioreplayer?.pause()
          }
        }}
      >
        Stop
      </button>
      <button
        disabled={state === "empty" || state === "playing" || state === "recording"}
        onClick={() => {
          acereplayer?.clear()
          audioreplayer?.clear()
        }}
      >
        Clear
      </button>
      <button
        disabled={state === "empty" || state === "playing" || state === "recording"}
        onClick={async () => {
          const trace = acereplayer?.src
          const audio = await audioreplayer?.srcBase64()
          console.log({
            ...(trace && { trace }),
            ...(audio && { audio }),
          })
        }}
      >
        Log
      </button>
    </div>
  )
}

const WithAudioRecord: React.FC = () => {
  const [aceReplayer, setAceReplayer] = useState<AceRecordReplayer | undefined>(undefined)
  const audioReplayer = useRef(new AudioRecordReplayer())
  const [state, setState] = useState<AudioRecordReplayer.State>("empty")
  useEffect(() => {
    audioReplayer.current?.on("state", (s) => setState(s))
  }, [])

  return (
    <>
      <h2>Single Editor Record and Replay Demo (With Audio)</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {aceReplayer && <PlayerControls acereplayer={aceReplayer} audioreplayer={audioReplayer.current} />}
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
        minLines={16}
        maxLines={Infinity}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          setAceReplayer(new AceRecordReplayer(ace))
        }}
      />
    </>
  )
}

const SingleEditorRecord: React.FC = () => {
  const [replayer, setReplayer] = useState<AceRecordReplayer | undefined>(undefined)

  return (
    <>
      <h2>Single Editor Record and Replay Demo (No Audio)</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {replayer && <PlayerControls acereplayer={replayer} />}
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
          setReplayer(new AceRecordReplayer(ace))
        }}
      />
    </>
  )
}

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
          new AceStreamer(ace).start((record: AceRecord) => {
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

export default function Home() {
  return (
    <>
      <h1>
        <kbd>ace-tracer</kbd>
      </h1>
      <p>
        Visit the <a href="https://github.com/cs124-illinois/ace-tracer">project homepage</a>
      </p>
      <WithAudioRecord />
      <SingleEditorStream />
    </>
  )
}
