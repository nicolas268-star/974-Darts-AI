#!/usr/bin/env bash
# Run as root from /opt/974darts/current after the verified fast-forward.
# The additive Supabase migration must already be complete.
# A private sporting-data backup is captured below before application changes.
# No official publication command or sporting-data rollback is performed here.
set -Eeuo pipefail
umask 077

release_commit=${1:?Usage: deploy-tournament-pages.sh RELEASE_SHA PREVIOUS_SHA}
previous_commit=${2:?Previous production checkout commit required}
[[ "$release_commit" =~ ^[0-9a-f]{40}$ && "$previous_commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit identifiers.' >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || { echo 'Run with sudo from the production checkout.' >&2; exit 1; }
[[ "$(pwd -P)" == "$(readlink -f /opt/974darts/current)" ]] || { echo 'Run from /opt/974darts/current.' >&2; exit 1; }
production_env=/etc/974darts/production.env
production_data=/var/lib/974darts/backend-data
public_origin=https://974darts.re
[[ -f "$production_env" && -d "$production_data" ]] || { echo 'Production environment or persistent data missing.' >&2; exit 1; }

git_repo() { git --no-optional-locks -c safe.directory="$PWD" "$@"; }
compose() { docker compose --env-file "$production_env" --profile ranking-workflow -f deploy/compose.yaml "$@"; }
[[ "$(git_repo rev-parse HEAD)" == "$release_commit" ]] || { echo 'Checkout differs from the verified release.' >&2; exit 1; }
checkout_changes=$(git_repo status --porcelain -- . ':!deploy/Caddyfile' ':!deploy/Caddyfile.before-preview.e5lNZy')
[[ -z "$checkout_changes" ]] || { echo 'Checkout has unexpected local modifications.' >&2; exit 1; }
git_repo diff --cached --quiet
git_repo merge-base --is-ancestor "$previous_commit" "$release_commit"
# Preserve the production proxy override and its mounted inode.
git_repo diff --quiet "$previous_commit" "$release_commit" -- deploy/Caddyfile
compose config --quiet
compose config --format json | python3 deploy/check-tournament-data-volume.py

release_stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="/var/backups/974darts/tournament-pages-$release_stamp"
install -d -m 700 "$backup_dir"
activation_started=0
worker_was_running=0
worker_had_image=0

rollback_on_error() {
  local status=$?
  trap - ERR
  set +e
  printf 'Deployment failed; retained backup: %s\n' "$backup_dir" >&2
  if [[ "$activation_started" -eq 1 ]]; then
    # Cancel page/analysis/email work before restoring the previous application.
    compose stop ranking-worker
    if ! cmp -s "$backup_dir/production.env" "$production_env"; then
      printf 'Server environment changed concurrently. Worker remains stopped; inspect the saved images and environment before manual rollback.\n' >&2
      exit "$status"
    fi
    if docker compose --env-file "$production_env" --profile ranking-workflow -f deploy/compose.yaml -f "$backup_dir/rollback.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend; then
      if [[ "$worker_had_image" -eq 1 ]]; then
        if [[ "$worker_was_running" -eq 1 ]]; then
          docker compose --env-file "$production_env" --profile ranking-workflow -f deploy/compose.yaml -f "$backup_dir/rollback.yaml" up -d --no-deps --no-build ranking-worker
        else
          docker compose --env-file "$production_env" --profile ranking-workflow -f deploy/compose.yaml -f "$backup_dir/rollback.yaml" up --no-start --no-deps --no-build ranking-worker
        fi
      fi
      printf 'Previous application images restored; verify health and worker state.\n' >&2
    else
      printf 'Automatic application rollback failed; inspect the saved rollback.yaml.\n' >&2
    fi
    printf 'Supabase tables, official results and persistent data were not rolled back.\n' >&2
  fi
  exit "$status"
}
trap rollback_on_error ERR

cp -p "$production_env" "$backup_dir/production.env"
cp -p deploy/Caddyfile "$backup_dir/Caddyfile.production"
if [[ -f deploy/Caddyfile.before-preview.e5lNZy ]]; then cp -p deploy/Caddyfile.before-preview.e5lNZy "$backup_dir/"; fi
printf '%s\n' "$previous_commit" > "$backup_dir/previous-commit.txt"
printf '%s\n' "$release_commit" > "$backup_dir/release-commit.txt"

# Capture actual previous images before `build` changes their Compose tags.
for service in backend frontend ranking-worker; do
  container_id=$(compose ps -aq "$service")
  if [[ -z "$container_id" ]]; then
    [[ "$service" == ranking-worker ]] || { echo "Existing $service container missing." >&2; exit 1; }
    printf 'ranking-worker absent\n' > "$backup_dir/previous-worker-state.txt"
    continue
  fi
  [[ "$container_id" != *$'\n'* ]] || { echo "Multiple $service containers found; inspect before deploying." >&2; exit 1; }
  image_id=$(docker inspect --format '{{.Image}}' "$container_id")
  rollback_image="darts974-$service:before-tournament-pages-$release_stamp"
  docker tag "$image_id" "$rollback_image"
  printf '%s %s\n' "$service" "$rollback_image" >> "$backup_dir/rollback-images.txt"
  if [[ "$service" == ranking-worker ]]; then
    worker_had_image=1
    worker_state=$(docker inspect --format '{{.State.Status}}' "$container_id")
    printf '%s\n' "$worker_state" > "$backup_dir/previous-worker-state.txt"
    [[ "$worker_state" == running || "$worker_state" == exited || "$worker_state" == created ]] || { echo 'Worker is unstable or paused; inspect before deploying.' >&2; exit 1; }
    if [[ "$worker_state" == running ]]; then worker_was_running=1; fi
  fi
done
{
  printf 'services:\n'
  while read -r service image; do printf '  %s:\n    image: %s\n' "$service" "$image"; done < "$backup_dir/rollback-images.txt"
} > "$backup_dir/rollback.yaml"

capture_official_state() {
  compose exec -T backend python - "${1:-checksum}" <<'PY'
import hashlib,json,os,sys
from supabase import create_client
from app.config import settings

def rows(db, table, columns='*'):
    result=[]
    for offset in range(0,100000,500):
        batch=db.table(table).select(columns).order('id').range(offset,offset+499).execute().data or []
        result.extend(batch)
        if len(batch)<500: return result
    raise ValueError('Inventory exceeded its safe bound')

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

try:
    assert os.environ.get('RANKING_WORKFLOW_ENABLED','false').lower()=='true','Workflow must already be enabled'
    db=create_client(settings.supabase_url,settings.supabase_service_role_key)
    # The migration is transactional: all four existing tables prove installation.
    for table in ('tournament_pages','tournament_page_revisions','tournament_page_previews','tournament_page_jobs'):
        db.table(table).select('id').limit(1).execute()
    event_rows=rows(db,'ranking_workflow_events')
    revision_rows=[]
    for offset in range(0,100000,500):
        batch=db.table('ranking_workflow_revisions').select('*').eq('status','PUBLISHED').order('id').range(offset,offset+499).execute().data or []
        revision_rows.extend(batch)
        if len(batch)<500: break
    else: raise ValueError('Published revision backup exceeded safe bound')
    revisions={r['id']:r for r in revision_rows}
    events=[{key:e[key] for key in ('id','source_id','discipline','published_revision_id')} for e in event_rows if e.get('published_revision_id')]
    published=[]
    for event in events:
        revision=revisions[event['published_revision_id']]
        assert revision['event_id']==event['id']
        results=revision['snapshot'].get('results') or []
        published.append({**event,'version':revision['number'],'status':revision['status'],
                          'result_count':len(results),'points':sum(r.get('points') or 0 for r in results),
                          'results_sha256':digest(results),'snapshot_sha256':digest(revision['snapshot'])})
    oc1=[e for e in published if e['source_id']=='t_ssSW_4561' and e['discipline']=='SINGLE']
    assert len(oc1)==1 and oc1[0]['status']=='PUBLISHED'
    assert oc1[0]['result_count']==29 and oc1[0]['points']==150
    legacy_rows={table:rows(db,table) for table in ('committee_ranking_events','committee_ranking_results')}
    inventory={'published':published,'legacy_sha256':{table:digest(value) for table,value in legacy_rows.items()},
               'all_published_snapshots':[{'id':r['id'],'snapshot_sha256':digest(r['snapshot'])} for r in revision_rows]}
    report=inventory
    if sys.argv[1]=='backup':
        report={'inventory':inventory,'private_backup':{'workflow_events':event_rows,
                'published_revisions':revision_rows,**legacy_rows}}
    print(json.dumps(report,sort_keys=True,ensure_ascii=False,indent=2))
except Exception:
    raise SystemExit('Official inventory failed: verify the applied migration, existing OC1 publication and server access. No point publication was attempted.') from None
PY
}

# Full published snapshots and historical point rows stay in a private 0600 file.
# Only the separate checksum inventory is used in routine deployment output.
capture_official_state backup > "$backup_dir/official-published-backup.json"
chmod 600 "$backup_dir/official-published-backup.json"
python3 - "$backup_dir/official-published-backup.json" "$backup_dir/official-before.json" <<'PY'
import json,os,sys
report=json.load(open(sys.argv[1]))
with open(sys.argv[2],'w') as output:
    json.dump(report['inventory'],output,sort_keys=True,ensure_ascii=False,indent=2)
    output.write('\n')
os.chmod(sys.argv[2],0o600)
PY
compose exec -T backend python - <<'PY' > "$backup_dir/queues-before.json"
import json,os
from collections import Counter
from supabase import create_client
from app.config import settings
from app.services.tournament_workbook_service import load_tournament_cache
db=create_client(settings.supabase_url,settings.supabase_service_role_key)
assert os.access('/app/data',os.W_OK),'Backend cache is not writable'
t5=[t for t in load_tournament_cache().get('tournaments',[]) if t.get('source_tournament_id')=='t_aKyY_3246' and (t.get('discipline') or 'SINGLE')=='SINGLE']
assert len(t5)==1 and t5[0]['code'].upper()=='T5','Historical T5 cache is missing or inconsistent'
queues={}
for table in ('ranking_workflow_jobs','ranking_notification_outbox'):
    counts=Counter()
    for offset in range(0,100000,500):
        batch=db.table(table).select('id,state').order('id').range(offset,offset+499).execute().data or []
        counts.update(row['state'] for row in batch)
        if len(batch)<500: break
    else: raise ValueError('Queue inventory exceeded safe bound')
    queues[table]=dict(counts)
queues['workflow_enabled']=os.environ.get('RANKING_WORKFLOW_ENABLED','false')
queues['email_enabled']=os.environ.get('RANKING_EMAIL_ENABLED','false')
print(json.dumps(queues,sort_keys=True,indent=2))
PY
printf 'Existing queues and non-secret worker flags:\n'
cat "$backup_dir/queues-before.json"
if [[ "$worker_was_running" -eq 1 ]]; then
  compose exec -T ranking-worker python - <<'PY' > "$backup_dir/worker-flags-before.json"
import json,os
print(json.dumps({key:os.environ.get(key,'false').lower() for key in ('RANKING_WORKFLOW_ENABLED','RANKING_EMAIL_ENABLED')}))
PY
else
  python3 - "$backup_dir/queues-before.json" <<'PY' > "$backup_dir/worker-flags-before.json"
import json,sys
queues=json.load(open(sys.argv[1]))
print(json.dumps({'RANKING_WORKFLOW_ENABLED':queues['workflow_enabled'].lower(),'RANKING_EMAIL_ENABLED':queues['email_enabled'].lower()}))
PY
fi
python3 - "$backup_dir/queues-before.json" "$worker_was_running" <<'PY'
import json,sys
queues=json.load(open(sys.argv[1]))
if sys.argv[2]!='1':
    analysis=queues['ranking_workflow_jobs']
    mail=queues['ranking_notification_outbox']
    if analysis.get('QUEUED',0)+analysis.get('RUNNING',0):
        raise SystemExit('Previously stopped worker has pending analyses: inspect the saved queue inventory before enabling it.')
    if mail.get('QUEUED',0)+mail.get('RUNNING',0)+mail.get('SENDING',0):
        raise SystemExit('Previously stopped worker has pending email: inspect existing notification intent before enabling it.')
PY

# SQLite's backup API includes committed WAL contents; keep it outside the tar.
python3 - "$production_data" "$backup_dir" <<'PY'
from pathlib import Path
import os,sqlite3,sys
source,backup=map(Path,sys.argv[1:])
for database in source.rglob('*.sqlite3'):
    if database.is_symlink(): raise SystemExit('SQLite symlink requires manual backup review')
    target=backup/'sqlite'/database.relative_to(source)
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with sqlite3.connect(f'file:{database}?mode=ro',uri=True) as reader,sqlite3.connect(target) as writer:
        reader.backup(writer)
    os.chmod(target,0o600)
PY
tar --exclude='*.sqlite3' --exclude='*.sqlite3-*' --exclude='*.schema.lock' -czf "$backup_dir/backend-data.tar.gz" -C "$production_data" .

# Build all artifacts while the current application remains available.
compose build backend frontend ranking-worker
# Validate the new worker's real mount and historical URL before cutover.
worker_expected_flags=$(python3 - "$backup_dir/worker-flags-before.json" <<'PY'
import json,sys
flags=json.load(open(sys.argv[1]))
print(flags['RANKING_WORKFLOW_ENABLED'],flags['RANKING_EMAIL_ENABLED'])
PY
)
read -r expected_workflow expected_email <<< "$worker_expected_flags"
compose run --rm --no-deps -T ranking-worker python - "$expected_workflow" "$expected_email" <<'PY'
import os,sys
from app.services.tournament_workbook_service import load_tournament_cache
assert [os.environ.get(key,'false').lower() for key in ('RANKING_WORKFLOW_ENABLED','RANKING_EMAIL_ENABLED')]==sys.argv[1:],'Pending environment changes would alter workflow/email flags'
mounts=[line.split() for line in open('/proc/self/mountinfo')]
assert any(row[4]=='/app/data' and 'ro' in row[5].split(',') for row in mounts),'Worker cache is not a read-only mount'
t5=[t for t in load_tournament_cache().get('tournaments',[]) if t.get('source_tournament_id')=='t_aKyY_3246' and (t.get('discipline') or 'SINGLE')=='SINGLE']
assert len(t5)==1 and t5[0]['code'].upper()=='T5','Worker does not see the backend historical T5 cache'
print('Worker cache preflight: shared T5 URL is readable, mount is read-only.')
PY
cmp -s "$backup_dir/production.env" "$production_env"

activation_started=1
compose stop ranking-worker
compose up -d --no-deps --no-build --wait --wait-timeout 180 backend frontend
compose up -d --no-deps --no-build ranking-worker

# Reuse the existing official OC1 dossier; this command writes projection only.
compose exec -T backend python -m app.scripts.backfill_tournament_pages --source-id t_ssSW_4561 --apply --collect-missing --location 'Saint-Leu, La Réunion' > "$backup_dir/oc1-projection.json"
oc1_path=$(python3 - "$backup_dir/oc1-projection.json" <<'PY'
import json,re,sys
report=json.load(open(sys.argv[1]))
events=[e for e in report['events'] if e['source_id']=='t_ssSW_4561' and e['discipline']=='SINGLE']
assert len(events)==1 and events[0]['written'] and events[0]['official_results_unchanged']
path=events[0]['public_url'].lower()
assert re.fullmatch(r'/tournaments/[a-z0-9_-]{1,120}',path)
print(path)
PY
)

compose exec -T backend python - "$oc1_path" <<'PY'
import json,sys,urllib.request
oc1_code=sys.argv[1].rsplit('/',1)[1]
base='http://127.0.0.1:8000/api/v1/competitions'
def get(path):
    with urllib.request.urlopen(base+path,timeout=45) as response: return json.load(response)
oc1=get('/tournaments/'+oc1_code)
t5=get('/tournaments/t5')
assert oc1['source_tournament_id']=='t_ssSW_4561'
assert oc1['classification']=='OFFICIAL' and oc1['ranking_status']=='PUBLISHED'
assert len(oc1['round_robin'])==6 and oc1['summary']['pool_matches']==56 and oc1['summary']['matches']==83
assert len(oc1['players'])==29 and not oc1['has_double_elimination'] and oc1['has_secondary_bracket']
assert len(oc1['official_results'])==29 and sum(r.get('points') or 0 for r in oc1['official_results'])==150
assert t5['source_tournament_id']=='t_aKyY_3246'
assert t5['classification']=='COMMITTEE_RECOGNIZED'
assert len(t5['round_robin'])==8 and t5['summary']['pool_matches']==60 and t5['summary']['matches']==90
assert not t5['has_double_elimination'] and t5['has_secondary_bracket']
catalog=get('')
official=catalog['official_tournaments']
friendly=catalog['tournaments']
for code in (oc1_code,'t5'):
    assert sum(str(t['code']).lower()==code.lower() for t in official)==1
    assert not any(str(t['code']).lower()==code.lower() for t in friendly)
print('API: OC1 and T5 complete, source IDs correct, official catalog unique; points read only.')
PY

curl -fsS --connect-timeout 10 --max-time 120 "$public_origin/api/health" > "$backup_dir/public-health.json"
curl -fsS --connect-timeout 10 --max-time 120 "$public_origin/competitions" > "$backup_dir/competitions.html"
curl -fsS --connect-timeout 10 --max-time 120 "$public_origin/tournaments/t5" > "$backup_dir/t5.html"
curl -fsS --connect-timeout 10 --max-time 120 "$public_origin$oc1_path" > "$backup_dir/oc1.html"
python3 - "$backup_dir" "$oc1_path" <<'PY'
from pathlib import Path
import json,sys
backup=Path(sys.argv[1])
oc1_path=sys.argv[2]
health=json.loads((backup/'public-health.json').read_text())
assert health.get('status')=='ok' and health.get('demoMode') is False
assert health.get('supabaseUrlConfigured') and health.get('publicKeyConfigured')
catalog=(backup/'competitions.html').read_text()
assert oc1_path in catalog and '/tournaments/t5' in catalog
assert 't_ssSW_4561' in (backup/'oc1.html').read_text()
assert 't_aKyY_3246' in (backup/'t5.html').read_text()
print('HTTPS: health, Competitions, historical T5 and OC1 source links verified.')
PY

capture_official_state > "$backup_dir/official-after.json"
cmp -s "$backup_dir/official-before.json" "$backup_dir/official-after.json"
cmp -s "$backup_dir/production.env" "$production_env"
sleep 6
worker_id=$(compose ps -q ranking-worker)
docker inspect --format '{{.State.Status}} {{.RestartCount}}' "$worker_id" > "$backup_dir/worker-after.txt"
python3 - "$backup_dir/worker-after.txt" <<'PY'
import sys
assert open(sys.argv[1]).read().strip()=='running 0','Ranking worker is not stable'
PY
docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.RW}}{{end}}{{end}}' "$worker_id" | grep -qx false
trap - ERR
printf 'Deployment verified: %s%s\n' "$public_origin" "$oc1_path"
printf 'OC1 remains 29 published results / 150 points; published snapshots and result checksums are unchanged.\n'
printf 'Environment unchanged. Backup and previous images: %s\n' "$backup_dir"
compose ps backend frontend ranking-worker
