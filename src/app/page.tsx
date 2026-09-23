export default function Home() {
  return (
    <main>
      <h1>partial prefetching memory reproduction</h1>
      <p>
        Build, start, then run <code>npm run load</code>. <code>/plain/any-slug</code> is the page,{" "}
        <code>/timer/any-slug</code> adds a pending 10-minute timer from a server component,{" "}
        <code>/client-timer/any-slug</code> the same timer from a client component during SSR,{" "}
        <code>/opt-in-timer/any-slug</code> the server timer on a segment that exports{" "}
        <code>prefetch = "partial"</code>, <code>/opt-in/any-slug</code> that export without the timer,{" "}
        <code>/any-slug</code> reads <code>headers()</code>.
      </p>
    </main>
  );
}
