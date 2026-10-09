// Minimal static server for the exported demo (demo/out). Supports Range requests, which browsers need to seek audio.
import { stat } from "node:fs/promises"
import { join, normalize } from "node:path"

const [root = "demo/out", port = "3124"] = process.argv.slice(2)

const resolvePath = async (pathname: string) => {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")
  const candidate = join(root, relative)
  const info = await stat(candidate).catch(() => undefined)
  if (info?.isDirectory()) {
    return join(candidate, "index.html")
  }
  return info?.isFile() ? candidate : undefined
}

Bun.serve({
  port: Number(port),
  async fetch(request) {
    const path = await resolvePath(new URL(request.url).pathname)
    if (!path) {
      return new Response(Bun.file(join(root, "404.html")), { status: 404 })
    }
    const file = Bun.file(path)
    const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/)
    if (!range) {
      return new Response(file, { headers: { "Accept-Ranges": "bytes" } })
    }
    const size = file.size
    const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1])
    const end = range[1] !== "" && range[2] !== "" ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
    }
    return new Response(file.slice(start, end + 1), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Type": file.type,
      },
    })
  },
})

console.log(`Serving ${root} on http://localhost:${port}`)
