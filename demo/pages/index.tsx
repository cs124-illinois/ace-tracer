import { SingleDemo, MultiDemo } from "~/components"

export default function Home() {
  return (
    <>
      <h1>
        <kbd>ace-tracer</kbd>
      </h1>
      <p>
        Visit the <a href="https://github.com/cs124-illinois/ace-tracer">project homepage</a>
      </p>
      <h2>Demo</h2>
      <h3>Single Editor</h3>
      <p>
        This demo shows a single editor recording editing and audio with multiple sessions and a separate playback
        window. Edit contents are streamed below the editor windows. It also demonstrates how trace content can be
        loaded from a remote server and, in local development mode, uploaded as well.
      </p>
      <hr />
      <SingleDemo />
      <h3>Multiple Editor</h3>
      <p>
        This demo shows how we can collect separate traces from multiple independent editor windows, and play them
        together during playback. This is useful for capturing code editing in one window, and result of running the
        code in a second window, while recording cursor position, selections, and scrolling in both windows.
      </p>
      <hr />
      <MultiDemo />
    </>
  )
}
