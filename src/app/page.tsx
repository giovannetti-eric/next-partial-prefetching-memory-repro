export default function Home() {
  return (
    <main>
      <h1>partial prefetching memory reproduction</h1>
      <p>
        Build, start, then run <code>npm run load</code>. <code>/plain/any-slug</code> is the page,{" "}
        <code>/timer/any-slug</code> adds a pending 10-minute timer during the render,{" "}
        <code>/opt-in/any-slug</code> exports <code>prefetch = "partial"</code>, <code>/any-slug</code> reads{" "}
        <code>headers()</code>.
      </p>
    </main>
  );
}
