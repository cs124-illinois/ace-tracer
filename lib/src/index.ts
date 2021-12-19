// organize-imports-ignore
import AceStreamer from "./ace/Streamer"
import AcePlayer from "./ace/Player"
import AceRecorder from "./ace/Recorder"
import AceRecordReplayer from "./ace/RecordReplayer"
import AceMultiRecordReplayer from "./ace/MultiRecordReplayer"
import AudioRecorder from "./audio/Recorder"
import AudioRecordReplayer from "./audio/RecordReplayer"
import RecordReplayer from "./RecordReplayer"
import MultiRecordReplayer from "./MultiRecordReplayer"
export * from "./types"
export type { Ace } from "ace-builds"
export {
  AceStreamer,
  AcePlayer,
  AceRecorder,
  AceRecordReplayer,
  AceMultiRecordReplayer,
  AudioRecorder,
  AudioRecordReplayer,
  MultiRecordReplayer,
}
export default RecordReplayer

export const urlToBase64 = async (url: string): Promise<string> => {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result!.toString().split(",")[1])
    reader.readAsDataURL(blob)
  })
}
