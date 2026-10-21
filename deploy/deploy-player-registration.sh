#!/usr/bin/env bash
# Run as root from the reviewed production checkout, after the additive migration.
set -Eeuo pipefail
umask 077
release=${1:?Usage: deploy-player-registration.sh RELEASE_SHA PREVIOUS_SHA}
previous=${2:?Previous production commit required}
release_kind=${3:-player-registration}
[[ "$release_kind" == player-registration || "$release_kind" == visibility-nakka ]]
[[ "$release" =~ ^[0-9a-f]{40}$ && "$previous" =~ ^[0-9a-f]{40}$ ]]
[[ "$EUID" -eq 0 && "$(pwd -P)" == "$(readlink -f /opt/974darts/current)" ]]
production_env=/etc/974darts/production.env
[[ -f "$production_env" ]]
git_repo() { git --no-optional-locks -c safe.directory="$PWD" "$@"; }
base_compose() { docker compose --env-file "$production_env" -f deploy/compose.yaml "$@"; }
[[ "$(git_repo rev-parse HEAD)" == "$release" ]]
git_repo merge-base --is-ancestor "$previous" "$release"
git_repo diff --quiet "$previous" "$release" -- deploy/Caddyfile deploy/compose.yaml
[[ -z "$(git_repo status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')" ]]
base_compose config --quiet
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/var/backups/974darts/$release_kind-$stamp"
install -d -m 700 "$backup"
cp -p "$production_env" "$backup/production.env"
cp -p deploy/Caddyfile "$backup/Caddyfile"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
printf '%s\n' "$release" > "$backup/release-commit.txt"
services=(backend frontend)
for service in backend frontend interclub-analysis; do
  cid=$(base_compose ps -aq "$service")
  if [[ -z "$cid" ]]; then [[ "$service" == interclub-analysis ]]; continue; fi
  [[ "$cid" != *$'\n'* ]]
  docker inspect "$cid" > "$backup/$service.json"
  image=$(docker inspect --format '{{.Image}}' "$cid")
  tag="darts974-$service:before-player-registration-$stamp"
  docker tag "$image" "$tag"
  printf '%s %s\n' "$service" "$tag" >> "$backup/images.txt"
  if [[ "$service" == interclub-analysis && "$(docker inspect --format '{{.State.Status}}' "$cid")" == running ]]; then
    services+=(interclub-analysis)
  fi
done
# Preserve effective feature flags, including flags passed outside production.env.
# JSON is valid Compose YAML. These files can contain private configuration.
python3 - "$backup" <<'PY'
import json,re,sys
from pathlib import Path
p=Path(sys.argv[1]); services={}; environments={}
for name in ('backend','frontend','interclub-analysis'):
    file=p/f'{name}.json'
    if not file.exists(): continue
    env=dict(item.split('=',1) for item in json.loads(file.read_text())[0]['Config']['Env'])
    environments[name]=env
    flags={key:value for key,value in env.items() if re.search(r'_(ENABLED|PREVIEW)$',key) or key=='PLAYER_CARD_THEME_BINDINGS'}
    services[name]={'environment':flags}
front=environments['frontend']; back=environments['backend']
assert front.get('NEXT_PUBLIC_DEMO_MODE','false')=='false','Production demo mode must be disabled'
admin=front.get('ADMIN_USER_ID','')
assert re.fullmatch(r'[0-9a-fA-F-]{36}',admin),'Frontend administrator is not configured'
assert back.get('ADMIN_USER_ID',admin)==admin,'Administrator settings differ'
assert front.get('INTERNAL_API_TOKEN') and front.get('INTERNAL_API_TOKEN')==back.get('INTERNAL_API_TOKEN'),'Internal token settings differ'
services['backend']['environment']['ADMIN_USER_ID']=admin
services['frontend']['build']={'args':{'PLAYER_CARD_ENABLED':front.get('PLAYER_CARD_ENABLED','false')}}
(p/'features.json').write_text(json.dumps({'services':services}))
images=dict(line.split() for line in (p/'images.txt').read_text().splitlines())
(p/'rollback.json').write_text(json.dumps({'services':{name:{'image':tag} for name,tag in images.items()}}))
PY
compose() { docker compose --env-file "$production_env" -f deploy/compose.yaml -f "$backup/features.json" "$@"; }
active=0
rollback() {
  local status=$?
  trap - ERR
  set +e
  printf 'Deployment failed. Private backup: %s\n' "$backup" >&2
  if [[ "$active" -eq 1 ]] && cmp -s "$production_env" "$backup/production.env"; then
    docker compose --env-file "$production_env" -f deploy/compose.yaml -f "$backup/features.json" -f "$backup/rollback.json" up -d --no-deps --no-build --wait --wait-timeout 180 "${services[@]}"
    printf 'Previous application images restored. Additive registration data retained.\n' >&2
  fi
  exit "$status"
}
trap rollback ERR
# No registration or sporting publication is performed during verification.
compose build backend frontend interclub-analysis </dev/null
compose run --rm --no-deps -T backend python - "$release_kind" <<'PY'
import os,sys
from urllib.parse import urlparse
from supabase import create_client
from app.services.player_registration_service import admin_options,official_rosters
assert urlparse(os.environ['SUPABASE_URL']).hostname=='vkvdyrsrvbyugbjlmknb.supabase.co'
db=create_client(os.environ['SUPABASE_URL'],os.environ['SUPABASE_SERVICE_ROLE_KEY'])
data=admin_options(db)
assert data['seasons'] and data['clubs'] and data['teams']
assert len(official_rosters(db))>=8
if sys.argv[1]=='visibility-nakka':
    from app.services.visibility_names import load_visibility_names
    names=load_visibility_names(db)
    assert names.by_name, 'Nakka visibility names unavailable'
    print('Current Nakka visibility names loaded from production identities and rosters.')
print('Registration schema and production read models verified.')
PY
cmp -s "$production_env" "$backup/production.env"
cmp -s deploy/Caddyfile "$backup/Caddyfile"
active=1
compose up -d --no-deps --no-build --wait --wait-timeout 180 "${services[@]}" </dev/null
compose exec -T backend python - "$release_kind" <<'PY'
import json,os,sys,urllib.request,urllib.error
base='http://127.0.0.1:8000/api/v1/player-registrations'
headers={'X-Internal-Token':os.environ['INTERNAL_API_TOKEN'],'X-User-Id':os.environ['ADMIN_USER_ID']}
with urllib.request.urlopen(urllib.request.Request(base+'/admin',headers=headers),timeout=30) as r:
    data=json.load(r)
assert data['seasons'] and data['clubs'] and data['teams']
try: urllib.request.urlopen(base+'/admin',timeout=15)
except urllib.error.HTTPError as error: assert error.code in (401,403)
else: raise AssertionError('Anonymous administrator access was accepted')
with urllib.request.urlopen(base+'/rosters',timeout=30) as r:
    assert len(json.load(r)['rosters'])>=8
print('Registration API, private access and public rosters verified.')
if sys.argv[1]=='visibility-nakka':
    base='http://127.0.0.1:8000/api/v1/visibility'
    def read(path):
        with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers),timeout=90) as r:
            return json.load(r)
    evenings=read('/evenings')['evenings']
    tournaments=read('/tournaments')['tournaments']
    for path,version in ([('/summary?result_id='+evenings[0]['id'],3)] if evenings else []) + ([('/tournament-summary?code='+tournaments[0]['code'],2)] if tournaments else []):
        summary=read(path)
        assert summary['summary_version']==version
        text='\n'.join(fact['text'] for fact in summary['evening']['facts'])
        for original,nickname in summary['evening'].get('name_replacements',{}).items():
            if original!=nickname and len(original.split())>=2:
                assert original not in text, 'A resolved full name remains in a visibility fact'
    print('Visibility catalogs and current Nakka sharing drafts verified.')
PY
curl -fsS --connect-timeout 10 --max-time 90 https://974darts.re/api/health > "$backup/health.json"
curl -fsS --connect-timeout 10 --max-time 90 https://974darts.re/teams > "$backup/teams.html"
admin_status=$(curl -sS --connect-timeout 10 --max-time 90 -o "$backup/admin-anonymous.html" -w '%{http_code}' https://974darts.re/admin/players)
[[ "$admin_status" == 302 || "$admin_status" == 303 || "$admin_status" == 307 || "$admin_status" == 308 ]]
python3 - "$backup" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); health=json.loads((p/'health.json').read_text())
assert health.get('status')=='ok' and health.get('demoMode') is False
assert 'Les équipes' in (p/'teams.html').read_text()
PY
cmp -s "$production_env" "$backup/production.env"
cmp -s deploy/Caddyfile "$backup/Caddyfile"
trap - ERR
if [[ "$release_kind" == visibility-nakka ]]; then
  printf 'Nakka visibility deployed and verified: https://974darts.re/admin/visibility\nPrivate backup: %s\n' "$backup"
else
  printf 'Player registration deployed and verified: https://974darts.re/admin/players\nPrivate backup: %s\n' "$backup"
fi
compose ps "${services[@]}"
