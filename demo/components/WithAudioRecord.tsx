import { AudioRecordReplayer, RecordReplayer } from "@cs124/aceaudio-recorder"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"
import Timer from "react-compound-timer/build"
import PlayerControls from "./PlayerControls"

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const WithAudioRecord: React.FC = () => {
  const [aceAudioReplayer, setAceAudioReplayer] = useState<RecordReplayer | undefined>(undefined)
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
          const aceAudioRecorder = new RecordReplayer(ace, { debug: true })
          aceAudioRecorder.playbackRate = 2
          setAceAudioReplayer(aceAudioRecorder)
        }}
      />
    </>
  )
}
export default WithAudioRecord
