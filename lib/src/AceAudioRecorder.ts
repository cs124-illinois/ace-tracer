import { AudioRecorder } from "./AudioRecorder"
import { AceRecorder } from "./AceRecorder"

export class AceAudioRecorder extends AudioRecorder {
  private _ace: AceRecorder | undefined

  constructor(...audio: ConstructorParameters<typeof AudioRecorder>) {
    super(...audio)
  }
  public setAce(...ace: ConstructorParameters<typeof AceRecorder>) {
    this._ace = new AceRecorder(...ace)
    return this
  }
  public get ace() {
    return this._ace
  }
  private checkAceRecorder() {
    if (!this._ace) {
      throw new Error("setAceRecorder not called")
    }
  }
  public async start() {
    this.checkAceRecorder()
    await this._ace!.start()
    super.start()
  }
  public async stop() {
    this.checkAceRecorder()
    await this._ace!.stop()
    super.stop()
  }
  public pause() {
    throw new Error("Pause and resume not supported for Ace recording")
  }
  public resume() {
    throw new Error("Pause and resume not supported for Ace recording")
  }
  public get recording() {
    this.checkAceRecorder()
    return this.blob && this._ace!.src && { audio: this.src!, ace: this._ace!.src }
  }
}
