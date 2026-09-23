#!/usr/bin/env bash
# Runs every row of the README table back to back on the same machine, into a
# fresh results/summary.tsv. Budget: about 40 minutes (one build per row).
set -uo pipefail
cd "$(dirname "$0")/.."
rm -rf results
runs=(
  "16.3.6 true timer"
  "16.3.6 false timer"
  "16.3.6 false opt-in-timer"
  "16.3.6 true client-timer"
  "16.3.6 false client-timer"
  "16.2.6 unset timer"
  "16.4.0-canary.39 true timer"
  "16.4.0-canary.39 false timer"
  "16.3.6 true plain"
  "16.3.6 false plain"
  "16.3.6 false opt-in"
  "16.3.6 true root"
  "16.3.6 false root"
  "16.2.6 unset plain"
)
for r in "${runs[@]}"; do
  echo "##### $r"
  # shellcheck disable=SC2086
  bash scripts/measure.sh $r || echo "FAILED: $r"
done
echo "##### 16.3.6 true timer, 5 s timer"
NEXT_PUBLIC_TIMER_MS=5000 bash scripts/measure.sh 16.3.6 true timer || echo "FAILED: 5 s timer"
echo; echo "===== results/summary.tsv ====="; cat results/summary.tsv
