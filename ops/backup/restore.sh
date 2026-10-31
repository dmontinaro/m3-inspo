#!/bin/sh
# Restores one snapshot of the backup into an empty database and an empty
# bucket (docs/backup.md). Run by hand, never on Railway:
#   docker run --rm --env-file restore.env inspo-backup restore.sh
#
# Variables: RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION (the repository); SNAPSHOT
# (default: latest). Targets, each optional, each must be empty:
#   TARGET_DATABASE_URL       Postgres 18 or newer with pgvector installed
#   TARGET_S3_BUCKET, TARGET_S3_ENDPOINT, TARGET_S3_REGION,
#   TARGET_S3_ACCESS_KEY_ID, TARGET_S3_SECRET_ACCESS_KEY, TARGET_S3_FORCE_PATH_STYLE
# The restored files stay in /restore (db/inspo.dump, bucket/); mount a folder
# there to keep them.

set -eu
. "$(dirname "$0")/common.sh"

# A restore runs by hand: show every error line.
safe_errors='.'
snapshot=${SNAPSHOT:-latest}

restore_files() {
  restic restore "$snapshot" --host inspo --target /restore || return
  detail="snapshot=$snapshot dump=$(human "$(stat -c %s /restore/db/inspo.dump)") $(folder_stats /restore/bucket)"
}

restore_database() {
  tables=$(psql -tAq -d "$TARGET_DATABASE_URL" -c \
    "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')") || return
  [ "$tables" = 0 ] || { echo "target database is not empty: $tables tables"; return 1; }
  # Owners and grants belong to the old server; everything goes to the connecting role.
  pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
    -d "$TARGET_DATABASE_URL" /restore/db/inspo.dump || return
  tables=$(psql -tAq -d "$TARGET_DATABASE_URL" -c \
    "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')") || return
  detail="tables=$tables"
}

restore_bucket() {
  s3_remote TARGET TARGET_S3
  existing=$(rclone lsf "TARGET:$TARGET_S3_BUCKET" --max-depth 1 | wc -l) || return
  [ "$existing" = 0 ] || { echo "target bucket is not empty"; return 1; }
  rclone copy /restore/bucket "TARGET:$TARGET_S3_BUCKET" --transfers 8 --checkers 16 --log-level ERROR || return
  # Compares size and checksum of every object with the restored files.
  rclone check /restore/bucket "TARGET:$TARGET_S3_BUCKET" --one-way --log-level ERROR || return
  detail=$(folder_stats /restore/bucket)
}

run_started=$(date +%s)
require RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
[ -z "${TARGET_S3_BUCKET:-}" ] || require TARGET_S3_ACCESS_KEY_ID TARGET_S3_SECRET_ACCESS_KEY
log "status=started"

step files restore_files
if [ -n "${TARGET_DATABASE_URL:-}" ]; then step database restore_database; else log "step=database status=skipped"; fi
if [ -n "${TARGET_S3_BUCKET:-}" ]; then step bucket restore_bucket; else log "step=bucket status=skipped"; fi

log "status=ok duration=$(($(date +%s) - run_started))s"
