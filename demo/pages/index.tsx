import type { Ace } from "@cs124/aceaudio-recorder"
import {
  AceRecord,
  AceRecordReplayer,
  AceStreamer,
  AudioRecordReplayer,
  RecordReplayer,
} from "@cs124/aceaudio-recorder"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import Timer from "react-compound-timer"
const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

const PlayerControls: React.FC<{
  acereplayer?: AceRecordReplayer
  audioreplayer?: AudioRecordReplayer
  aceaudioreplayer?: RecordReplayer
}> = ({ acereplayer, audioreplayer, aceaudioreplayer }) => {
  const [state, setState] = useState<AceRecordReplayer.State>("empty")
  const [wasPlaying, setWasPlaying] = useState(false)
  useEffect(() => {
    acereplayer?.on("state", (s) => setState(s))
    audioreplayer?.on("state", (s) => setState(s))
    audioreplayer?.on("ended", () => {
      audioreplayer.currentTime = 0
      setValue(0)
    })
    aceaudioreplayer?.on("state", (s) => setState(s))
    aceaudioreplayer?.on("ended", () => {
      aceaudioreplayer.currentTime = 0
      aceaudioreplayer.sync()
      setValue(0)
    })
  }, [])
  const [value, setValue] = useState(0)
  const handleChange = useCallback((event) => {
    if (aceaudioreplayer) {
      aceaudioreplayer.percent = event.target.value
      aceaudioreplayer.sync()
    } else if (audioreplayer) {
      audioreplayer.percent = event.target.value
    }
    setValue(event.target.value)
  }, [])
  const timer = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    if (state === "empty") {
      setValue(0)
    }
    if (state === "playing") {
      timer.current = setInterval(() => {
        let percent
        if (aceaudioreplayer) {
          percent = aceaudioreplayer.percent!
        } else if (audioreplayer) {
          percent = audioreplayer.percent
        }
        percent && setValue(percent)
      }, 100)
    } else {
      timer.current && clearInterval(timer.current)
    }
  }, [state])

  return (
    <div>
      <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "center" }}>
        <button
          disabled={state === "empty" || state === "recording"}
          onClick={() => {
            if (state === "paused") {
              acereplayer?.play()
              audioreplayer?.play()
              aceaudioreplayer?.play()
            } else {
              acereplayer?.pause()
              audioreplayer?.pause()
              aceaudioreplayer?.pause()
            }
          }}
        >
          {state === "paused" ? <>Play</> : <>Pause</>}
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
              acereplayer?.stop()
              audioreplayer?.stop()
              aceaudioreplayer?.stop()
              setValue(0)
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
      <input
        disabled={state === "empty" || state === "recording"}
        type="range"
        min="0"
        max="100"
        step="1"
        onChange={handleChange}
        onMouseDown={() => {
          if (state === "playing" && !wasPlaying) {
            setWasPlaying(true)
            aceaudioreplayer?.pause()
          }
        }}
        onMouseUp={() => {
          if (wasPlaying) {
            aceaudioreplayer?.play()
          }
          setWasPlaying(false)
        }}
        value={value}
        style={{ width: "100%" }}
      />
    </div>
  )
}

const SeparatePlayWithAudioRecord: React.FC = () => {
  const recordEditor = useRef<Ace.Editor>()
  const replayEditor = useRef<Ace.Editor>()

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
      <h2>Separate Editor and Replay Record and Replay Demo (With Audio)</h2>
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
      <span>Record Editor</span>
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        height="16rem"
        minLines={4}
        maxLines={4}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          recordEditor.current = ace
          if (replayEditor.current) {
            const aceAudioRecorder = new RecordReplayer(recordEditor.current, {
              debug: true,
              replayEditor: replayEditor.current,
            })
            aceAudioRecorder.playbackRate = 2
            aceAudioRecorder.scrollToCursor = true
            setAceAudioReplayer(aceAudioRecorder)
          }
        }}
      />
      <span>Replay Editor</span>
      <AceEditor
        mode="java"
        theme="github"
        width="100%"
        height="4rem"
        readOnly
        minLines={2}
        maxLines={2}
        showPrintMargin={false}
        onBeforeLoad={(ace) => {
          ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        }}
        onLoad={(ace) => {
          replayEditor.current = ace
          if (recordEditor.current) {
            const aceAudioRecorder = new RecordReplayer(recordEditor.current, {
              debug: true,
              replayEditor: replayEditor.current,
            })
            aceAudioRecorder.playbackRate = 2
            aceAudioRecorder.scrollToCursor = true
            setAceAudioReplayer(aceAudioRecorder)
          }
        }}
      />
    </>
  )
}

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
      <SeparatePlayWithAudioRecord />
      <MultiWithAudioRecord />
      <AudioRecord />
      <SingleEditorStream />
    </>
  )
}
