#!/usr/bin/env bash
# PR #90: application rollout only. The production DB migration was applied separately.
set -Eeuo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo 'Exécuter avec sudo.' >&2; exit 1; }
cd /opt/974darts/current
repo_path=$(pwd -P)
g() { git --no-optional-locks -c safe.directory="$repo_path" "$@"; }
player_card_enabled=false
project_name=''
dc() { PLAYER_CARD_ENABLED="$player_card_enabled" docker compose ${project_name:+--project-name "$project_name"} --env-file /etc/974darts/production.env -f deploy/compose.yaml "$@"; }
target=250f9c5431ba3d082aae53b72fec9367442d22e4
g fetch origin main
[[ "$(g branch --show-current)" == main ]]
previous=$(g rev-parse HEAD)
g merge-base --is-ancestor "$target" origin/main
g merge-base --is-ancestor "$previous" "$target"
[[ -z "$(g status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')" ]] || { echo 'Modifications locales à préserver : arrêt.' >&2; exit 1; }
g diff --cached --quiet
g diff --quiet "$previous" "$target" -- deploy/Caddyfile
# Do not silently include older backend/migration releases not handled by this rollout.
if [[ "$previous" != "$target" ]]; then
  g diff --quiet "$previous" "$target^1" -- app/backend supabase deploy
fi
dc config --quiet
frontend_id=$(dc ps -q frontend)
[[ -n "$frontend_id" ]]
project_name=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$frontend_id")
[[ "$project_name" =~ ^[a-zA-Z0-9_-]+$ ]]
player_card_enabled=$(dc exec -T frontend node -p 'process.env.PLAYER_CARD_ENABLED || "false"')
[[ "$player_card_enabled" == true || "$player_card_enabled" == false ]]
worker_id=$(dc --profile ranking-workflow ps -q ranking-worker)
services=(backend frontend)
if [[ -n "$worker_id" ]]; then services+=(ranking-worker); fi
backup="/var/backups/974darts/optional-ds-90-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
printf '%s\n' "$target" > "$backup/release-commit.txt"
cp -p /etc/974darts/production.env "$backup/production.env"
cp -p deploy/Caddyfile "$backup/Caddyfile"
g show "$target:supabase/operations/rollback_optional_ds_review.sql" > "$backup/rollback-database.sql"
# Only non-secret feature switches are inspected; environment files are never printed.
feature_state() {
  docker inspect --format '{{json .Config.Env}}' "$(dc --profile ranking-workflow ps -q "$1")" |
    python3 -c 'import json,sys; e=dict(x.split("=",1) for x in json.load(sys.stdin)); print(json.dumps({k:e.get(k) for k in ["RANKING_WORKFLOW_ENABLED","RANKING_EMAIL_ENABLED","MATCH_DAY_ENABLED","MATCH_DAY_FACEBOOK_ENABLED","PLAYER_CARD_ENABLED"]},sort_keys=True))'
}
public_state() {
  dc exec -T backend python -c 'import json; from supabase import create_client; from app.config import settings; d=create_client(settings.supabase_url,settings.supabase_service_role_key).rpc("ranking_published_snapshot",{"p_season":"2026-2027"}).execute().data; print(json.dumps(d,sort_keys=True))'
}
printf 'services:\n' > "$backup/rollback.yaml"
for service in "${services[@]}"; do
  cid=$(dc --profile ranking-workflow ps -q "$service")
  [[ -n "$cid" ]]
  image=$(docker inspect --format '{{.Image}}' "$cid")
  tag="$project_name-$service:before-optional-ds-$(basename "$backup")"
  docker tag "$image" "$tag"
  printf '  %s:\n    image: %s\n' "$service" "$tag" >> "$backup/rollback.yaml"
  feature_state "$service" > "$backup/$service-flags.json"
done
public_state > "$backup/public-before.json"
activation_started=0
worker_stopped=0
rollback() {
  code=$?
  trap - ERR
  set +e
  if [[ "$activation_started" == 1 ]]; then
    dc --profile ranking-workflow -f "$backup/rollback.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 "${services[@]}"
  elif [[ "$worker_stopped" == 1 ]]; then
    dc --profile ranking-workflow -f "$backup/rollback.yaml" up -d --no-deps --no-build ranking-worker
  fi
  printf 'Déploiement interrompu. Sauvegarde : %s\nLa migration DB compatible reste installée ; aucune donnée sportive n’a été réécrite.\n' "$backup" >&2
  exit "$code"
}
trap rollback ERR
g merge --ff-only "$target"
[[ "$(g rev-parse HEAD)" == "$target" ]]
dc --profile ranking-workflow build "${services[@]}"
if [[ -n "$worker_id" ]]; then
  dc --profile ranking-workflow stop ranking-worker
  worker_stopped=1
fi
activation_started=1
dc up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend
if [[ -n "$worker_id" ]]; then dc --profile ranking-workflow up -d --no-deps --no-build ranking-worker; fi
dc exec -T backend python -c 'from app.services.ranking_workflow import director_review; from app.api.ranking_workflow_router import VISIBLE_DS; assert "ANALYZED" in VISIBLE_DS; assert director_review({"id":"test","fingerprint":"test","director_id":None},[])=={"status":"NOT_REVIEWED"}; print("Backend : relecture facultative installée.")'
for service in "${services[@]}"; do
  feature_state "$service" > "$backup/$service-flags-after.json"
  cmp "$backup/$service-flags.json" "$backup/$service-flags-after.json"
done
public_state > "$backup/public-after.json"
cmp "$backup/public-before.json" "$backup/public-after.json"
curl -fsS --retry 3 --retry-delay 2 --max-time 20 https://974darts.re/api/health
printf '\n'
for path in /competitions/classement-individuel /championships/2027; do
  curl -fsS --retry 2 --max-time 30 -o /dev/null "https://974darts.re$path"
done
code=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' https://974darts.re/api/ranking-workflow/events)
[[ "$code" == 401 ]]
if [[ -n "$worker_id" ]]; then
  cid=$(dc --profile ranking-workflow ps -q ranking-worker)
  [[ "$(docker inspect --format '{{.State.Status}} {{.RestartCount}}' "$cid")" == 'running 0' ]]
fi
dc --profile ranking-workflow ps "${services[@]}"
g log -1 --oneline
trap - ERR
printf 'Déploiement vérifié : données publiques et options préservées.\nSauvegarde : %s\n' "$backup"
