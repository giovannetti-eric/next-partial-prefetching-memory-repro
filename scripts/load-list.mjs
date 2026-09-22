// Same measurement as load.mjs, for a real application: distinct URLs come from a
// file (one path per line), memory is read through the Node inspector, and an
// optional Host header drives domain-based routing.
//
//   node scripts/load-list.mjs <urlFile> [cycles] [perCycle] [concurrency] [baseUrl] [host] [inspectorUrl] [snapshotDir]
//
// With snapshotDir set, a heap snapshot is written after the warm-up and after
// the last cycle.
import { readFileSync } from "node:fs";
import { connect } from "./inspector.mjs";

const [urlFile, cyclesArg, perArg, concArg, baseArg, host, inspectorUrl, snapshotDir] = process.argv.slice(2);
const cycles = Number(cyclesArg ?? 3);
const perCycle = Number(perArg ?? 300);
const concurrency = Number(concArg ?? 8);
const base = baseArg ?? "http://127.0.0.1:3200";

const paths = readFileSync(urlFile, "utf8").split("\n").filter(Boolean);
const needed = 60 + cycles * perCycle;
if (paths.length < needed) throw new Error(`${urlFile} has ${paths.length} paths, need ${needed}`);
let cursor = 0;
const take = (n) => paths.slice(cursor, (cursor += n));

const headers = host ? { host } : {};
const statuses = {};
async function run(list) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const p = list[next++];
      const res = await fetch(`${base}${p}`, { headers, redirect: "manual" });
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      await res.arrayBuffer();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

const fmt = (m) =>
  `rss ${String(m.rssMiB).padStart(7)} MiB | heapUsed ${String(m.heapUsedMiB).padStart(7)} MiB | arrayBuffers ${String(m.arrayBuffersMiB).padStart(7)} MiB`;

const target = await connect(inspectorUrl || undefined);
await run(take(60));
let before = await target.mem();
if (snapshotDir) console.log(`snapshot ${await target.snapshot(`${snapshotDir}/after-warmup.heapsnapshot`)}`);
console.log(`${cycles} cycles of ${perCycle} distinct URLs from ${urlFile}, concurrency ${concurrency}${host ? `, Host: ${host}` : ""}`);
console.log(`start   ${fmt(before)}`);

const perRequest = [];
for (let c = 1; c <= cycles; c++) {
  await run(take(perCycle));
  const after = await target.mem();
  const dHeap = after.heapUsedMiB - before.heapUsedMiB;
  const dBuffers = after.arrayBuffersMiB - before.arrayBuffersMiB;
  const retained = Math.round(((dHeap + dBuffers) * 1024) / perCycle);
  perRequest.push(retained);
  console.log(`cycle ${c} ${fmt(after)} | delta heapUsed ${dHeap.toFixed(1)} MiB, arrayBuffers ${dBuffers.toFixed(1)} MiB -> ${retained} KiB retained per request`);
  before = after;
}
if (snapshotDir) console.log(`snapshot ${await target.snapshot(`${snapshotDir}/after-cycles.heapsnapshot`)}`);
console.log(`\nstatuses ${JSON.stringify(statuses)}`);
console.log(`retained per request: ${perRequest.map((k) => `${k} KiB`).join(" / ")}`);
console.log(JSON.stringify({ urlFile, cycles, perCycle, concurrency, host: host ?? null, perRequestKiB: perRequest, finalRssMiB: before.rssMiB, statuses }));
target.close();
