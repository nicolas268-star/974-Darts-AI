#!/usr/bin/env bash
# One-time production activation, explicitly authorized on 2026-09-23.
# Applies no SQL migration; migrations were applied and checked separately.
set -euo pipefail
trap 'printf "Arrêt à la ligne %s ; copiez ce message et les lignes précédentes.\n" "$LINENO" >&2' ERR
if (( EUID != 0 )); then
  printf 'Exécutez ce script avec sudo bash.\n' >&2
  exit 1
fi
umask 077
repo=$(readlink -f /opt/974darts/current)
cd "$repo"
g() { git -c safe.directory="$repo" "$@"; }
target=13a560516bbb4cb0444d8c4e4599a4996b70a488
g fetch origin main
g merge-base --is-ancestor HEAD "$target"
g diff --quiet HEAD "$target" -- deploy/Caddyfile
test -z "$(g status --porcelain --untracked-files=no | sed '/^ M deploy\/Caddyfile$/d')"
test -z "$(g ls-files --others --exclude-standard app/backend app/frontend)"
curl -fsS --max-time 20 https://974darts.re/api/health

backup=$(mktemp -d /etc/974darts/before-ranking-production.XXXXXX)
cp -p /etc/974darts/production.env "$backup/production.env"
g rev-parse HEAD > "$backup/commit-before.txt"
caddy=$(docker inspect darts974-caddy-1 --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
cp -p "$caddy" "$backup/Caddyfile"
for service in backend frontend; do
  image=$(docker inspect "darts974-$service-1" --format '{{.Image}}')
  tag="darts974-$service:before-ranking-${backup##*.}"
  docker tag "$image" "$tag"
  printf '%s %s\n' "$service" "$tag" >> "$backup/images-before.txt"
done
printf '\nSauvegarde : %s\n' "$backup"
g merge --ff-only "$target"
cmp "$caddy" "$backup/Caddyfile"

python3 - <<'PY'
import json, os, pathlib, re, subprocess, tempfile
p = pathlib.Path('/etc/974darts/production.env')
if p.is_symlink() or not p.is_file():
    raise SystemExit('Configuration de production inattendue : arrêt.')
cmd = ['docker', 'compose', '--env-file', str(p), '-p', 'darts974', '-f', 'deploy/compose.yaml', '--profile', 'ranking-workflow']
r = subprocess.run(cmd + ['config', '--format', 'json'], capture_output=True, text=True)
if r.returncode:
    raise SystemExit('Configuration Compose invalide : arrêt, sans afficher les secrets.')
services = json.loads(r.stdout)['services']
expected = 'https://vkvdyrsrvbyugbjlmknb.supabase.co'
admin = '7d8de381-bef8-4aca-bb1f-635180e93702'
for name in ('frontend', 'backend', 'ranking-worker'):
    env = services[name]['environment']
    if env.get('SUPABASE_URL', '').rstrip('/') != expected or env.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/') != expected:
        raise SystemExit('Le projet Supabase ne correspond pas à la production : arrêt.')
    if env.get('ADMIN_USER_ID', '') not in ('', admin):
        raise SystemExit('Administrateur configuré différent : arrêt.')
    if not all(env.get(k) for k in ('SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'INTERNAL_API_TOKEN')):
        raise SystemExit('Un paramètre requis est absent : arrêt.')
args = services['frontend']['build']['args']
if args.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/') != expected or args.get('NEXT_PUBLIC_SITE_URL') != 'https://974darts.re' or args.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') != services['frontend']['environment']['NEXT_PUBLIC_SUPABASE_ANON_KEY']:
    raise SystemExit('Paramètres de construction incorrects : arrêt.')
updates = {'ADMIN_USER_ID': admin, 'RANKING_WORKFLOW_ENABLED': 'true', 'RANKING_EMAIL_ENABLED': 'false', 'RANKING_SITE_ORIGIN': 'https://974darts.re'}
lines = p.read_text().splitlines()
kept = []
for line in lines:
    match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
    if not match or match[1] not in updates:
        kept.append(line)
fd, name = tempfile.mkstemp(prefix='production-ranking-', dir=p.parent)
with os.fdopen(fd, 'w') as out:
    out.write('\n'.join(kept) + '\n' + ''.join(f'{k}={v}\n' for k, v in updates.items()))
    out.flush()
    os.fsync(out.fileno())
os.replace(name, p)
print('Configuration production vérifiée ; emails désactivés.')
PY

dc() { docker compose --env-file /etc/974darts/production.env -p darts974 -f deploy/compose.yaml --profile ranking-workflow "$@"; }
dc config --quiet
dc build backend frontend ranking-worker
dc up -d --no-deps --wait --wait-timeout 180 backend frontend ranking-worker

docker exec -i darts974-backend-1 python - <<'PY'
import json, urllib.request
with urllib.request.urlopen('http://127.0.0.1:8000/api/v1/committee-ranking?season=2026-2027', timeout=30) as r:
    data = json.load(r)
players = data['rankings']['mixed']
assert len(data['events']) == 1 and len(players) == 13
assert sum(x['total'] for x in players) == 50
print('Classement public vérifié : 13 joueurs avec points, total 50.')
PY
docker exec -i darts974-ranking-worker-1 python - <<'PY'
import os
from supabase import create_client
assert os.environ['RANKING_WORKFLOW_ENABLED'] == 'true'
assert os.environ['RANKING_EMAIL_ENABLED'] == 'false'
db = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
data = db.rpc('ranking_published_snapshot', {'p_season': '2026-2027'}).execute().data
assert len(data['events']) == 1
print('Worker connecté à la base ; emails désactivés.')
PY
curl -fsS --retry 5 --retry-delay 2 --max-time 30 https://974darts.re/api/health
test "$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' https://974darts.re/api/ranking-workflow/events)" = 401
curl -fsS --max-time 30 https://preview-ds.974darts.re/api/health
cmp "$caddy" "$backup/Caddyfile"
dc ps backend frontend ranking-worker
printf '\nDéploiement terminé au commit %s. Sauvegarde : %s\n' "$target" "$backup"
