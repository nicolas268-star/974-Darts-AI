-- Private immutable snapshots alongside the existing public historical tables.
-- No network calls in transactions. All mutations use service-only INVOKER RPCs.
begin;
create table public.ranking_workflow_config (
  singleton boolean primary key default true check (singleton),
  administrator_id uuid not null references public.profiles(user_id)
);
insert into public.ranking_workflow_config(administrator_id)
select min(user_id::text)::uuid from public.profiles where role::text='ADMIN' having count(*)=1;

create table public.ranking_workflow_events (
  id text primary key,
  source_id text not null,
  discipline text not null check(discipline in ('SINGLE','DOUBLE')),
  season_key text not null check(season_key ~ '^20[0-9]{2}-20[0-9]{2}$'),
  current_revision_id uuid,
  published_revision_id uuid,
  created_at timestamptz not null default now(),
  unique(source_id,discipline)
);
create table public.ranking_workflow_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.ranking_workflow_events(id),
  number integer not null check(number>0),
  status text not null check(status in ('DRAFT','ANALYZED','PENDING_DS','CORRECTION_REQUESTED','DS_VALIDATED','READY_TO_PUBLISH','PUBLISHED','ARCHIVED')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  fingerprint text not null,
  director_id uuid, -- Historical actor ID survives account deletion.
  created_by uuid,
  created_at timestamptz not null default now(),
  historical boolean not null default false,
  unique(event_id,number), unique(event_id,id)
);
alter table public.ranking_workflow_events add constraint workflow_current_revision_fk
 foreign key(id,current_revision_id) references public.ranking_workflow_revisions(event_id,id) deferrable initially deferred;
alter table public.ranking_workflow_events add constraint workflow_published_revision_fk
 foreign key(id,published_revision_id) references public.ranking_workflow_revisions(event_id,id) deferrable initially deferred;
create index on public.ranking_workflow_revisions(director_id,status);

create table public.ranking_workflow_decisions (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.ranking_workflow_revisions(id),
  actor_id uuid not null, actor_name text not null, actor_role text not null,
  action text not null, comment text not null default '', fingerprint text not null,
  created_at timestamptz not null default now()
);
create index on public.ranking_workflow_decisions(revision_id);
create table public.ranking_workflow_audit (
  id bigint generated always as identity primary key,
  event_id text not null references public.ranking_workflow_events(id),
  revision_id uuid references public.ranking_workflow_revisions(id),
  actor_id uuid not null, action text not null, reason text not null default '',
  before_state jsonb, after_state jsonb,
  idempotency_key uuid not null unique, request_fingerprint text not null,
  response jsonb not null, created_at timestamptz not null default now()
);
create index on public.ranking_workflow_audit(event_id,created_at);
create index on public.ranking_workflow_audit(revision_id);
create table public.ranking_workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.ranking_workflow_events(id),
  actor_id uuid not null, expected_revision uuid,
  state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','FAILED','SUCCEEDED')),
  attempts integer not null default 0, lease_id uuid, lease_until timestamptz,
  error text, created_at timestamptz not null default now(), finished_at timestamptz
);
create index on public.ranking_workflow_jobs(event_id,created_at);
create unique index ranking_workflow_active_job on public.ranking_workflow_jobs(event_id) where state in ('QUEUED','RUNNING');
create table public.ranking_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.ranking_workflow_decisions(id),
  recipient_id uuid not null, event_id text not null references public.ranking_workflow_events(id),
  template text not null check(template in ('SUBMIT','APPROVE_DS','REQUEST_CORRECTION')),
  payload jsonb not null,
  state text not null default 'QUEUED' check(state in ('QUEUED','SENDING','SMTP_ACCEPTED','FAILED')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_id uuid, lease_until timestamptz, last_error text, accepted_at timestamptz,
  created_at timestamptz not null default now(), unique(decision_id,recipient_id,template)
);
create index on public.ranking_notification_outbox(state,next_attempt_at);
create index on public.ranking_notification_outbox(event_id);

-- Immutable sports data, audit and decisions, including for service-role clients.
create function public.ranking_reject_mutation() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'IMMUTABLE_RECORD'; end $$;
create function public.ranking_seal_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
   raise exception 'IMMUTABLE_REVISION';
 end if;
 return new;
end $$;
create trigger ranking_revision_seal before update or delete on public.ranking_workflow_revisions for each row execute function public.ranking_seal_revision();
create trigger ranking_decision_seal before update or delete on public.ranking_workflow_decisions for each row execute function public.ranking_reject_mutation();
create trigger ranking_audit_seal before update or delete on public.ranking_workflow_audit for each row execute function public.ranking_reject_mutation();

-- Freeze the historical contribution verbatim; never fabricate a DS signature.
insert into public.ranking_workflow_events(id,source_id,discipline,season_key)
select id,coalesce(substring(source_url from 'id=([^&]+)'), 'historical:'||id),
 case when ranking_kind='CLUB_DOUBLE' then 'DOUBLE' else 'SINGLE' end,season_key
from public.committee_ranking_events where status='PUBLISHED';
insert into public.ranking_workflow_revisions(event_id,number,status,snapshot,fingerprint,created_by,created_at,historical)
select e.id,1,'PUBLISHED',s.snapshot,encode(sha256(convert_to(s.snapshot::text,'UTF8')),'hex'),e.published_by,coalesce(e.published_at,e.created_at),true
from public.committee_ranking_events e cross join lateral (
 select jsonb_build_object(
 'metadata',jsonb_build_object('title',e.title,'event_date',e.event_date,'kind',e.ranking_kind,'category',e.ranking_category,'season_key',e.season_key,'source_url',e.source_url,'organizer',case when e.id='club-open-kaz-2026-09-13' then 'Kaz A Darts 974' else e.title end),
 'results',coalesce((select jsonb_agg((to_jsonb(r)-'id'-'created_at') || jsonb_build_object('source_name',r.player_name,'player_name',coalesce(i.canonical_display_name,r.player_name)) order by r.display_order) from public.committee_ranking_results r left join public.player_identities i on i.id=r.identity_id where r.event_id=e.id),'[]'::jsonb),
 'blockers','[]'::jsonb,'ruleset','historical-2026','historical_attestation',jsonb_build_object('label','Attestation historique administrateur — sans signature DS','validated_at',e.validated_at,'published_at',e.published_at)
 ) as snapshot
) s where e.status='PUBLISHED';
update public.ranking_workflow_events e set current_revision_id=r.id,published_revision_id=r.id from public.ranking_workflow_revisions r where r.event_id=e.id;

create function public.ranking_workflow_command(p_actor uuid,p_event_id text,p_expected uuid,p_key uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 e public.ranking_workflow_events%rowtype; r public.ranking_workflow_revisions%rowtype;
 a public.ranking_workflow_audit%rowtype; actor_role text; actor_name text; admin_id uuid;
 request_hash text; before_value jsonb; after_value jsonb; result jsonb; target_status text;
 new_id uuid; decision_id uuid; recipient uuid; director uuid; job public.ranking_workflow_jobs%rowtype;
 snap jsonb; row_value jsonb; identities text[]; reason text:=coalesce(p_payload->>'reason','');
begin
 select role::text,coalesce(display_name,user_id::text) into actor_role,actor_name from public.profiles where user_id=p_actor;
 select administrator_id into admin_id from public.ranking_workflow_config where singleton;
 if actor_role is null or admin_id is null or not ((actor_role='ADMIN' and p_actor=admin_id) or actor_role='SPORTS_DIRECTOR') then raise exception 'FORBIDDEN'; end if;
 if p_key is null or length(p_event_id)>100 or length(reason)>2000 then raise exception 'INVALID_REQUEST'; end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_actor,p_event_id,p_expected,p_action,p_payload)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into a from public.ranking_workflow_audit where idempotency_key=p_key;
 if found then
   if a.request_fingerprint<>request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return a.response;
 end if;
 if p_action='CREATE' then
   if actor_role<>'ADMIN' then raise exception 'FORBIDDEN'; end if;
   insert into public.ranking_workflow_events(id,source_id,discipline,season_key)
   values(p_event_id,p_payload->>'source_id',p_payload->>'discipline',p_payload->>'season_key');
 end if;
 select * into e from public.ranking_workflow_events where id=p_event_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if e.current_revision_id is distinct from p_expected then raise exception 'STALE_REVISION'; end if;
 select * into r from public.ranking_workflow_revisions where id=e.current_revision_id;
 before_value:=jsonb_build_object('revision_id',e.current_revision_id,'status',r.status,'published_revision_id',e.published_revision_id);
 if actor_role='SPORTS_DIRECTOR' and (r.director_id is distinct from p_actor or p_action not in ('APPROVE_DS','REQUEST_CORRECTION')) then raise exception 'FORBIDDEN'; end if;
 if actor_role='ADMIN' and p_action in ('APPROVE_DS','REQUEST_CORRECTION') then raise exception 'SEPARATE_DIRECTOR_REQUIRED'; end if;

 if p_action in ('CREATE','SAVE','ANALYZE') then
   if actor_role<>'ADMIN' then raise exception 'FORBIDDEN'; end if;
   if p_action='SAVE' and length(trim(reason))<3 then raise exception 'REASON_REQUIRED'; end if;
   if p_action='ANALYZE' then
     select * into job from public.ranking_workflow_jobs where id=(p_payload->>'job_id')::uuid for update;
     if job.event_id is distinct from e.id or job.actor_id<>p_actor or job.state<>'RUNNING' or job.lease_id is distinct from (p_payload->>'lease_id')::uuid or job.lease_until<now() then raise exception 'STALE_JOB'; end if;
   end if;
   snap:=p_payload->'snapshot';
   if snap is null or jsonb_typeof(snap->'results') is distinct from 'array' or jsonb_typeof(snap->'blockers') is distinct from 'array' or jsonb_array_length(snap->'results')>512 or octet_length(snap::text)>1500000 then raise exception 'INVALID_SNAPSHOT'; end if;
   director:=nullif(p_payload->>'director_id','')::uuid;
   if director is not null and (director=admin_id or not exists(select 1 from public.profiles where user_id=director and role::text='SPORTS_DIRECTOR')) then raise exception 'INVALID_DIRECTOR'; end if;
   target_status:=case when p_action='CREATE' then 'DRAFT' else 'ANALYZED' end;
   insert into public.ranking_workflow_revisions(event_id,number,status,snapshot,fingerprint,director_id,created_by)
   values(e.id,coalesce(r.number,0)+1,target_status,snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),director,p_actor) returning id into new_id;
   update public.ranking_workflow_events set current_revision_id=new_id where id=e.id;
   if p_action='ANALYZE' then update public.ranking_workflow_jobs set state='SUCCEEDED',finished_at=now(),error=null where id=job.id; end if;
 elsif p_action='IMPORT' then
   if actor_role<>'ADMIN' then raise exception 'FORBIDDEN'; end if;
   if (select count(*) from public.ranking_workflow_jobs where actor_id=p_actor and created_at>now()-interval '10 minutes')>=5 then raise exception 'RATE_LIMIT'; end if;
   insert into public.ranking_workflow_jobs(event_id,actor_id,expected_revision) values(e.id,p_actor,e.current_revision_id) returning id into new_id;
   target_status:=r.status;
 elsif p_action in ('SUBMIT','APPROVE_DS','REQUEST_CORRECTION','APPROVE_ADMIN','PUBLISH','ARCHIVE') then
   if r.id is null then raise exception 'REVISION_REQUIRED'; end if;
   if p_action='SUBMIT' and r.status='ANALYZED' then target_status:='PENDING_DS';
   elsif p_action='APPROVE_DS' and r.status='PENDING_DS' then target_status:='DS_VALIDATED';
   elsif p_action='REQUEST_CORRECTION' and r.status='PENDING_DS' and length(trim(reason))>=3 then target_status:='CORRECTION_REQUESTED';
   elsif p_action='APPROVE_ADMIN' and r.status='DS_VALIDATED' then target_status:='READY_TO_PUBLISH';
   elsif p_action='PUBLISH' and r.status='READY_TO_PUBLISH' then target_status:='PUBLISHED';
   elsif p_action='ARCHIVE' and r.status in ('DRAFT','ANALYZED','CORRECTION_REQUESTED') and length(trim(reason))>=3 then target_status:='ARCHIVED';
   else raise exception 'INVALID_TRANSITION'; end if;
   if p_action<>'REQUEST_CORRECTION' and p_payload->>'confirmed' is distinct from 'true' then raise exception 'CONFIRMATION_REQUIRED'; end if;
   if p_action in ('SUBMIT','APPROVE_DS','APPROVE_ADMIN','PUBLISH') then
     if r.director_id is null or not exists(select 1 from public.profiles where user_id=r.director_id and role::text='SPORTS_DIRECTOR') then raise exception 'INVALID_DIRECTOR'; end if;
     if jsonb_array_length(r.snapshot->'blockers')<>0 or jsonb_array_length(r.snapshot->'results')=0 then raise exception 'BLOCKING_ANOMALIES'; end if;
     select array_agg(x->>'identity_id') into identities from jsonb_array_elements(r.snapshot->'results') x where nullif(x->>'identity_id','') is not null;
     if cardinality(identities)<>(select count(distinct x) from unnest(identities) x) then raise exception 'DUPLICATE_IDENTITY'; end if;
     for row_value in select value from jsonb_array_elements(r.snapshot->'results') loop
       if (row_value->>'points')::integer>0 and nullif(row_value->>'identity_id','') is null then raise exception 'IDENTITY_REQUIRED'; end if;
     end loop;
     if (r.snapshot->'metadata'->>'kind') in ('CLUB_SINGLE','CLUB_DOUBLE') then
       -- Serialize recognitions per club and season across separate events.
       perform pg_advisory_xact_lock(hashtextextended(e.season_key||':'||(r.snapshot->'metadata'->>'organizer'),1));
       if (select count(distinct ce.id) from public.ranking_workflow_events ce join public.ranking_workflow_revisions cr on cr.id in (ce.current_revision_id,ce.published_revision_id)
           where ce.id<>e.id and ce.season_key=e.season_key and cr.snapshot->'metadata'->>'organizer'=r.snapshot->'metadata'->>'organizer'
           and (cr.id=ce.published_revision_id or cr.status in ('PENDING_DS','DS_VALIDATED','READY_TO_PUBLISH'))) >=2 then raise exception 'CLUB_EVENT_LIMIT'; end if;
     end if;
   end if;
   if p_action in ('APPROVE_ADMIN','PUBLISH') and not exists(select 1 from public.ranking_workflow_decisions where revision_id=r.id and actor_id=r.director_id and action='APPROVE_DS' and fingerprint=r.fingerprint) then raise exception 'DIRECTOR_APPROVAL_REQUIRED'; end if;
   if p_action='PUBLISH' and not exists(select 1 from public.ranking_workflow_decisions where revision_id=r.id and actor_id=admin_id and action='APPROVE_ADMIN' and fingerprint=r.fingerprint) then raise exception 'ADMIN_APPROVAL_REQUIRED'; end if;
   update public.ranking_workflow_revisions set status=target_status where id=r.id;
   if p_action='PUBLISH' then update public.ranking_workflow_events set published_revision_id=r.id where id=e.id; end if;
   insert into public.ranking_workflow_decisions(revision_id,actor_id,actor_name,actor_role,action,comment,fingerprint)
   values(r.id,p_actor,actor_name,actor_role,p_action,reason,r.fingerprint) returning id into decision_id;
   if p_action in ('SUBMIT','APPROVE_DS','REQUEST_CORRECTION') then
     recipient:=case when p_action='SUBMIT' then r.director_id else admin_id end;
     insert into public.ranking_notification_outbox(decision_id,recipient_id,event_id,template,payload)
     values(decision_id,recipient,e.id,p_action,jsonb_build_object('title',r.snapshot->'metadata'->>'title','date',r.snapshot->'metadata'->>'event_date','organizer',r.snapshot->'metadata'->>'organizer','kind',r.snapshot->'metadata'->>'kind','version',r.number,'actor',actor_name,'at',now()));
   end if;
 else raise exception 'UNKNOWN_ACTION'; end if;
 select jsonb_build_object('revision_id',current_revision_id,'published_revision_id',published_revision_id,'status',target_status) into after_value from public.ranking_workflow_events where id=e.id;
 result:=after_value||jsonb_build_object('event_id',e.id,'action',p_action,'job_id',case when p_action='IMPORT' then new_id end);
 insert into public.ranking_workflow_audit(event_id,revision_id,actor_id,action,reason,before_state,after_state,idempotency_key,request_fingerprint,response)
 values(e.id,case when p_action in ('CREATE','SAVE','ANALYZE') then new_id else r.id end,p_actor,p_action,reason,before_value,after_value,p_key,request_hash,result);
 return result;
end $$;

-- One coherent database statement reads only approved public fields.
create function public.ranking_published_snapshot(p_season text) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('events',coalesce(jsonb_agg(jsonb_build_object(
'id',e.id,'title',r.snapshot->'metadata'->>'title','event_date',r.snapshot->'metadata'->>'event_date',
'revision',r.number,'results',(select coalesce(jsonb_agg(jsonb_build_object('identity_id',x->>'identity_id','player_name',x->>'player_name','club',x->>'club','gender',x->>'gender','points',(x->>'points')::integer)),'[]'::jsonb) from jsonb_array_elements(r.snapshot->'results') x)
) order by r.snapshot->'metadata'->>'event_date',e.id),'[]'::jsonb))
from public.ranking_workflow_events e join public.ranking_workflow_revisions r on r.id=e.published_revision_id where e.season_key=p_season;
$$;

create function public.ranking_claim_work(p_queue text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if p_queue='analysis' then
   update public.ranking_workflow_jobs set state='FAILED',error='Le traitement a expiré.',finished_at=now() where state='RUNNING' and lease_until<now() and attempts>=3;
   with candidate as (select id from public.ranking_workflow_jobs where state='QUEUED' or (state='RUNNING' and lease_until<now() and attempts<3) order by created_at for update skip locked limit 1)
   update public.ranking_workflow_jobs j set state='RUNNING',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' from candidate c where j.id=c.id returning to_jsonb(j) into item;
 elsif p_queue='email' then
   update public.ranking_notification_outbox set state='FAILED',last_error='Le traitement a expiré.' where state='SENDING' and lease_until<now() and attempts>=5;
   with candidate as (select id from public.ranking_notification_outbox where (state='QUEUED' and next_attempt_at<=now()) or (state='SENDING' and lease_until<now() and attempts<5) order by created_at for update skip locked limit 1)
   update public.ranking_notification_outbox o set state='SENDING',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes' from candidate c where o.id=c.id returning to_jsonb(o) into item;
 else raise exception 'INVALID_QUEUE'; end if;
 return item;
end $$;

-- Flush deferred historical pointer checks before ALTER TABLE.
set constraints all immediate;

-- Explicit grants; client roles cannot read drafts, comments, queues or audit.
do $$ declare t text; begin
 foreach t in array array['ranking_workflow_config','ranking_workflow_events','ranking_workflow_revisions','ranking_workflow_decisions','ranking_workflow_audit','ranking_workflow_jobs','ranking_notification_outbox'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.ranking_workflow_audit_id_seq to service_role;
revoke update on public.ranking_workflow_audit,public.ranking_workflow_decisions from service_role;
revoke all on function public.ranking_workflow_command(uuid,text,uuid,uuid,text,jsonb),public.ranking_published_snapshot(text),public.ranking_claim_work(text),public.ranking_seal_revision(),public.ranking_reject_mutation() from public,anon,authenticated;
grant execute on function public.ranking_workflow_command(uuid,text,uuid,uuid,text,jsonb),public.ranking_published_snapshot(text),public.ranking_claim_work(text) to service_role;
commit;
