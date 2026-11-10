#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(readlink -f /opt/974darts/current)"
target=${1:-9bd1574c6e3167589fb79708d7d8285b68d87deb}
[[ "$EUID" -eq 0 && "$target" =~ ^[0-9a-f]{40}$ ]]
g() { git -c safe.directory="$PWD" "$@"; }
dc() { docker compose --env-file /etc/974darts/production.env --profile match-day --profile ranking-workflow -f deploy/compose.yaml "$@"; }
if ! g diff --quiet HEAD -- app/backend app/frontend deploy/compose.yaml; then
  g status --short
  printf "Fichiers applicatifs modifiés sur le serveur : arrêt sans écrasement.\n" >&2
  exit 1
fi
previous=$(g rev-parse HEAD)
g fetch origin main
g diff --quiet "$previous" "$target" -- deploy/Caddyfile deploy/compose.yaml
g merge --ff-only "$target"
[[ "$(g rev-parse HEAD)" == "$target" ]]
dc config --quiet
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/var/backups/974darts/total-$stamp"
install -d -m 700 "$backup"
cp -p /etc/974darts/production.env "$backup/production.env"
cp -p deploy/Caddyfile "$backup/Caddyfile"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
dc ps --status running --services > "$backup/running-services.txt"
workers=()
for service in interclub-analysis match-day-worker; do
  if grep -Fxq "$service" "$backup/running-services.txt"; then workers+=("$service"); fi
done
services=(backend frontend "${workers[@]}")
printf 'services:\n' > "$backup/rollback.yaml"
for service in "${services[@]}"; do
  cid=$(dc ps -q "$service")
  [[ -n "$cid" && "$cid" != *$'\n'* ]]
  image=$(docker inspect --format '{{.Image}}' "$cid")
  tag="darts974-$service:before-total-$stamp"
  docker tag "$image" "$tag"
  printf '  %s:\n    image: %s\n' "$service" "$tag" >> "$backup/rollback.yaml"
done
live=0
rollback() {
  code=$?
  trap - ERR
  set +e
  if ((live)); then
    dc -f "$backup/rollback.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 "${services[@]}"
  fi
  printf 'Déploiement interrompu. Sauvegarde : %s\n' "$backup" >&2
  exit "$code"
}
trap rollback ERR
build=(backend frontend interclub-analysis)
if grep -Fxq match-day-worker "$backup/running-services.txt"; then build+=(match-day-worker); fi
dc build "${build[@]}"
started=$(date -u +%s)
live=1
if ((${#workers[@]})); then dc stop "${workers[@]}"; fi
dc up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend
if ((${#workers[@]})); then dc up -d --no-deps --no-build "${workers[@]}"; fi
curl -fsS --retry 5 --retry-delay 3 --connect-timeout 10 --max-time 60 https://974darts.re/api/health -o "$backup/health.json"
python3 - "$backup/health.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1])); assert p.get('status')=='ok' and p.get('demoMode') is False
print('Frontend : OK')
PY
dc exec -T backend python - <<'PY'
from app.services.interclub_publication_service import ROSTERS
r=next(x for x in ROSTERS if x['id']=='pdc-fournaise')
assert any(x['officialName']=='Matheo PREHU' for x in r['players'])
print('Backend : effectif Fournaise avec Matheo OK')
PY
if grep -Fxq interclub-analysis "$backup/running-services.txt"; then
  dc exec -T backend python - "$started" <<'PY_HEARTBEAT'
import json,os,sys,time
from datetime import datetime
path=os.environ.get('INTERCLUB_ANALYSIS_STATE_PATH','/app/data/interclub_analysis.json')
for attempt in range(31):
    try:
        heartbeat=json.load(open(path)).get('last_check_at')
        if heartbeat and datetime.fromisoformat(heartbeat).timestamp() >= int(sys.argv[1])-2:
            print('Worker interclubs : nouveau heartbeat OK');break
    except (OSError,ValueError):
        pass
    if attempt==30: raise SystemExit('Worker interclubs : heartbeat non actualisé')
    time.sleep(2)
PY_HEARTBEAT
fi
curl -fsS --connect-timeout 10 --max-time 60 https://974darts.re/teams -o "$backup/teams.html"
grep -Fq 'Matheo PREHU' "$backup/teams.html"
for service in "${workers[@]}"; do
  cid=$(dc ps -q "$service")
  [[ -n "$cid" ]]
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid")" == running ]]
  [[ "$(docker inspect --format '{{.RestartCount}}' "$cid")" == 0 ]]
done
cmp -s /etc/974darts/production.env "$backup/production.env"
cmp -s deploy/Caddyfile "$backup/Caddyfile"
trap - ERR
dc ps
printf 'Déploiement terminé : %s\nSauvegarde : %s\n' "$target" "$backup"
