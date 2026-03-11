// Generates synthetic WAV audio files as Blobs for testing.
// Pure TypeScript, no dependencies. Produces valid RIFF/WAV with 16-bit mono PCM at 8000 Hz.

const SAMPLE_RATE = 8000
const BITS_PER_SAMPLE = 16
const NUM_CHANNELS = 1
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8

function writeWavHeader(view: DataView, numSamples: number): void {
  const dataSize = numSamples * NUM_CHANNELS * BYTES_PER_SAMPLE
  const fmtChunkSize = 16
  // RIFF chunk size = 4 (WAVE) + 8 (fmt header) + fmtChunkSize + 8 (data header) + dataSize
  const riffChunkSize = 4 + 8 + fmtChunkSize + 8 + dataSize

  let offset = 0

  // RIFF header
  view.setUint8(offset++, 0x52) // R
  view.setUint8(offset++, 0x49) // I
  view.setUint8(offset++, 0x46) // F
  view.setUint8(offset++, 0x46) // F
  view.setUint32(offset, riffChunkSize, true)
  offset += 4
  view.setUint8(offset++, 0x57) // W
  view.setUint8(offset++, 0x41) // A
  view.setUint8(offset++, 0x56) // V
  view.setUint8(offset++, 0x45) // E

  // fmt sub-chunk
  view.setUint8(offset++, 0x66) // f
  view.setUint8(offset++, 0x6d) // m
  view.setUint8(offset++, 0x74) // t
  view.setUint8(offset++, 0x20) // (space)
  view.setUint32(offset, fmtChunkSize, true)
  offset += 4
  view.setUint16(offset, 1, true) // audio format: PCM
  offset += 2
  view.setUint16(offset, NUM_CHANNELS, true)
  offset += 2
  view.setUint32(offset, SAMPLE_RATE, true)
  offset += 4
  view.setUint32(offset, SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE, true) // byte rate
  offset += 4
  view.setUint16(offset, NUM_CHANNELS * BYTES_PER_SAMPLE, true) // block align
  offset += 2
  view.setUint16(offset, BITS_PER_SAMPLE, true)
  offset += 2

  // data sub-chunk header
  view.setUint8(offset++, 0x64) // d
  view.setUint8(offset++, 0x61) // a
  view.setUint8(offset++, 0x74) // t
  view.setUint8(offset++, 0x61) // a
  view.setUint32(offset, dataSize, true)
}

const WAV_HEADER_SIZE = 44

export function generateSilentWav(durationMs: number): Blob {
  const numSamples = Math.round((durationMs / 1000) * SAMPLE_RATE)
  const dataSize = numSamples * NUM_CHANNELS * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize)
  const view = new DataView(buffer)

  writeWavHeader(view, numSamples)
  // PCM data is already zero-filled by ArrayBuffer constructor

  return new Blob([buffer], { type: "audio/wav" })
}

export function generateClickTrackWav(durationMs: number, clickTimesMs: number[]): Blob {
  const numSamples = Math.round((durationMs / 1000) * SAMPLE_RATE)
  const dataSize = numSamples * NUM_CHANNELS * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize)
  const view = new DataView(buffer)

  writeWavHeader(view, numSamples)

  // Write sine-wave pulses at each click time
  const clickDurationSamples = Math.round(0.05 * SAMPLE_RATE) // 50ms pulse
  const frequency = 1000 // 1000 Hz tone
  const amplitude = 0x6000 // ~75% of max int16 to avoid clipping

  for (const clickMs of clickTimesMs) {
    const startSample = Math.round((clickMs / 1000) * SAMPLE_RATE)
    const endSample = Math.min(startSample + clickDurationSamples, numSamples)

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / SAMPLE_RATE
      const value = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * t))
      // WAV header is 44 bytes, each sample is 2 bytes (16-bit), little-endian
      view.setInt16(WAV_HEADER_SIZE + i * BYTES_PER_SAMPLE, value, true)
    }
  }

  return new Blob([buffer], { type: "audio/wav" })
}
