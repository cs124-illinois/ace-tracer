import { AceRecordReplayer } from "@cs124/aceaudio-recorder"
import dynamic from "next/dynamic"
import { useState } from "react"
import PlayerControls from "./PlayerControls"

const AceEditor = dynamic(() => import("react-ace"), { ssr: false })

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
export default SingleEditorRecord
