#!/bin/sh
set -eu
: "${CRON_SECRET:?CRON_SECRET is required}"
: "${INTERNAL_API_URL:?INTERNAL_API_URL is required}"
base=${INTERNAL_API_URL%/}
while ! curl -fsS --max-time 10 -o /dev/null "$base/"; do
  echo '[cron] Waiting for web'
  sleep 5
done
run_loop() {
  interval=$1
  shift
  while :; do
    for path in "$@"; do
      curl -fsS --max-time 120 -o /dev/null -H "Authorization: Bearer $CRON_SECRET" "$base$path" || echo "[cron] Failed: $path"
    done
    sleep "$interval"
  done
}
run_loop 900 /api/cron/scheduled-actions /api/cron/automation-jobs &
run_loop 600 /api/cron/bulk-inbox-action-recovery &
run_loop 21600 /api/watch/all &
run_loop 86400 /api/cron/reasoning-retention /api/cron/mobile-push-retention /api/cron/email-send-operation-retention /api/cron/draft-cleanup &
wait
