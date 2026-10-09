import { AceTrace, IRecordReplayer } from "@cs124/ace-recorder-types"
import AceMultiRecordReplayer from "./ace/MultiRecordReplayer"
import SyncedRecordReplayer from "./SyncedRecordReplayer"

class MultiRecordReplayer extends SyncedRecordReplayer<Record<string, AceTrace>, AceMultiRecordReplayer> {
  constructor(...a: ConstructorParameters<typeof AceMultiRecordReplayer>) {
    super(new AceMultiRecordReplayer(...a))
  }
}

namespace MultiRecordReplayer {
  export type Content = { audio: string; ace: Record<string, AceTrace> | undefined }
  export type State = IRecordReplayer.State
}

export default MultiRecordReplayer
