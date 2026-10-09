import { AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
import AceRecordReplayer from "./ace/RecordReplayer"
import SyncedRecordReplayer from "./SyncedRecordReplayer"

class RecordReplayer extends SyncedRecordReplayer<AceTrace, AceRecordReplayer> {
  constructor(...a: ConstructorParameters<typeof AceRecordReplayer>) {
    super(new AceRecordReplayer(...a))
  }
}

namespace RecordReplayer {
  export type Content = { audio: string; ace: AceTrace | undefined }
  export type State = IRecordReplayer.State
}

export default RecordReplayer
