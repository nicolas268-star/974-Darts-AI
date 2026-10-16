#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/974darts/current
g() { git -c safe.directory="$PWD" "$@"; }
target=${1:?Usage: deploy-mvp-91.sh VERIFIED_MERGE_SHA}
[[ "$target" =~ ^[0-9a-f]{40}$ ]]
g fetch origin main
[[ "$(g branch --show-current)" == main ]]
previous=$(g rev-parse HEAD)
g merge-base --is-ancestor "$target" origin/main
g merge-base --is-ancestor 68a4f3c85661167924c1e9bee3796242cc9b8a69 "$target"
g merge-base --is-ancestor "$previous" "$target"
[[ -z "$(g status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')" ]]
g diff --cached --quiet
g diff --quiet "$previous" "$target" -- app/backend supabase deploy app/frontend/Dockerfile app/frontend/package.json app/frontend/package-lock.json
player_card_enabled=false
dc() { PLAYER_CARD_ENABLED="$player_card_enabled" docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml "$@"; }
cid=$(dc ps -q frontend)
[[ -n "$cid" ]]
player_card_enabled=$(docker exec "$cid" node -p 'process.env.PLAYER_CARD_ENABLED || "false"')
[[ "$player_card_enabled" == true || "$player_card_enabled" == false ]]
backup="/var/backups/974darts/mvp-91-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
printf '%s\n' "$target" > "$backup/release-commit.txt"
cp -p /etc/974darts/production.env "$backup/production.env"
rollback_image="darts974-frontend:before-mvp-91-$(basename "$backup")"
docker tag "$(docker inspect --format '{{.Image}}' "$cid")" "$rollback_image"
printf 'services:\n  frontend:\n    image: %s\n' "$rollback_image" > "$backup/rollback.yaml"
flags() {
  docker inspect --format '{{json .Config.Env}}' "$1" | python3 -c 'import json,sys; e=dict(x.split("=",1) for x in json.load(sys.stdin)); print(json.dumps({k:e.get(k) for k in ["PLAYER_CARD_ENABLED","RANKING_WORKFLOW_ENABLED","RANKING_EMAIL_ENABLED","MATCH_DAY_ENABLED","MATCH_DAY_FACEBOOK_ENABLED"]},sort_keys=True))'
}
flags "$cid" > "$backup/flags-before.json"
dc config --format json | python3 -c 'import json,sys; before=json.load(open(sys.argv[1])); planned=json.load(sys.stdin)["services"]["frontend"]["environment"]; changed=[k for k,v in before.items() if v!=planned.get(k)]; sys.exit("Options actives différentes : "+", ".join(changed) if changed else 0)' "$backup/flags-before.json"
activation_started=0
rollback() {
  code=$?
  trap - ERR
  set +e
  if [[ "$activation_started" == 1 ]]; then dc -f "$backup/rollback.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 frontend; fi
  printf 'Déploiement interrompu. Sauvegarde : %s\n' "$backup" >&2
  exit "$code"
}
trap rollback ERR
g merge --ff-only "$target"
dc build frontend
activation_started=1
dc up -d --no-deps --no-build --wait --wait-timeout 180 frontend
flags "$(dc ps -q frontend)" > "$backup/flags-after.json"
cmp "$backup/flags-before.json" "$backup/flags-after.json"
curl -fsS --retry 3 --retry-delay 2 --max-time 30 https://974darts.re/api/health
printf '\n'
for route in /records/mvp/2027 /records/mvp/2027/explications; do
  curl -fsS --retry 2 --max-time 45 -o /dev/null "https://974darts.re$route"
done
dc exec -T frontend node -e 'Promise.all([["/records/mvp/2027","mvp-guide-entry"],["/records/mvp/2027/explications","Comprendre le trophée MVP 2027"]].map(async ([path,marker])=>{const response=await fetch("http://127.0.0.1:3000"+path);if(!response.ok||!(await response.text()).includes(marker))throw Error(path);console.log("MVP 2027 : page vérifiée "+path)})).catch(error=>{console.error(error.message);process.exit(1)})'
trap - ERR
g log -1 --oneline
dc ps frontend
printf 'MVP 2027 déployé. Sauvegarde : %s\n' "$backup"

