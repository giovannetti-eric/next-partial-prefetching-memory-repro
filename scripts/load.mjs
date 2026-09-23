// Drives cycles of distinct slugs through the running server and reports how much
// memory the process still holds after each cycle, after a forced GC.
//
//   node scripts/load.mjs [cycles] [perCycle] [concurrency] [route] [baseUrl]
//
//   route: "" (default) hits /<slug>; "plain", "opt-in", "timer", "opt-in-timer" or
//   "client-timer" hit /<route>/<slug>

const cycles = Number(process.argv[2] ?? 3);
const perCycle = Number(process.argv[3] ?? 300);
const concurrency = Number(process.argv[4] ?? 8);
const route = process.argv[5] ?? "";
const base = process.argv[6] ?? "http://127.0.0.1:3100";

// Slugs must be new on every cycle: a second pass over the same slugs would hit
// the cache filled by the first and report no retention at all.
const runId = String(Date.now()).slice(-7);
const prefix = route ? `/${route}/` : "/";

const mem = async () => (await fetch(`${base}/api/mem`)).json();

async function run(slugs) {
  let next = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const slug = slugs[next++];
      const res = await fetch(`${base}${prefix}${slug}`);
      if (res.status !== 200) throw new Error(`${prefix}${slug} -> ${res.status}`);
      await res.arrayBuffer();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

const fmt = (m) =>
  `rss ${String(m.rssMiB).padStart(7)} MiB | heapUsed ${String(m.heapUsedMiB).padStart(7)} MiB | arrayBuffers ${String(m.arrayBuffersMiB).padStart(7)} MiB`;

// Fill whatever caches exist first, so the measured cycles are not cache fill.
await run(Array.from({ length: 60 }, (_, i) => `warm-${runId}-${i}`));
let before = await mem();
if (!before.exposeGc) {
  console.error("start the server with --expose-gc (npm start does this) or the numbers include uncollected garbage");
}
console.log(`route ${prefix}<slug>, ${cycles} cycles of ${perCycle} distinct slugs, concurrency ${concurrency}`);
console.log(`start   ${fmt(before)}`);

const perRequest = [];
for (let c = 1; c <= cycles; c++) {
  await run(Array.from({ length: perCycle }, (_, i) => `c${c}-${runId}-${i}`));
  const after = await mem();
  const dHeap = after.heapUsedMiB - before.heapUsedMiB;
  const dBuffers = after.arrayBuffersMiB - before.arrayBuffersMiB;
  // heapUsed + arrayBuffers is the number to read; rss wanders on its own.
  const retained = Math.round(((dHeap + dBuffers) * 1024) / perCycle);
  perRequest.push(retained);
  console.log(`cycle ${c} ${fmt(after)} | delta heapUsed ${dHeap.toFixed(1)} MiB, arrayBuffers ${dBuffers.toFixed(1)} MiB -> ${retained} KiB retained per request`);
  before = after;
}

console.log(`\nretained per request: ${perRequest.map((k) => `${k} KiB`).join(" / ")}`);
console.log(JSON.stringify({ route: prefix, cycles, perCycle, concurrency, perRequestKiB: perRequest, finalRssMiB: before.rssMiB }));
