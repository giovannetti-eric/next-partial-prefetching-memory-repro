# partial prefetching memory reproduction

Reproduction for [vercel/next.js#99077](https://github.com/vercel/next.js/issues/99077).

With `partialPrefetching: true`, Next.js 16.3 renders a page four times for each document request to an on-demand slug, instead of once.
When the page's code schedules a timer during the render, each of those four renders stays in memory until its timer fires.
A 10-minute timer then keeps **about 3.8 MiB per request** alive, against 0.55 MiB with the flag off.
`16.4.0-canary.39` behaves the same way, at 4.6 MiB.

Without a timer, nothing is retained on any build: the extra renders are collected.
What the flag changes is how many renders a request produces, and so how much a pending timer keeps.
A production application whose query cache schedules a 10-minute timer per render measured 1.9 MiB per request with the flag on.

## Running it

```bash
npm install
PARTIAL_PREFETCHING=true npm run build
PARTIAL_PREFETCHING=true npm start      # NODE_OPTIONS=--expose-gc, PORT=3100
```

In another shell:

```bash
node scripts/load.mjs 3 300 8 timer     # memory: 3 cycles of 300 distinct slugs on /timer/<slug>
node scripts/count-timers.mjs 10 timer  # renders: timers scheduled per request, by kind of render
```

`load.mjs` drives each cycle through 300 distinct slugs, then `/api/mem` forces a full GC and reports `process.memoryUsage()`.
The delta is retained memory, not garbage waiting to be collected, which is why the server needs `--expose-gc`.
Slugs are fresh on every cycle, because a second pass over the same slugs would be served from the entries the first pass created.

**Read `heapUsed + arrayBuffers`, not `rss`.**
Those two reproduce to three digits across runs, while `rss` wanders by hundreds of MiB on its own.

`count-timers.mjs` sends requests one at a time to fresh slugs, waits for the background work to finish, and reads `/api/timers`.
Every timer is recorded under the work unit type of the render that scheduled it, so the output tells the renders of one request apart.

The flag must be set for both `next build` and `next start`, because the server reads it again at startup.
`scripts/measure.sh <version> <true|false|unset> <route>` runs one row end to end: install, build, start, load, count, stop.
`scripts/matrix.sh` runs every row of the tables below into `results/summary.tsv`, in about 40 minutes.

## Routes

Every route renders the same page.
It holds a `"use cache"` scope per slug returning about 565 KB of paragraphs.
`generateStaticParams` returns a single seed entry, so every other slug is rendered on demand from the fallback shell.
`params` is only read under `<Suspense>`, and `cacheComponents` is on.
The routes differ in one thing each:

| route | what it adds |
| --- | --- |
| `/plain/[slug]` | nothing |
| `/opt-in/[slug]` | `export const prefetch = "partial"` on the segment |
| `/timer/[slug]` | a server component that calls `setTimeout(() => {}, 600_000).unref()` during the render |
| `/opt-in-timer/[slug]` | the `/timer` component, on a segment that exports `prefetch = "partial"` |
| `/client-timer/[slug]` | the same timer, from a client component while it is server-rendered to HTML |
| `/[slug]` | reads `headers()`, so the route has no prerendered shell per slug |

The timer callback is empty and captures nothing.
Its delay comes from `NEXT_PUBLIC_TIMER_MS`, 10 minutes by default.
It stands in for any library that schedules per-request cleanup work: a query cache's garbage-collection delay, a connection pool's idle timeout, a debounced logger.
Node propagates the `AsyncLocalStorage` context into timers, so a timer's `AsyncContextFrame` keeps the stores of the render that scheduled it reachable until it fires.

## Measured

Node v24.5.0, macOS 27 on arm64, concurrency 8.
Every row was run back to back on the same machine by `scripts/matrix.sh`.
Memory is in KiB retained per request, per cycle of 300 distinct slugs, after a forced GC.
Renders are the timers one request scheduled, by the kind of render that scheduled them.

| build | route | `partialPrefetching` | cycle 1 | cycle 2 | cycle 3 | renders per request |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 16.3.6 | `/timer` | `true` | **3808** | **3763** | **3820** | 4: request, prerender-runtime, 2 prerender |
| 16.3.6 | `/timer` | `false` | 678 | 550 | 544 | 1: request |
| 16.3.6 | `/opt-in-timer` | `false` | 1489 | 1496 | 1491 | 2: request, prerender-runtime |
| 16.3.6 | `/client-timer` | `true` | **4717** | **4729** | **4746** | 3 SSR passes |
| 16.3.6 | `/client-timer` | `false` | 1364 | 1235 | 1230 | 1 SSR pass |
| 16.2.6 | `/timer` | n/a | 1105 | 957 | 957 | 1: request |
| 16.4.0-canary.39 | `/timer` | `true` | **4611** | **4589** | **4616** | 4: request, prerender-runtime, 2 prerender |
| 16.4.0-canary.39 | `/timer` | `false` | 675 | 551 | 545 | 1: request |
| 16.3.6 | `/timer`, 5 s timer | `true` | 618 | 93 | 46 | 4: request, prerender-runtime, 2 prerender |
| 16.3.6 | `/plain` | `true` | 134 | 19 | 0 | |
| 16.3.6 | `/plain` | `false` | 134 | 4 | 0 | |
| 16.3.6 | `/opt-in` | `false` | 150 | 4 | 0 | |
| 16.3.6 | `/[slug]` | `true` | 144 | 2 | 0 | |
| 16.3.6 | `/[slug]` | `false` | 143 | 4 | 1 | |
| 16.2.6 | `/plain` | n/a | 133 | 5 | 0 | |

The 130 to 150 KiB of cycle 1 on the flat rows is a buffer pool filling once.
Healthy builds are flat from cycle 2 on.
`rss` was at 3.8 GiB after the third cycle of the first row.

What the tables say:

- **The extra renders are collected.**
  With the flag on, a document request for `/plain/<slug>` returns 960 KB instead of 571 KB, and carries five copies of the paragraph text instead of three.
  The runtime prefetch did run and was embedded, as vercel/next.js#97386 describes.
  Memory after the requests is still flat.
- **A pending timer keeps the render that scheduled it, on every build.**
  16.2.6 holds about 1 MiB per request while the timer is pending, 16.3.6 with the flag off about 0.55 MiB.
- **With the flag, the page's code runs four times per request, and every run schedules its own timer.**
  The request render is the only one without the flag.
  The runtime prefetch adds a `prerender-runtime` render, and the upgrade of the fallback shell adds two `prerender` passes.
  Each render is kept by the timer it scheduled, so the request costs 3.8 MiB instead of 0.55 MiB.
- **The two costs separate.**
  `/opt-in-timer` with the flag off runs the runtime prefetch without the shell upgrade, and costs 1.5 MiB.
  The runtime prefetch accounts for about 0.95 MiB of the difference, the shell upgrade for about 2.3 MiB.
- **A client component shows the same thing.**
  Its timer is scheduled three times per request instead of once, and the request costs 4.7 MiB instead of 1.2 MiB.
- **This is a retention window, not an unbounded leak.**
  With a 5-second timer the memory comes back as the timers fire.
  At production request rates a 10-minute window is fatal all the same: 20 requests/s for 600 s at 3.8 MiB is 45 GiB.

## Where the renders come from

For a slug that `generateStaticParams` did not return, the flag starts two pieces of background work after the response.

- **The runtime prefetch.**
  When `renderOpts.partialPrefetching` is set, or a segment exports `prefetch = 'partial'`, the request store gets a prerender resume data cache and a `CacheSignal`.
  Once the dynamic render has filled the caches, `spawnRuntimePrefetchWithFilledCaches` runs a full `prerender-runtime` render of the route and pipes it into the RSC payload.
  See [`app-render.tsx`](https://github.com/vercel/next.js/blob/v16.3.6/packages/next/src/server/app-render/app-render.tsx#L3611-L3645).
- **The upgrade of the fallback shell.**
  After serving the fallback shell, the page handler schedules `responseCache.revalidate` on the next tick.
  It prerenders a shell specific to the requested params and stores it as a new ISR entry.
  That prerender runs in two passes, a prospective one that fills the caches and a final one, hence the two `prerender` renders.
  This path is gated on `nextConfig.partialPrefetching` only, so the segment export does not turn it on.
  See [`app-page-runtime.ts`](https://github.com/vercel/next.js/blob/v16.3.6/packages/next/src/build/templates/app-page-runtime.ts#L1282-L1330).

## Where the memory is

Heap snapshot of the 16.3.6 `true` `/timer` build after 160 requests, 60 warm-up and one cycle of 100, analysed with [memlab](https://github.com/facebook/memlab).
Retained sizes by object shape, which overlap: a `Timeout` retains its `AsyncContextFrame`, which retains the Flight request, and so on.

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

One timer of the 600000 ms list, retaining 1.2 MB on its own:

```text
Timeout @668513 [1.2MB]
  --<symbol kAsyncContextFrame>--> AsyncContextFrame @668521 [1.2MB]
    --table--> <array> [1.2MB]      the AsyncLocalStorage stores active when setTimeout ran
      --> Next work unit store, React Flight Request `ew`
          with its `cacheController` (AbortController, 1.1MB), `writtenObjects`, `onError`
```

`ew` is React's Flight `Request`.
The abort reason of its `cacheController.signal` is an `Error` whose V8 stack frames are still structured.
Each frame pins the closures that were on the stack when the render was aborted, the amplifier vercel/next.js#97351 describes.
Through those closures sit the `"use cache"` results of the render and their `ReadableStream`s.
There are four `{ paragraphs, slug }` objects per request, as many as the request has renders.

## The same thing in a production application

A Next 16.3.5 application with `cacheComponents`, `output: standalone`, a custom `cacheHandlers.default`, 940 prerendered routes and on-demand entity pages of about 420 KB.
It uses TanStack Query with `gcTime: 10 * 60 * 1000`, which on the server schedules one 10-minute `setTimeout` per query during SSR.
TanStack's own server default is `Infinity`, which schedules no timer.
Same probe, 960 distinct entity URLs from the production sitemaps, memory read through the Node inspector after a forced GC with `scripts/load-list.mjs`:

| build | cycle 1 | cycle 2 | cycle 3 |
| --- | ---: | ---: | ---: |
| `partialPrefetching: true` | **1865** | **1868** | **2066** |
| `partialPrefetching: false` | -100 | 247 | -5 |
| `partialPrefetching: true`, server `gcTime: Infinity` | 146 | -251 | 667 |

The application's rows are noisier than the reproduction's, since its pages come from a live API.
Heap snapshot after 900 requests with the flag on: the 600000 ms `TimersList` retains 1 GB, and 4499 `Timeout`s each carry an `AsyncContextFrame`.
883 parsed postponed states, `{ type, data, renderResumeDataCache }` of 635 KB each, are still alive, one per request.
Each `Timeout` is the `#gcTimeout` of a TanStack `Query`.
With the flag off the same timers exist, but the application retains nothing measurable, where `/client-timer` retains 1.2 MiB.
The difference between the two is not explained here.

## Measuring a real application

`scripts/load-list.mjs` is the same measurement for a server that has no `/api/mem` route.
Distinct URLs come from a file, memory is read through the Node inspector with `HeapProfiler.collectGarbage` then `process.memoryUsage()`, and an optional `Host` header drives domain-based routing.
Start the server as a single process with `NODE_OPTIONS=--inspect=127.0.0.1:9230`, using the standalone `server.js` rather than `next start`, which runs the server in a child process.
Then run:

```bash
node scripts/load-list.mjs urls.txt 3 300 8 http://localhost:3200 localhost:3200 http://127.0.0.1:9230 ./snapshots
```

`scripts/probe.mjs mem|snapshot` exposes the same two operations on their own.
