#!/usr/bin/env bash
# Run from the production checkout, as root, with the verified release and old commit.
set -Eeuo pipefail
umask 077
expected_commit=${1:?Usage: deploy-match-day.sh RELEASE_SHA PREVIOUS_SHA}
previous_commit=${2:?Previous production checkout commit required}
[[ "$expected_commit" =~ ^[0-9a-f]{40}$ && "$previous_commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit identifiers.' >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || { echo 'Run this script with sudo.' >&2; exit 1; }
git_repo() { git --no-optional-locks -c safe.directory="$PWD" "$@"; }
[[ "$(git_repo rev-parse HEAD)" == "$expected_commit" ]] || { echo 'Checkout does not match the verified release.' >&2; exit 1; }
checkout_changes=$(git_repo status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')
[[ -z "$checkout_changes" ]] || { echo 'Checkout has local modifications; deployment stopped.' >&2; exit 1; }
git_repo diff --cached --quiet
# The production Caddy override enables the existing private preview host.
# Keep it only when this release leaves the tracked Caddyfile unchanged.
git_repo diff --quiet "$previous_commit" "$expected_commit" -- deploy/Caddyfile
git_repo merge-base --is-ancestor "$previous_commit" "$expected_commit"
production_env=/etc/974darts/production.env
production_data=/var/lib/974darts/backend-data
[[ -f "$production_env" && -d "$production_data" ]] || { echo 'Production environment or persistent volume missing.' >&2; exit 1; }
compose() { docker compose --env-file "$production_env" --profile match-day -f deploy/compose.yaml "$@"; }
compose config --quiet
compose exec -T backend python -c 'import os; assert os.access("/app/data",os.W_OK), "Persistent volume is not writable by the backend"'
release_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="/var/backups/974darts/match-day-$release_stamp"
activation_started=0
rollback_on_error() {
  local status=$?
  trap - ERR
  set +e
  printf "Deployment failed; backup: %s\n" "$backup_dir" >&2
  if [[ "$activation_started" -eq 1 ]]; then
    compose stop match-day-worker
    cp -p "$backup_dir/production.env" "$production_env"
    if docker compose --env-file "$production_env" -f deploy/compose.yaml -f "$backup_dir/rollback.yaml" up -d --no-deps --wait --wait-timeout 180 backend frontend; then
      printf "Previous frontend/backend images restored; verify their health.\n" >&2
    else
      printf "Automatic rollback failed; use the saved rollback.yaml and inspect service health.\n" >&2
    fi
  fi
  exit "$status"
}
trap rollback_on_error ERR
install -d -m 700 "$backup_dir"
cp -p "$production_env" "$backup_dir/production.env"
cp -p deploy/Caddyfile "$backup_dir/Caddyfile.production"
if [[ -f deploy/Caddyfile.before-preview.e5lNZy ]]; then cp -p deploy/Caddyfile.before-preview.e5lNZy "$backup_dir/"; fi
printf '%s\n' "$previous_commit" > "$backup_dir/previous-commit.txt"
printf '%s\n' "$expected_commit" > "$backup_dir/release-commit.txt"
# Prevent any existing worker from dispatching while deploying. No new Meta authorization.
compose stop match-day-worker
# SQLite backup API handles WAL; other calendar files use atomic replacement in the app.
python3 - "$production_data" "$backup_dir" <<'PY'
from pathlib import Path
import sqlite3,sys,os
source,backup=map(Path,sys.argv[1:])
for database in source.rglob('*.sqlite3'):
    target=backup/'sqlite'/database.relative_to(source)
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with sqlite3.connect(f'file:{database}?mode=ro',uri=True) as reader, sqlite3.connect(target) as writer:
        reader.backup(writer)
    os.chmod(target,0o600)
PY
tar --exclude='*.sqlite3' --exclude='*.sqlite3-*' --exclude='*.schema.lock' -czf "$backup_dir/backend-data.tar.gz" -C "$production_data" .
for service in frontend backend; do
  container_id=$(compose ps -q "$service")
  [[ -n "$container_id" ]] || { echo "Running $service container missing." >&2; exit 1; }
  image_id=$(docker inspect --format '{{.Image}}' "$container_id")
  rollback_image="darts974-$service:before-match-day-$release_stamp"
  docker tag "$image_id" "$rollback_image"
  printf '%s %s\n' "$service" "$rollback_image" >> "$backup_dir/rollback-images.txt"
done
{
  printf "services:\n"
  while read -r service image; do printf "  %s:\n    image: %s\n" "$service" "$image"; done < "$backup_dir/rollback-images.txt"
} > "$backup_dir/rollback.yaml"
# Build first. Existing frontend/backend keep serving until both images are ready.
compose build frontend backend match-day-worker
activation_started=1
python3 - "$production_env" <<'PY'
from pathlib import Path
import os,re,sys,tempfile
p=Path(sys.argv[1]);lines=p.read_text().splitlines()
admin=[line.split('=',1)[1].strip().strip('"\'') for line in lines if re.match(r'^\s*ADMIN_USER_ID\s*=',line)]
if len(admin)!=1 or not re.fullmatch(r'[0-9a-fA-F-]{36}',admin[0]):
    raise SystemExit('ADMIN_USER_ID missing or ambiguous; no activation performed.')
lines=[line for line in lines if not re.match(r'^\s*MATCH_DAY_(ENABLED|FACEBOOK_ENABLED)\s*=',line)]
lines+=['MATCH_DAY_ENABLED=true','MATCH_DAY_FACEBOOK_ENABLED=false']
fd,name=tempfile.mkstemp(prefix='.match-day-env-',dir=p.parent)
try:
    with os.fdopen(fd,'w') as stream:
        stream.write('\n'.join(lines)+'\n');stream.flush();os.fsync(stream.fileno())
    os.chmod(name,0o600);os.replace(name,p)
finally:
    if os.path.exists(name):os.unlink(name)
PY
# Recreate only services required by Match Day; other workers remain untouched.
compose up -d --no-deps --wait --wait-timeout 180 backend frontend
compose up -d --no-deps match-day-worker
compose exec -T match-day-worker python -c 'import os; assert os.environ.get("MATCH_DAY_ENABLED")=="true"; assert os.environ.get("MATCH_DAY_FACEBOOK_ENABLED")=="false"'
compose exec -T backend python - <<'PY'
import json,os,urllib.request,urllib.error
assert os.environ.get('MATCH_DAY_ENABLED')=='true'
assert os.environ.get('MATCH_DAY_FACEBOOK_ENABLED')=='false'
headers={'X-Internal-Token':os.environ['INTERNAL_API_TOKEN'],'X-User-Id':os.environ['ADMIN_USER_ID']}
base='http://127.0.0.1:8000/api/v1/match-day/'
for path in ('source?season=2027&stats_season=2027','history','status'):
    with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers),timeout=60) as response:
        data=json.load(response)
    if path.startswith('source'):
        assert len(data['teams'])>=2,'Verified season rosters unavailable'
        assert all(isinstance(team.get('team_stats'),dict) for team in data['teams']),'Team KPI adapter not deployed'
        print('Match Day: verified teams',len(data['teams']),'calendar encounters',len(data['events']))
    if path=='status':assert data['facebook_enabled'] is False
req=urllib.request.Request(base+'history')
try:urllib.request.urlopen(req,timeout=10)
except urllib.error.HTTPError as error:assert error.code==401
else:raise AssertionError('Unauthenticated backend access was allowed')
print('Match Day: Admin APIs and private access verified; Facebook disabled.')
PY
compose exec -T frontend node -e 'if(process.env.MATCH_DAY_ENABLED!=="true")process.exit(1);fetch("http://127.0.0.1:3000/api/health").then(r=>{if(!r.ok)process.exit(1);console.log("Frontend health: OK")}).catch(()=>process.exit(1))'
curl -fsS https://974darts.re/api/health
printf '\n'
compose ps backend frontend match-day-worker
worker_id=$(compose ps -q match-day-worker)
[[ -n "$worker_id" && "$(docker inspect --format '{{.State.Status}} {{.RestartCount}}' "$worker_id")" == "running 0" ]] || { echo "Worker is not stable." >&2; false; }
trap - ERR
printf 'Deployment verified. Backup and rollback images: %s\n' "$backup_dir"
printf 'Open: https://974darts.re/admin/communication/match-day\n'
