-- DS review becomes optional. No rows, jobs or notifications are rewritten/queued.
-- Publication still requires two explicit Admin commands for the same immutable revision.
begin;
create or replace function public.ranking_workflow_command(p_actor uuid,p_event_id text,p_expected uuid,p_key uuid,p_action text,p_payload jsonb default '{}'::jsonb)
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
   elsif p_action='APPROVE_DS' and r.status in ('ANALYZED','PENDING_DS','DS_VALIDATED','READY_TO_PUBLISH','PUBLISHED') then
     -- A late review records a decision without changing visibility or Admin approval.
     target_status:=case when r.status in ('ANALYZED','PENDING_DS') then 'DS_VALIDATED' else r.status end;
   elsif p_action='REQUEST_CORRECTION' and r.status in ('ANALYZED','PENDING_DS','DS_VALIDATED','READY_TO_PUBLISH','PUBLISHED') and length(trim(reason))>=3 then target_status:='CORRECTION_REQUESTED';
   elsif p_action='APPROVE_ADMIN' and r.status in ('ANALYZED','PENDING_DS','DS_VALIDATED') then target_status:='READY_TO_PUBLISH';
   elsif p_action='PUBLISH' and r.status='READY_TO_PUBLISH' then target_status:='PUBLISHED';
   elsif p_action='ARCHIVE' and r.status in ('DRAFT','ANALYZED','CORRECTION_REQUESTED') and length(trim(reason))>=3 then target_status:='ARCHIVED';
   else raise exception 'INVALID_TRANSITION'; end if;
   if p_action<>'REQUEST_CORRECTION' and p_payload->>'confirmed' is distinct from 'true' then raise exception 'CONFIRMATION_REQUIRED'; end if;
   if p_action in ('SUBMIT','APPROVE_DS','APPROVE_ADMIN','PUBLISH') then
     if p_action in ('SUBMIT','APPROVE_DS') and (r.director_id is null or not exists(select 1 from public.profiles where user_id=r.director_id and role::text='SPORTS_DIRECTOR')) then raise exception 'INVALID_DIRECTOR'; end if;
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
   -- Admin approval is mandatory; a DS review is complementary.
   if p_action='PUBLISH' and not exists(select 1 from public.ranking_workflow_decisions where revision_id=r.id and actor_id=admin_id and action='APPROVE_ADMIN' and fingerprint=r.fingerprint) then raise exception 'ADMIN_APPROVAL_REQUIRED'; end if;
   update public.ranking_workflow_revisions set status=target_status where id=r.id;
   if p_action='PUBLISH' then update public.ranking_workflow_events set published_revision_id=r.id where id=e.id; end if;
   -- A second review request with a new key remains a no-op for decisions and mail.
   if p_action<>'APPROVE_DS' or not exists(select 1 from public.ranking_workflow_decisions
       where revision_id=r.id and actor_id=p_actor and action='APPROVE_DS' and fingerprint=r.fingerprint) then
   insert into public.ranking_workflow_decisions(revision_id,actor_id,actor_name,actor_role,action,comment,fingerprint)
   values(r.id,p_actor,actor_name,actor_role,p_action,reason,r.fingerprint) returning id into decision_id;
   if p_action in ('SUBMIT','REQUEST_CORRECTION') or (p_action='APPROVE_DS' and r.status not in ('READY_TO_PUBLISH','PUBLISHED')) then
     recipient:=case when p_action='SUBMIT' then r.director_id else admin_id end;
     insert into public.ranking_notification_outbox(decision_id,recipient_id,event_id,template,payload)
     values(decision_id,recipient,e.id,p_action,jsonb_build_object('title',r.snapshot->'metadata'->>'title','date',r.snapshot->'metadata'->>'event_date','organizer',r.snapshot->'metadata'->>'organizer','kind',r.snapshot->'metadata'->>'kind','version',r.number,'actor',actor_name,'at',now()));
   end if;
   end if;
 else raise exception 'UNKNOWN_ACTION'; end if;
 select jsonb_build_object('revision_id',current_revision_id,'published_revision_id',published_revision_id,'status',target_status) into after_value from public.ranking_workflow_events where id=e.id;
 result:=after_value||jsonb_build_object('event_id',e.id,'action',p_action,'job_id',case when p_action='IMPORT' then new_id end);
 insert into public.ranking_workflow_audit(event_id,revision_id,actor_id,action,reason,before_state,after_state,idempotency_key,request_fingerprint,response)
 values(e.id,case when p_action in ('CREATE','SAVE','ANALYZE') then new_id else r.id end,p_actor,p_action,reason,before_value,after_value,p_key,request_hash,result);
 return result;
end $$;
revoke all on function public.ranking_workflow_command(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ranking_workflow_command(uuid,text,uuid,uuid,text,jsonb) to service_role;
commit;
