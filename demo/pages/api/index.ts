import fs from "fs/promises"
import glob from "glob-promise"
import sortBy from "lodash/sortBy"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function route(request: NextApiRequest, response: NextApiResponse) {
  if (request.method === "POST") {
    const timestamp = new Date().valueOf()
    const { ace, audio } = request.body
    await fs.writeFile(`public/${timestamp}.json`, JSON.stringify(ace))
    await fs.writeFile(`public/${timestamp}.webm`, Buffer.from(audio, "base64"), "binary")
    return response.redirect("/")
  } else if (request.method === "GET") {
    const filenames = sortBy(
      await glob(`public/*`),
      (filename) => parseInt(filename.split(".")[0]),
      (filename) => (filename.split(".")[1] === "json" ? 0 : 1),
    )
    const traces = {} as Record<string, any>
    for (const filename of filenames) {
      const timestamp = filename.split(".")[0]
      if (!traces[timestamp]) {
        traces[timestamp] = { audio: [] }
      }
      if (filename.split(".")[1] === "json") {
        traces[timestamp].trace = `/${filename}`
      } else {
        traces[timestamp].audio.push(`/${filename}`)
      }
    }
    return response.status(200).json(Object.values(traces))
  }
}
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
    },
  },
}
