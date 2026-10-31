#!/usr/bin/env bash
# End-to-end test of backup and restore with throwaway containers only
# (docs/backup.md). Nothing touches the dev database or production.
#
#   ops/backup/restore-test.sh [references]     default: 30
#
# 1. Postgres 18 with pgvector: database `source`, migrated with the committed
#    drizzle migrations and seeded; one object per capture key in an S3
#    stand-in (rclone serve s3) that also holds the restic repository.
# 2. backup.sh, then one reference deleted with its objects, backup.sh again.
# 3. restore.sh of the latest snapshot into the empty database `restored`
#    and the empty bucket `restored`.
# 4. Every table (row count and content hash) and every object (SHA-256) must
#    match the source; the deleted reference is gone from the latest snapshot
#    but still in the first; the backup log names no object and no row.
#
# Needs docker, pnpm (installed workspace) and openssl. Removes its containers,
# network and image tag on exit.

set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
references=${1:-30}
prefix=inspo18-rt-$$
network=$prefix
pg=$prefix-pg
s3=$prefix-s3
image=$prefix-backup
tmp=$(mktemp -d)

cleanup() {
  docker rm -f "$pg" "$s3" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$*"; }
seconds() { echo $(($(date +%s) - $1)); }
sql() { docker exec -i "$pg" psql -U postgres -v ON_ERROR_STOP=1 -tAq -d "$1"; }
# Runs the backup image on the test network with an env file from $tmp.
backup_image() {
  local env=$1
  shift
  docker run --rm --network "$network" --env-file "$tmp/$env" "$@"
}

pg_password=$(openssl rand -hex 16)
s3_key=$(openssl rand -hex 10)
s3_secret=$(openssl rand -hex 20)
repo_password=$(openssl rand -hex 24)

say "Build image and start throwaway containers ($prefix-*)"
docker build -q -t "$image" "$root/ops/backup" >/dev/null
docker network create "$network" >/dev/null
docker run -d --name "$pg" --network "$network" -e POSTGRES_PASSWORD="$pg_password" \
  -p 127.0.0.1::5432 pgvector/pgvector:pg18 >/dev/null
docker run -d --name "$s3" --network "$network" --entrypoint sh rclone/rclone:1.75.1 -c \
  "mkdir -p /data/source /data/restored /data/repo && exec rclone serve s3 --addr :9000 --auth-key '$s3_key,$s3_secret' /data" >/dev/null
# The image's init server only listens on the socket; TCP means the real server is up.
until docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres -q; do sleep 1; done
pg_port=$(docker port "$pg" 5432 | head -n 1 | cut -d: -f2)
echo "postgres: $(sql postgres <<<'show server_version'), host port $pg_port"

s3_env="S3_ENDPOINT=http://$s3:9000
S3_REGION=auto
S3_ACCESS_KEY_ID=$s3_key
S3_SECRET_ACCESS_KEY=$s3_secret
S3_FORCE_PATH_STYLE=1"
repo_env="RESTIC_REPOSITORY=s3:http://$s3:9000/repo
RESTIC_PASSWORD=$repo_password
AWS_ACCESS_KEY_ID=$s3_key
AWS_SECRET_ACCESS_KEY=$s3_secret
AWS_DEFAULT_REGION=auto"
(
  umask 077
  printf '%s\n' "DATABASE_URL=postgres://postgres:$pg_password@$pg:5432/source" "S3_BUCKET=source" "$s3_env" "$repo_env" >"$tmp/backup.env"
  printf '%s\n' "TARGET_DATABASE_URL=postgres://postgres:$pg_password@$pg:5432/restored" "TARGET_S3_BUCKET=restored" \
    "${s3_env//S3_/TARGET_S3_}" "$repo_env" >"$tmp/restore.env"
  printf '%s\n' "$repo_env" >"$tmp/repo.env"
  printf '%s\n' "$s3_env" | sed 's/^S3_/RCLONE_CONFIG_S3_/; s/FORCE_PATH_STYLE=1/FORCE_PATH_STYLE=true/' >"$tmp/rclone.env"
  printf '%s\n' RCLONE_CONFIG_S3_TYPE=s3 RCLONE_CONFIG_S3_PROVIDER=Other >>"$tmp/rclone.env"
)

say "Seed database 'source' ($references references) and bucket 'source'"
sql postgres <<<'create database source; create database restored;'
DATABASE_URL="postgres://postgres:$pg_password@127.0.0.1:$pg_port/source" \
  pnpm --dir "$root/packages/db" exec drizzle-kit migrate >"$tmp/migrate.log" 2>&1 || { cat "$tmp/migrate.log"; exit 1; }
sql source <<SQL
insert into "user" (id, name, email) values ('owner', 'Owner', 'owner@example.com');
insert into "references" (slug, title, source_kind, source_url, site_host, curation_status, is_favorite, take_note, tags)
select 'ref-' || i, 'Reference ' || i, 'url', 'https://example-' || i || '.com', 'example-' || i || '.com',
  (array['draft', 'approved', 'archived'])[1 + i % 3]::reference_curation_status, i % 4 = 0,
  'Take note ' || i || ': typography yes, colors no', array['harbor-lodge']
from generate_series(1, $references) i;
insert into reference_captures (reference_id, viewport, kind, asset_key, thumb_key, variants, width, height, content_hash)
select r.id, v.viewport::capture_viewport, 'hero',
  'references/' || r.id || '/' || v.viewport || '/hero.webp', 'references/' || r.id || '/' || v.viewport || '/thumb.webp',
  '{"w800": true}', 1440, 900, md5(r.id::text || v.viewport)
from "references" r cross join (values ('desktop'), ('mobile')) v(viewport);
insert into reference_analyses (reference_id, version, tokens, generated_by, model, tags, description)
select id, 1, '{"colors": [{"value": "#ff6600", "source": "vision"}]}', 'test', 'claude-opus-5-5',
  '["hero", "editorial"]', '{"de": "Ruhige Startseite", "en": "Calm landing page"}'
from "references";
insert into reference_embeddings (reference_id, model, embedding)
select r.id, 'voyageai/voyage-4', e.v::real[]::vector
from "references" r cross join lateral (select array_agg(random()) as v from generate_series(1, 1024) where r.id is not null) e;
insert into collections (slug, name, project) values ('hotels', 'Hotels', 'harbor-lodge'), ('forms', 'Forms', null);
insert into collection_references (collection_id, reference_id, position)
select c.id, r.id, row_number() over (partition by c.id order by r.slug)
from collections c cross join (select * from "references" order by slug limit 10) r;
SQL

mkdir -p "$tmp/objects"
while IFS= read -r key; do
  mkdir -p "$tmp/objects/$(dirname "$key")"
  case $key in
    */thumb.webp) size=$((8 + RANDOM % 24)) ;;   # KiB
    *) size=$((100 + RANDOM % 700)) ;;
  esac
  head -c $((size * 1024)) /dev/urandom >"$tmp/objects/$key"
done < <(sql source <<<'select asset_key from reference_captures union all select thumb_key from reference_captures')
# One upload at the 25 MB limit, above rclone's and restic's chunk sizes.
first_id=$(sql source <<<"select id from \"references\" where slug = 'ref-1'")
mkdir -p "$tmp/objects/references/$first_id/upload"
head -c $((25 * 1024 * 1024)) /dev/urandom >"$tmp/objects/references/$first_id/upload/original.png"
chmod -R a+rX "$tmp/objects"
backup_image rclone.env -v "$tmp/objects:/objects:ro" "$image" rclone copy /objects S3:source

say "Backup 1"
started=$(date +%s)
backup_image backup.env "$image" | tee "$tmp/backup-1.log"
backup_1=$(seconds "$started")

deleted_id=$(sql source <<<"select id from \"references\" where slug = 'ref-2'")
say "Delete reference ref-2 ($deleted_id) with its objects, then backup 2"
sql source <<<"delete from \"references\" where id = '$deleted_id'"
backup_image rclone.env "$image" rclone purge "S3:source/references/$deleted_id"
started=$(date +%s)
backup_image backup.env "$image" | tee "$tmp/backup-2.log"
backup_2=$(seconds "$started")

say "Restore the latest snapshot into the empty database and bucket 'restored'"
started=$(date +%s)
# The command from docs/backup.md: as the calling user, restored files kept in a host folder.
mkdir -p "$tmp/restore"
backup_image restore.env --user "$(id -u)" -v "$tmp/restore:/restore" "$image" restore.sh
restore=$(seconds "$started")

say "Verify"
failures=0
check() {
  if [ "$1" = ok ]; then echo "ok    $2"; else echo "FAIL  $2"; failures=$((failures + 1)); fi
}
# One line per table: name, row count, md5 over all rows in text form.
# shellcheck disable=SC2016 # dollar-quoted SQL, not shell
table_digest='
select format($f$%s.%s %s %s$f$, n.nspname, c.relname,
  (xpath($x$/row/n/text()$x$, query_to_xml(format($q$select count(*) as n from %I.%I$q$, n.nspname, c.relname), false, true, $e$$e$)))[1],
  (xpath($x$/row/h/text()$x$, query_to_xml(format($q$select md5(coalesce(string_agg(t::text, $s$|$s$ order by t::text), $s$$s$)) as h from %I.%I t$q$, n.nspname, c.relname), false, true, $e$$e$)))[1])
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = $k$r$k$ and n.nspname not in ($p$pg_catalog$p$, $p$information_schema$p$)
order by 1'
sql source <<<"$table_digest" >"$tmp/tables-source"
sql restored <<<"$table_digest" >"$tmp/tables-restored"
tables=$(wc -l <"$tmp/tables-source")
rows=$(awk '{ s += $2 } END { print s }' "$tmp/tables-source")
diff "$tmp/tables-source" "$tmp/tables-restored" >/dev/null && result=ok || result=fail
check "$result" "$tables tables, $rows rows: counts and content hashes match"
awk '$2 > 0 { printf "        %-40s %s rows\n", $1, $2 }' "$tmp/tables-source"

backup_image rclone.env "$image" rclone hashsum sha256 --download S3:source | sort >"$tmp/objects-source"
backup_image rclone.env "$image" rclone hashsum sha256 --download S3:restored | sort >"$tmp/objects-restored"
objects=$(wc -l <"$tmp/objects-source")
size=$(backup_image rclone.env "$image" rclone size S3:restored --json)
[ "$objects" -gt 0 ] && diff "$tmp/objects-source" "$tmp/objects-restored" >/dev/null && result=ok || result=fail
check "$result" "$objects objects ($(jq -r '.bytes / 1048576 * 10 | floor / 10' <<<"$size") MiB): SHA-256 of every object matches"

[ "$(sql restored <<<"select count(*) from \"references\" where id = '$deleted_id'")" = 0 ] && result=ok || result=fail
check "$result" "deleted reference is absent after the restore"
backup_image repo.env "$image" restic snapshots --json >"$tmp/snapshots.json"
first_snapshot=$(jq -r 'sort_by(.time) | .[0].id' "$tmp/snapshots.json")
in_first=$(backup_image repo.env "$image" restic ls "$first_snapshot" | grep -c "/bucket/references/$deleted_id/" || true)
in_latest=$(backup_image repo.env "$image" restic ls latest | grep -c "/bucket/references/$deleted_id/" || true)
[ "$in_first" -gt 0 ] && [ "$in_latest" = 0 ] && result=ok || result=fail
check "$result" "deleted objects: $in_first in the first snapshot, $in_latest in the latest ($(jq length "$tmp/snapshots.json") snapshots)"

leaks=$(cat "$tmp"/backup-*.log | grep -c -e "references/" -e "Take note" -e "$pg_password" -e "$s3_secret" -e "$repo_password" || true)
[ "$leaks" = 0 ] && result=ok || result=fail
check "$result" "backup logs name no object, row or secret"

say "Durations: backup 1 ${backup_1}s, backup 2 ${backup_2}s, restore ${restore}s (including container start)"
[ "$failures" = 0 ] || { echo "$failures check(s) failed"; exit 1; }
echo "Restore test passed."
