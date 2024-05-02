import Ace, { IAceEditorProps } from "react-ace"

const DefaultAceEditor: React.FC<IAceEditorProps> = (props) => {
  return (
    <Ace
      mode="java"
      theme="github"
      width="100%"
      minLines={4}
      maxLines={4}
      showPrintMargin={false}
      onBeforeLoad={(ace) => {
        ace.config.set("basePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        ace.config.set("modePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
        ace.config.set("themePath", `https://cdn.jsdelivr.net/npm/ace-builds@${ace.version}/src-min-noconflict`)
      }}
      {...props}
    />
  )
}
export default DefaultAceEditor
