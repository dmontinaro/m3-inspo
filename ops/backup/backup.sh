#!/bin/sh
# Nightly backup of the inspo database and bucket into an encrypted restic
# repository on Cloudflare R2. Runs as the Railway cron service `backup` and
# exits when done (docs/backup.md).
#
# One snapshot per night with two folders:
#   db/inspo.dump   pg_dump, custom format, uncompressed so restic can dedupe it
#   bucket/         every object of the source bucket
# Then forget/prune with the retention rule below, and a check that reads a
# seventh of the stored data (the whole repository once a week).
#
# Variables: DATABASE_URL; S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID,
# S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE (source bucket, as on `web`);
# RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# AWS_DEFAULT_REGION (the R2 repository); optional BACKUP_PING_URL, a
# healthchecks.io-style URL: GET on success, GET <url>/fail on failure.

set -eu
. "$(dirname "$0")/common.sh"

# Retention (docs/backup.md): 7 daily, 4 weekly, 12 monthly snapshots.
retention="--keep-daily 7 --keep-weekly 4 --keep-monthly 12"
# restic groups snapshots by host; Railway's hostname changes on every run.
host=inspo

# Only these tool lines reach the log: connection and repository errors, never object names or rows.
safe_errors='^(database not reachable|pg_dump: error:|Fatal:|.*(Failed to create file system|error reading source root directory))'

notify() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  wget -q -T 10 -O /dev/null "$BACKUP_PING_URL$1" >/dev/null 2>&1 || log "ping=failed"
}

on_failure() {
  log "status=failed duration=$(($(date +%s) - run_started))s"
  notify /fail
}

wait_for_database() {
  # Railway's private network can need a moment after the container starts.
  tries=0
  until pg_isready -q -d "$DATABASE_URL"; do
    tries=$((tries + 1))
    [ "$tries" -lt 30 ] || { echo "database not reachable after 60s"; return 1; }
    sleep 2
  done
}

dump_database() {
  mkdir -p db || return
  pg_dump --format=custom --compress=0 --file=db/inspo.dump "$DATABASE_URL" || return
  detail="size=$(human "$(stat -c %s db/inspo.dump)")"
}

mirror_bucket() {
  s3_remote SOURCE S3
  mkdir -p bucket || return
  rclone sync "SOURCE:$S3_BUCKET" bucket --fast-list --transfers 8 --checkers 16 --log-level ERROR || return
  detail=$(folder_stats bucket)
}

# Creates the repository on the first run; restic exits with 10 if there is none yet.
open_repository() {
  code=0
  restic cat config >/dev/null || code=$?
  case $code in
    0) detail="repository=existing" ;;
    10) restic init && detail="repository=created" ;;
    *) return "$code" ;;
  esac
}

store_snapshot() {
  restic backup --host "$host" --tag nightly --json db bucket >"$summary" || return
  # shellcheck disable=SC2046 # four plain words: id, new files, changed files, bytes added
  set -- $(jq -r 'select(.message_type == "summary") |
    "\(.snapshot_id[0:8]) \(.files_new) \(.files_changed) \(.data_added_packed)"' "$summary")
  detail="snapshot=$1 files_new=$2 files_changed=$3 added=$(human "$4")"
}

apply_retention() {
  # shellcheck disable=SC2086 # $retention is a list of flags
  restic forget --host "$host" $retention --prune || return
  snapshots=$(restic snapshots --host "$host" --json | jq length) || return
  repository=$(restic stats --mode raw-data --json | jq .total_size) || return
  detail="snapshots=$snapshots repository=$(human "$repository")"
}

check_repository() {
  restic check --read-data-subset="$(date +%u)/7"
}

run_started=$(date +%s)
require DATABASE_URL S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY \
  RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
summary=$(mktemp)
cd /backup
log "status=started"
notify /start

step wait-for-database wait_for_database
step dump dump_database
step bucket mirror_bucket
step repository open_repository
step snapshot store_snapshot
step retention apply_retention
step check check_repository

log "status=ok duration=$(($(date +%s) - run_started))s"
notify ""
