#!/usr/bin/env bash
# One measurement: install a Next version, build with the flag set (or unset),
# start, drive the load script against a route, stop, append the result line.
#
#   scripts/measure.sh <next-version> <true|false|unset> <root|opt-in> [cycles] [perCycle]
#
# Results land in results/<version>_<flag>_<route>.log (full output) and
# results/summary.tsv (one line per run).
set -euo pipefail
cd "$(dirname "$0")/.."

version="$1"; flag="$2"; route="$3"; cycles="${4:-3}"; per="${5:-300}"
[ "$route" = "root" ] && routeArg="" || routeArg="$route"
mkdir -p results
log="results/${version}_${flag}_${route}.log"

if lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port 3100 is busy" >&2; exit 1
fi

installed=$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)
if [ "$installed" != "$version" ]; then
  npm install --no-audit --no-fund "next@$version" >>"$log" 2>&1
fi

env_flag=()
[ "$flag" != "unset" ] && env_flag=(PARTIAL_PREFETCHING="$flag")

rm -rf .next
echo "== build next@$version flag=$flag" | tee -a "$log"
env ${env_flag[@]+"${env_flag[@]}"} npx next build >>"$log" 2>&1

env ${env_flag[@]+"${env_flag[@]}"} NODE_OPTIONS=--expose-gc PORT=3100 npx next start >>"$log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:3100/api/mem && break
  sleep 1
done

echo "== load route=$route" | tee -a "$log"
out=$(node scripts/load.mjs "$cycles" "$per" 8 "$routeArg")
echo "$out" | tee -a "$log"
json=$(echo "$out" | tail -1)
printf '%s\t%s\t%s\t%s\n' "$version" "$flag" "$route" "$json" >>results/summary.tsv

kill $server; wait $server 2>/dev/null || true
trap - EXIT
