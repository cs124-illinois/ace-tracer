import { AceRecord, AceStreamer, RecordReplayer as AceRecordReplayer } from "@cs124/ace-recorder"
import { RecordReplayer as AceAudioRecordReplayer } from "@cs124/aceaudio-recorder"
import { RecordReplayer as AudioRecordReplayer } from "@cs124/audio-recorder"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const PlayerControls: React.FC<{
  acereplayer?: AceRecordReplayer
  audioreplayer?: AudioRecordReplayer
  aceaudioreplayer?: AceAudioRecordReplayer
}> = ({ acereplayer, audioreplayer, aceaudioreplayer }) => {
  const [state, setState] = useState<AceRecordReplayer.State>("empty")
  useEffect(() => {
    acereplayer?.on("state", (s) => setState(s))
    audioreplayer?.on("state", (s) => setState(s))
    aceaudioreplayer?.on("state", (s) => setState(s))
  }, [])
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
      <button
        disabled={state === "empty" || state === "playing" || state === "recording"}
        onClick={() => {
          acereplayer?.play()
          audioreplayer?.play()
          aceaudioreplayer?.play()
        }}
      >
        Play
      </button>
      <button
        disabled={state !== "empty"}
        onClick={() => {
          acereplayer?.startRecording()
          audioreplayer?.startRecording()
          aceaudioreplayer?.startRecording()
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
            aceaudioreplayer?.stopRecording()
          } else {
            acereplayer?.pause()
            audioreplayer?.pause()
            aceaudioreplayer?.pause()
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
          aceaudioreplayer?.clear()
        }}
      >
        Clear
      </button>
      <button
        disabled={state === "empty" || state === "playing" || state === "recording"}
        onClick={async () => {
          let trace = acereplayer?.trace
          let audio = await audioreplayer?.base64
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
    </div>
  )
}

const WithAudioRecord: React.FC = () => {
  const [aceAudioReplayer, setAceAudioReplayer] = useState<AceAudioRecordReplayer | undefined>(undefined)
  const [state, setState] = useState<AudioRecordReplayer.State>("empty")
  useEffect(() => {
    aceAudioReplayer?.on("state", (s) => setState(s))
  }, [aceAudioReplayer])
  useEffect(() => {
    fetch(`/api/`)
      .then((r) => r.json())
      .then((response) => {
        console.log(response)
      })
  }, [])

  const [uploading, setUploading] = useState(false)
  const upload = useCallback(async () => {
    if (!aceAudioReplayer) {
      return
    }
    setUploading(true)
    const { trace, audio } = await aceAudioReplayer.content
    fetch(`/api/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ trace, audio }),
    }).finally(() => {
      setUploading(false)
    })
  }, [aceAudioReplayer])

  return (
    <>
      <h2>Single Editor Record and Replay Demo (With Audio)</h2>
      <p>Use the record button to start recording, and replay to replay when you are finished.</p>
      {aceAudioReplayer && <PlayerControls aceaudioreplayer={aceAudioReplayer} />}
      {aceAudioReplayer && (
        <button
          onClick={upload}
          disabled={uploading || state === "empty" || state === "playing" || state === "recording"}
        >
          Upload
        </button>
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
        minLines={16}
        maxLines={Infinity}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          setAceAudioReplayer(new AceAudioRecordReplayer(ace))
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
