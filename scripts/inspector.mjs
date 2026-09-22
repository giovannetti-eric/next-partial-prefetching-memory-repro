// Minimal CDP client over the Node inspector: forced full GC, process.memoryUsage(),
// heap snapshots. The target server runs with NODE_OPTIONS=--inspect=<port>.
import { createWriteStream } from "node:fs";

export async function connect(inspectorUrl = "http://127.0.0.1:9230") {
  const targets = await (await fetch(`${inspectorUrl}/json`)).json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("HeapProfiler.enable");

  const gc = async () => {
    await send("HeapProfiler.collectGarbage");
    await send("HeapProfiler.collectGarbage");
  };
  const mib = (n) => +(n / 1048576).toFixed(1);

  return {
    // Full GC first, so the numbers are retained memory rather than pending garbage.
    async mem() {
      await gc();
      const { result } = await send("Runtime.evaluate", {
        expression: "JSON.stringify(process.memoryUsage())",
        returnByValue: true,
      });
      const m = JSON.parse(result.value);
      return { rssMiB: mib(m.rss), heapUsedMiB: mib(m.heapUsed), externalMiB: mib(m.external), arrayBuffersMiB: mib(m.arrayBuffers) };
    },
    async snapshot(file) {
      await gc();
      const out = createWriteStream(file);
      const done = new Promise((resolve) => {
        listeners.add((msg) => {
          if (msg.method === "HeapProfiler.addHeapSnapshotChunk") out.write(msg.params.chunk);
          if (msg.method === "HeapProfiler.reportHeapSnapshotProgress" && msg.params.finished) resolve();
        });
      });
      await send("HeapProfiler.takeHeapSnapshot", { reportProgress: true });
      await done;
      out.end();
      await new Promise((r) => out.on("finish", r));
      return file;
    },
    close: () => ws.close(),
  };
}
