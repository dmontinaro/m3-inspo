# The nightly backup (docs/backup.md): pg_dump plus a copy of the bucket,
# stored with restic in Cloudflare R2. Default command: backup.sh, which
# exits when done (Railway cron service `backup`). restore.sh restores a
# snapshot into an empty database and bucket.
#
# The build context is this folder (Railway root directory /ops/backup):
#   docker build -t inspo-backup ops/backup
# Re-run the restore test after changes: ops/backup/restore-test.sh

FROM restic/restic:0.19.1 AS restic
FROM rclone/rclone:1.75.1 AS rclone

# pg_dump refuses servers of a newer major version: keep this at the
# production major (Railway pgvector, Postgres 18) or above.
FROM postgres:18-alpine

RUN apk add --no-cache ca-certificates jq
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
# Executable bits come from git.
COPY common.sh backup.sh restore.sh /usr/local/bin/

RUN mkdir /backup /restore && chown postgres:postgres /backup /restore
# Remotes come from RCLONE_CONFIG_* variables (common.sh); there is no config file.
ENV RESTIC_CACHE_DIR=/tmp/restic-cache RCLONE_CONFIG=/notfound
USER postgres
WORKDIR /backup

# Replaces the image's entrypoint, which would start a Postgres server.
ENTRYPOINT []
CMD ["backup.sh"]
