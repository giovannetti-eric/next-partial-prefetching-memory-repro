#!/usr/bin/env bash
# One measurement: install a Next version, build with the flag set (or unset),
# start, drive the load script against a route, count the renders per request on
# timer routes, stop, append the result line.
#
#   scripts/measure.sh <next-version> <true|false|unset> <route> [cycles] [perCycle]
#
#   route: root (hits /<slug>), plain, opt-in, timer, opt-in-timer or client-timer
#
# NEXT_PUBLIC_TIMER_MS, when set, changes the timer delay (default 10 minutes).
# Results land in results/<version>_<flag>_<route>[_<ms>ms].log (full output) and
# results/summary.tsv (one line per run).
set -euo pipefail
cd "$(dirname "$0")/.."

version="$1"; flag="$2"; route="$3"; cycles="${4:-3}"; per="${5:-300}"
[ "$route" = "root" ] && routeArg="" || routeArg="$route"
timer_ms="${NEXT_PUBLIC_TIMER_MS:-600000}"
suffix=""
[ -n "${NEXT_PUBLIC_TIMER_MS:-}" ] && suffix="_${timer_ms}ms"
mkdir -p results
log="results/${version}_${flag}_${route}${suffix}.log"
: >"$log"

port_busy() { lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; }

if port_busy; then
  echo "port 3100 is busy" >&2; exit 1
fi

installed=$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)
if [ "$installed" != "$version" ]; then
  npm install --no-save --no-audit --no-fund "next@$version" >>"$log" 2>&1
fi

env_flag=()
[ "$flag" != "unset" ] && env_flag=(PARTIAL_PREFETCHING="$flag")

rm -rf .next
echo "== build next@$version flag=$flag timer=${timer_ms}ms" | tee -a "$log"
env ${env_flag[@]+"${env_flag[@]}"} npx next build >>"$log" 2>&1

env ${env_flag[@]+"${env_flag[@]}"} NODE_OPTIONS=--expose-gc PORT=3100 npx next start >>"$log" 2>&1 &
server=$!

# `next start` runs the server in a child process, which can still be writing
# upgraded shells to .next after the last response. Stop whatever listens on the
# port and wait for it to exit, so the next run can delete .next.
stop_server() {
  kill "$server" 2>/dev/null || true
  local pids
  pids=$(lsof -tiTCP:3100 -sTCP:LISTEN 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  for _ in $(seq 1 30); do port_busy || break; sleep 1; done
  wait "$server" 2>/dev/null || true
}
trap stop_server EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:3100/api/mem && break
  sleep 1
done

echo "== load route=$route" | tee -a "$log"
out=$(node scripts/load.mjs "$cycles" "$per" 8 "$routeArg")
echo "$out" | tee -a "$log"
json=$(echo "$out" | tail -1)

count="{}"
case "$route" in
  *timer)
    counted=$(node scripts/count-timers.mjs 10 "$route")
    echo "$counted" | tee -a "$log"
    count=$(echo "$counted" | tail -1)
    ;;
esac

printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$version" "$flag" "$route" "$timer_ms" "$json" "$count" >>results/summary.tsv

stop_server
trap - EXIT
