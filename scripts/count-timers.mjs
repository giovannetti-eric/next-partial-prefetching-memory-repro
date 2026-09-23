// Counts how many times the page's render code runs per document request, by
// reading how many timers each kind of render scheduled.
//
//   node scripts/count-timers.mjs [requests] [route] [baseUrl]
//
//   route: "timer" (default), "opt-in-timer" or "client-timer"
//
// Requests go one at a time to fresh slugs. The background work a request
// starts (the runtime prefetch, the upgrade of the fallback shell) finishes
// after the response, so the script waits before reading the counters.

const requests = Number(process.argv[2] ?? 10);
const route = process.argv[3] ?? "timer";
const base = process.argv[4] ?? "http://127.0.0.1:3100";
const runId = String(Date.now()).slice(-7);

const read = async () => (await fetch(`${base}/api/timers`)).json();
const settle = () => new Promise((r) => setTimeout(r, 3000));

// Let background renders from earlier traffic finish before the first reading.
await settle();
const before = await read();
for (let i = 0; i < requests; i++) {
  const res = await fetch(`${base}/${route}/count-${runId}-${i}`);
  if (res.status !== 200) throw new Error(`/${route}/count-${runId}-${i} -> ${res.status}`);
  await res.arrayBuffer();
}
await settle();
const after = await read();

const perRequest = {};
for (const kind of Object.keys(after).sort()) {
  const delta = after[kind] - (before[kind] ?? 0);
  if (delta) perRequest[kind] = +(delta / requests).toFixed(2);
}
const total = +Object.values(perRequest).reduce((a, b) => a + b, 0).toFixed(2);
console.log(`/${route}/<slug>, ${requests} requests: ${total} timers per request ${JSON.stringify(perRequest)}`);
console.log(JSON.stringify({ route: `/${route}/`, requests, timersPerRequest: total, byRender: perRequest }));
