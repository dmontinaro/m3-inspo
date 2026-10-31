# shellcheck shell=sh
# Shared helpers for backup.sh and restore.sh (POSIX sh, sourced).
#
# Every step runs with its tool output in a scratch file. The log gets one
# line per step with status, duration and sizes; on failure it adds only the
# scratch lines matching $safe_errors, because tool output can name objects
# or show row contents.

exec 3>&1
scratch=$(mktemp)
safe_errors='^$'
detail=""

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&3
}

# Exits with status 2 unless every named variable is set and not empty.
require() {
  missing=""
  for name in "$@"; do
    [ -n "$(printenv "$name")" ] || missing="$missing $name"
  done
  [ -z "$missing" ] && return
  log "status=failed reason=missing-variables:$(echo "$missing" | tr ' ' ',' | sed 's/^,//')"
  exit 2
}

# Bytes as a short human-readable size, e.g. 12.3MiB.
human() {
  awk -v b="$1" 'BEGIN { split("B KiB MiB GiB TiB", u); i = 1
    while (b >= 1024 && i < 5) { b /= 1024; i++ }
    printf (i == 1 ? "%d%s" : "%.1f%s"), b, u[i] }'
}

# Runs `step <name> <command...>` and logs one line. The command may set
# $detail (e.g. "size=1.2MiB") for that line. On failure: calls `on_failure`
# if the script defines it, then exits 1.
step() {
  name=$1
  shift
  detail=""
  started=$(date +%s)
  if "$@" >"$scratch" 2>&1; then
    log "step=$name status=ok duration=$(($(date +%s) - started))s${detail:+ $detail}"
  else
    code=$?
    log "step=$name status=failed exit=$code duration=$(($(date +%s) - started))s"
    grep -E "$safe_errors" "$scratch" | awk '!seen[$0]++' | head -n 5 | sed 's/^/  /' >&3 || true
    command -v on_failure >/dev/null && on_failure
    exit 1
  fi
}

# Points the rclone remote <remote> at the S3 bucket described by
# <prefix>_ENDPOINT, _REGION, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY and
# _FORCE_PATH_STYLE (the web app's S3_* variables, see .env.example).
s3_remote() {
  remote=$1
  prefix=$2
  region=$(printenv "${prefix}_REGION" || true)
  export "RCLONE_CONFIG_${remote}_TYPE=s3"
  export "RCLONE_CONFIG_${remote}_PROVIDER=Other"
  export "RCLONE_CONFIG_${remote}_ENDPOINT=$(printenv "${prefix}_ENDPOINT")"
  export "RCLONE_CONFIG_${remote}_REGION=${region:-auto}"
  export "RCLONE_CONFIG_${remote}_ACCESS_KEY_ID=$(printenv "${prefix}_ACCESS_KEY_ID")"
  export "RCLONE_CONFIG_${remote}_SECRET_ACCESS_KEY=$(printenv "${prefix}_SECRET_ACCESS_KEY")"
  export "RCLONE_CONFIG_${remote}_FORCE_PATH_STYLE=$([ "$(printenv "${prefix}_FORCE_PATH_STYLE")" = 1 ] && echo true || echo false)"
  # Bucket keys may lack the right to create buckets; the bucket always exists already.
  export "RCLONE_CONFIG_${remote}_NO_CHECK_BUCKET=true"
}

# Number of files and total bytes below a folder, as "objects=N size=X".
folder_stats() {
  count=$(find "$1" -type f | wc -l)
  bytes=$(find "$1" -type f -exec stat -c %s {} + 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
  echo "objects=$count size=$(human "$bytes")"
}
