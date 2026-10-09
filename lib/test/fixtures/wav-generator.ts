// Generates synthetic WAV audio files as Blobs for testing.
// Pure TypeScript, no dependencies. Produces valid RIFF/WAV with 16-bit mono PCM.

const DEFAULT_SAMPLE_RATE = 8000
const BITS_PER_SAMPLE = 16
const NUM_CHANNELS = 1
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const WAV_HEADER_SIZE = 44

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

function writeWavHeader(view: DataView, numSamples: number, sampleRate: number): void {
  const dataSize = numSamples * NUM_CHANNELS * BYTES_PER_SAMPLE
  const fmtChunkSize = 16
  // RIFF chunk size = 4 (WAVE) + 8 (fmt header) + fmtChunkSize + 8 (data header) + dataSize
  const riffChunkSize = 4 + 8 + fmtChunkSize + 8 + dataSize

  writeAscii(view, 0, "RIFF")
  view.setUint32(4, riffChunkSize, true)
  writeAscii(view, 8, "WAVE")

  writeAscii(view, 12, "fmt ")
  view.setUint32(16, fmtChunkSize, true)
  view.setUint16(20, 1, true) // audio format: PCM
  view.setUint16(22, NUM_CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * NUM_CHANNELS * BYTES_PER_SAMPLE, true) // byte rate
  view.setUint16(32, NUM_CHANNELS * BYTES_PER_SAMPLE, true) // block align
  view.setUint16(34, BITS_PER_SAMPLE, true)

  writeAscii(view, 36, "data")
  view.setUint32(40, dataSize, true)
}

function silentWavBytes(durationMs: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const numSamples = Math.round((durationMs / 1000) * sampleRate)
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + numSamples * NUM_CHANNELS * BYTES_PER_SAMPLE)
  writeWavHeader(new DataView(buffer), numSamples, sampleRate)
  // PCM data is already zero-filled by ArrayBuffer constructor
  return new Uint8Array(buffer)
}

export function generateSilentWav(durationMs: number, sampleRate = DEFAULT_SAMPLE_RATE): Blob {
  return new Blob([silentWavBytes(durationMs, sampleRate)], { type: "audio/wav" })
}

// Duration in seconds from a WAV header, or undefined if the bytes aren't a WAV file
export function wavDuration(bytes: Uint8Array): number | undefined {
  if (bytes.length < WAV_HEADER_SIZE) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (ascii(0) !== "RIFF" || ascii(8) !== "WAVE") {
    return undefined
  }
  return view.getUint32(40, true) / view.getUint32(28, true)
}

// A data: URL for a silent WAV, small enough to inline: the mock audio element only reads the header
export function silentWavUrl(durationMs: number): string {
  return `data:audio/wav;base64,${Buffer.from(silentWavBytes(durationMs, 1000)).toString("base64")}`
}
