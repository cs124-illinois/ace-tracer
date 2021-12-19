import dynamic from "next/dynamic"

// const SingleDemo = dynamic(() => import("../components/SingleDemo"), { ssr: false })
const MultiDemo = dynamic(() => import("../components/MultiDemo"), { ssr: false })

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
      <MultiDemo />
    </>
  )
}
