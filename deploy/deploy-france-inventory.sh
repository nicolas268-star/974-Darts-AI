#!/usr/bin/env bash
# Additive France migration must already be applied to the verified production project.
# Run from /opt/974darts/current after updating only the reviewed application files.
set -Eeuo pipefail
umask 077
release=${1:?Usage: deploy-france-inventory.sh RELEASE_SHA PREVIOUS_SHA INVENTORY_SHA256}
previous=${2:?Previous production commit required}
inventory_hash=${3:?Verified SQLite backup SHA256 required}
[[ "$release" =~ ^[0-9a-f]{40}$ && "$previous" =~ ^[0-9a-f]{40}$ && "$inventory_hash" =~ ^[0-9a-f]{64}$ ]]
[[ "$EUID" -eq 0 && "$(pwd -P)" == "$(readlink -f /opt/974darts/current)" ]]
production_env=/etc/974darts/production.env
inventory=/var/lib/974darts/backend-data/france-inventory-initial.sqlite
[[ -f "$production_env" && -f "$inventory" ]]
[[ "$(sha256sum "$inventory" | cut -d' ' -f1)" == "$inventory_hash" ]]
git_repo() { git --no-optional-locks -c safe.directory="$PWD" "$@"; }
compose() { docker compose --env-file "$production_env" -f deploy/compose.yaml "$@"; }
[[ "$(git_repo rev-parse HEAD)" == "$release" ]]
git_repo merge-base --is-ancestor "$previous" "$release"
git_repo diff --quiet "$previous" "$release" -- deploy/Caddyfile deploy/compose.yaml
[[ -z "$(git_repo status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')" ]]
compose config --quiet
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/var/backups/974darts/france-inventory-$stamp"
install -d -m 700 "$backup"
cp -p "$production_env" "$backup/production.env"
cp -p deploy/Caddyfile "$backup/Caddyfile"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
printf '%s\n' "$release" > "$backup/release-commit.txt"
active=0
rollback() {
  local status=$?
  trap - ERR
  set +e
  printf 'Deployment failed. Private backup: %s\n' "$backup" >&2
  if [[ "$active" -eq 1 ]] && cmp -s "$production_env" "$backup/production.env"; then
    docker compose --env-file "$production_env" -f deploy/compose.yaml -f "$backup/rollback.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend
    printf 'Previous application images restored. Additive France data retained.\n' >&2
  fi
  exit "$status"
}
trap rollback ERR
printf 'services:\n' > "$backup/rollback.yaml"
for service in backend frontend; do
  cid=$(compose ps -q "$service")
  [[ -n "$cid" && "$cid" != *$'\n'* ]]
  image=$(docker inspect --format '{{.Image}}' "$cid")
  tag="darts974-$service:before-france-$stamp"
  docker tag "$image" "$tag"
  printf '  %s:\n    image: %s\n' "$service" "$tag" >> "$backup/rollback.yaml"
done
capture_sporting() { compose exec -T backend python - "$@" < deploy/check-france-sporting-state.py; }
capture_sporting --backup > "$backup/sporting-backup.json"
capture_sporting > "$backup/sporting-before.json"
# Build while the current application remains available. Workers and proxy keep their containers.
compose build backend frontend
compose run --rm --no-deps -T backend python -m app.scripts.france_inventory --help > "$backup/cli-help.txt"
compose run --rm --no-deps -T backend python - <<'PY'
import os
from urllib.parse import urlparse
from supabase import create_client
assert urlparse(os.environ['SUPABASE_URL']).hostname == 'vkvdyrsrvbyugbjlmknb.supabase.co'
db=create_client(os.environ['SUPABASE_URL'],os.environ['SUPABASE_SERVICE_ROLE_KEY'])
for name in ('committees','leagues','competitions','sources','candidates','runs','history'):
    db.table('france_'+name).select('id').limit(1).execute()
PY
# Transfer the original collected records only; this command cannot promote local association decisions.
compose run --rm --no-deps -T backend python -m app.scripts.france_inventory promote --supabase --database /app/data/france-inventory-initial.sqlite --output /tmp/france-reports > "$backup/promotion.json"
compose run --rm --no-deps -T backend python - <<'PY' > "$backup/france-counts.json"
import json,os
from supabase import create_client
db=create_client(os.environ['SUPABASE_URL'],os.environ['SUPABASE_SERVICE_ROLE_KEY'])
counts={name:db.table('france_'+name).select('id',count='exact').limit(1).execute().count for name in ('committees','competitions','candidates')}
assert counts['committees'] >= 26 and counts['competitions'] >= 262 and counts['candidates'] >= 31
print(json.dumps(counts))
PY
cmp -s "$production_env" "$backup/production.env"
cmp -s deploy/Caddyfile "$backup/Caddyfile"
active=1
compose up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend
curl -fsS --connect-timeout 10 --max-time 120 https://974darts.re/api/health > "$backup/health.json"
curl -fsS --connect-timeout 10 --max-time 120 https://974darts.re/comites/france > "$backup/annuaire.html"
curl -fsS --connect-timeout 10 --max-time 120 https://974darts.re/comites/france/ffd-aqn > "$backup/comite.html"
python3 - "$backup" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); health=json.loads((p/'health.json').read_text())
assert health.get('status')=='ok' and health.get('demoMode') is False
assert 'Les comités,' in (p/'annuaire.html').read_text() and 'Organismes documentés' in (p/'annuaire.html').read_text()
assert 'Aquitaine Nord' in (p/'comite.html').read_text()
PY
capture_sporting > "$backup/sporting-after.json"
cmp -s "$backup/sporting-before.json" "$backup/sporting-after.json"
cmp -s "$production_env" "$backup/production.env"
cmp -s deploy/Caddyfile "$backup/Caddyfile"
trap - ERR
printf 'Comités France deployed and verified: https://974darts.re/comites/france\nPrivate backup: %s\n' "$backup"
compose ps backend frontend
