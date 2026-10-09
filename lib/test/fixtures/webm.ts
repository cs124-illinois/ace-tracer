// Just enough WebM (EBML) to exercise fix-webm-duration. Chrome's MediaRecorder writes WebM without a Duration
// element, which is why browsers report an infinite duration for recordings until it's patched in.

const EBML = [0x1a, 0x45, 0xdf, 0xa3]
const SEGMENT = [0x18, 0x53, 0x80, 0x67]
const INFO = [0x15, 0x49, 0xa9, 0x66]
const TIMECODE_SCALE = [0x2a, 0xd7, 0xb1]
const DURATION = [0x44, 0x89]

// One-byte size fields are enough for the tiny elements built here
const element = (id: number[], content: number[]) => {
  if (content.length > 0x7e) {
    throw new Error("Element too large for a one-byte size")
  }
  return [...id, 0x80 | content.length, ...content]
}

// A WebM file whose Info has a TimecodeScale of 1ms and no Duration, like a MediaRecorder recording
export function webmWithoutDuration(): Uint8Array<ArrayBuffer> {
  const info = element(INFO, element(TIMECODE_SCALE, [0x0f, 0x42, 0x40]))
  return new Uint8Array([...element(EBML, []), ...element(SEGMENT, info)])
}

// Duration in seconds from a WebM file: undefined if the bytes aren't WebM, Infinity if Duration is missing
export function webmDuration(bytes: Uint8Array): number | undefined {
  if (!EBML.every((byte, i) => bytes[i] === byte)) {
    return undefined
  }
  const timecodeScale = findElement(bytes, TIMECODE_SCALE)
  const duration = findElement(bytes, DURATION)
  if (!duration) {
    return Infinity
  }
  const view = new DataView(duration.buffer, duration.byteOffset, duration.byteLength)
  const value = duration.length === 8 ? view.getFloat64(0) : view.getFloat32(0)
  const scale = timecodeScale ? timecodeScale.reduce((total, byte) => total * 256 + byte, 0) : 1000000
  return (value * scale) / 1e9
}

const findElement = (bytes: Uint8Array, id: number[]) => {
  for (let i = 0; i + id.length < bytes.length; i++) {
    if (id.every((byte, j) => bytes[i + j] === byte)) {
      const size = bytes[i + id.length] & 0x7f
      const start = i + id.length + 1
      return bytes.subarray(start, start + size)
    }
  }
  return undefined
}
