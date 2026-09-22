# partial prefetching memory reproduction

With `partialPrefetching: true`, a Next.js 16.3 server keeps **about 3.8 MiB per
request** alive for as long as any timer scheduled during that request's render is
pending. Without the flag the same timer pins about 0.55 MiB; on 16.2.6, which has
no partial prefetching, about 1 MiB. On `16.4.0-canary.38` it is 4.6 MiB. A
production application that schedules a 10-minute timer per render (TanStack Query's
`gcTime`) measured 1.9 MiB per request with the flag on and nothing with it off.

The runtime prefetch itself is collected: the same page without the timer retains
nothing on any build. What the flag changes is how much a retained request costs.

## Running it

```bash
npm install
PARTIAL_PREFETCHING=true npm run build
PARTIAL_PREFETCHING=true npm start      # NODE_OPTIONS=--expose-gc, PORT=3100
```

In another shell:

```bash
node scripts/load.mjs 3 300 8 timer     # 3 cycles of 300 distinct slugs on /timer/<slug>
```

Each cycle drives 300 distinct slugs, then `/api/mem` forces a full GC and reports
`process.memoryUsage()`. The delta is retained memory, not garbage waiting to be
collected, which is why the server needs `--expose-gc`. Slugs are fresh on every
cycle: a second pass over the same slugs would hit the cache the first one filled and
report nothing.

**Read `heapUsed + arrayBuffers`, not `rss`.** Those two reproduce to three digits
across runs; `rss` wanders by hundreds of MiB on its own.

The flag must be present for both `next build` and `next start`: the server reads it
again at startup. `scripts/measure.sh <version> <true|false|unset> <route>` does the
install, build, start, load and stop for one row of the table; `scripts/matrix.sh`
runs every row.

## Routes

All three routes render the same page: a `"use cache"` scope per slug returning
~565 KB of paragraphs, `generateStaticParams` with a single seed entry so every other
slug renders on demand, `params` read only under `<Suspense>`. `cacheComponents` is
on. They differ in one thing each:

| route | what it adds |
| --- | --- |
| `/plain/[slug]` | nothing |
| `/opt-in/[slug]` | `export const prefetch = "partial"` on the segment |
| `/timer/[slug]` | one `setTimeout(() => {}, 600_000).unref()` during the render, in a server component under the Suspense boundary. The callback is empty and holds nothing; the delay comes from `NEXT_PUBLIC_TIMER_MS` (default 10 minutes) |

The timer stands in for any library that schedules per-request cleanup work: a query
cache's garbage-collection delay, a connection pool's idle timeout, a debounced
logger. Node propagates the `AsyncLocalStorage` context into timers, so the timer's
`AsyncContextFrame` keeps the render's stores reachable until it fires.

## Measured

Node v24.5.0 (V8 13.6), macOS 27 / arm64, concurrency 8, three consecutive cycles of
300 distinct slugs, KiB retained per request per cycle after a forced GC. Same machine
and same script, rows run back to back.

| build | route | `partialPrefetching` | cycle 1 | cycle 2 | cycle 3 |
| --- | --- | --- | ---: | ---: | ---: |
| 16.3.6 | `/timer` | `true` | **3826** | **3777** | **3793** |
| 16.3.6 | `/timer` | `false` | 678 | 550 | 544 |
| 16.2.6 | `/timer` | n/a | 1105 | 965 | 960 |
| 16.4.0-canary.38 | `/timer` | `true` | **4661** | **4634** | **4646** |
| 16.3.6 | `/timer`, 5 s timer | `true` | 744 | 20 | -72 |
| 16.3.6 | `/plain` | `true` | 146 | 8 | 2 |
| 16.3.6 | `/[slug]` | `true` | 147 | 2 | 1 |
| 16.3.6 | `/[slug]` | `false` | 143 | 4 | 1 |
| 16.3.6 | `/opt-in` | `false` | 149 | 3 | 1 |
| 16.2.6 | `/plain` | n/a | 134 | 4 | 0 |

The ~140 KiB of cycle 1 on the flat rows is a buffer pool filling once; healthy
builds are flat from cycle 2 on. `rss` was at 3.8 GiB after the third cycle of the
16.3.6 `true` row.

Three things the table says:

- **The runtime prefetch runs and is collected.** With the flag on, a plain document
  request for `/plain/<slug>` returns 964 KB instead of 574 KB and carries five copies
  of the paragraph text instead of three: the runtime prefetch prerendered the whole
  route and embedded it, as vercel/next.js#97386 describes. Memory after the request
  is flat. `/opt-in/<slug>` with the flag off behaves the same way.
- **A pending timer pins the request, on every build.** 16.2.6 holds about 1 MiB per
  request while the timer is pending, 16.3.6 with the flag off about 0.55 MiB.
- **The flag makes each pinned request 7 times heavier.** 3.8 MiB on 16.3.6, 4.6 MiB on the
  16.4 canary. With a 5-second timer the memory comes back as the timers fire
  (cycle 2 and 3 are flat), so this is a retention window, not an unbounded leak.
  At production request rates a 10-minute window is fatal all the same:
  20 requests/s x 600 s x 3.8 MiB is 45 GiB.

## Where the memory is

Heap snapshot of the 16.3.6 `true` `/timer` build after 160 requests (60 warm-up + one
cycle of 100), 3728 KiB retained per request, analysed with
[memlab](https://github.com/facebook/memlab). Retained sizes by shape:

```text
TimersList (the 600000 ms list)     237.7 MB   N: 1
AsyncContextFrame                   206.5 MB   N: 1422
Timeout                             156.6 MB   N: 3020
ew (React Flight Request)           133.1 MB   N: 714
Object { paragraphs, slug }         123.7 MB   N: 637
Error                                85.5 MB   N: 2205
ReadableStream                       71.8 MB   N: 669
Object { cookies, dynamicTracking,
  stale, ... } (work unit store)     70.9 MB   N: 160
```

One timer of the 600000 list, retaining 1.2 MB on its own:

```text
Timeout @668513 [1.2MB]
  --<symbol kAsyncContextFrame>--> AsyncContextFrame @668521 [1.2MB]
    --table--> <array> [1.2MB]      the AsyncLocalStorage stores active when setTimeout ran
      --> Next work unit store (prerender-runtime / request), React Flight Request `ew`
          with its `cacheController` (AbortController, 1.1MB), `writtenObjects`, `onError`
```

`ew` is React's Flight `Request` (`pingedTasks`, `completedRegularChunks`,
`writtenObjects`, `cacheController`, `onError`). Its `cacheController.signal`'s
abort reason is an `Error` whose V8 stack frames are still structured, and each frame
pins the closures that were on the stack when the render was aborted, the amplifier
vercel/next.js#97351 describes. Through those closures sit the `"use cache"` results
of that request (`Object { paragraphs, slug }`, 4 copies per request across the
dynamic render, the runtime prerender and the resume data caches) and their
`ReadableStream`s.

What the flag adds to the request's graph, from `app-render.js`: when
`renderOpts.partialPrefetching` is set or a segment exports `prefetch = 'partial'`,
the request store gets a `prerenderResumeDataCache` (`requestStore.resumeDataCache =
createPrerenderResumeDataCache()`), a `CacheSignal`, and a `TransformStream` for the
runtime prefetch; the dynamic render fills the resume data cache with every cache
entry it reads, and `spawnRuntimePrefetchWithFilledCaches` then runs a full
`prerender-runtime` render of the route from it. Everything reachable from the
request store, which the timer's `AsyncContextFrame` reaches, now includes a second
copy of the route's cache entries as streams, the second render's Flight request, and
the second render's abort controller with its frame-carrying reason. None of it is
released when the response and the runtime prefetch settle; it waits for the GC,
which waits for the timer.

## The same thing in a production application

A Next 16.3.5 application (`cacheComponents`, `output: standalone`, custom
`cacheHandlers.default`, 940 prerendered routes, on-demand entity pages of ~420 KB).
It uses TanStack Query with `gcTime: 10 * 60 * 1000`, which on the server schedules
one 10-minute `setTimeout` per query during SSR. TanStack's own server default is
`Infinity`, precisely to avoid that timer. Same probe, 960 distinct entity URLs from
the production sitemaps, memory read through the Node inspector after a forced GC
(`scripts/load-list.mjs`):

| build | cycle 1 | cycle 2 | cycle 3 |
| --- | ---: | ---: | ---: |
| `partialPrefetching: true` | **1865** | **1868** | **2066** |
| `partialPrefetching: false` | -100 | 247 | -5 |
| `partialPrefetching: true`, server `gcTime: Infinity` | 146 | -251 | 667 |

Heap snapshot after 900 requests with the flag on: the 600000 ms `TimersList` retains
1 GB, 4499 `Timeout`s each carry an `AsyncContextFrame`, and 883 parsed postponed
states (`{ type, data, renderResumeDataCache }`, 635 KB each) are still alive, one
per request. Each `Timeout` is the `#gcTimeout` of a TanStack `Query`. With the flag
off, the same timers exist and the same requests are pinned, but the pinned graph
weighs nothing measurable.

## Measuring a real application

`scripts/load-list.mjs` is the same measurement for a server that has no `/api/mem`
route: distinct URLs come from a file, memory is read through the Node inspector
(`HeapProfiler.collectGarbage`, then `process.memoryUsage()`), and an optional `Host`
header drives domain-based routing. Start the server as a single process with
`NODE_OPTIONS=--inspect=127.0.0.1:9230` (the standalone `server.js`, not `next
start`, which forks) and run:

```bash
node scripts/load-list.mjs urls.txt 3 300 8 http://localhost:3200 localhost:3200 http://127.0.0.1:9230 ./snapshots
```

`scripts/probe.mjs mem|snapshot` exposes the same two operations on their own.
