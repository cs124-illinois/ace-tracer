import dynamic from "next/dynamic"

const Demo = dynamic(() => import("../components/Demo"), { ssr: false })

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
      <Demo />
    </>
  )
}
