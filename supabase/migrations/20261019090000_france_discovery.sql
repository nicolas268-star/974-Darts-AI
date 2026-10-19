-- Isolated national inventory. No references, triggers or writes to sporting tables.
begin;

create table public.france_committees (
 id text primary key,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 check(payload->>'id'=id),
 check(coalesce(payload->>'organism_type','') in ('COMMITTEE','REGIONAL_LEAGUE','FEDERATION','CLUB','INDEPENDENT','UNKNOWN')),
 check(coalesce(payload->>'verification_status','') in ('VERIFIED','REVIEW_REQUIRED','REJECTED','UNASSIGNED'))
);
create index france_committee_name on public.france_committees ((payload->>'normalized_name'));
create index france_committee_region on public.france_committees ((payload->>'region'));
create index france_committee_aliases on public.france_committees using gin ((payload->'aliases'));

create table public.france_leagues (
 id text primary key check(id ~ '^lg_[A-Za-z0-9_]+$'),
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create index france_league_committee on public.france_leagues ((payload->>'committee_id'));

create table public.france_competitions (
 id text primary key check(id ~ '^t_[A-Za-z0-9_]+$'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 committee_id text generated always as (payload->>'committee_id') stored references public.france_committees(id),
 check(payload->>'n01_id'=id),
 check(coalesce(payload->>'verification_status','') in ('VERIFIED','REVIEW_REQUIRED','REJECTED','UNASSIGNED')),
 check((payload->>'verification_status'='VERIFIED')=(committee_id is not null))
);
create index france_competition_directory on public.france_competitions (committee_id,(payload->>'season'),(payload->>'competition_date') desc);
create index france_competition_review on public.france_competitions ((payload->>'verification_status'));
create index france_competition_league on public.france_competitions ((payload->>'lgid'));

-- Public metadata is deliberately separate from raw API envelopes and audit evidence.
create table public.france_sources (
 id text primary key references public.france_competitions(id),
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create table public.france_candidates (
 id text primary key,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 competition_id text generated always as (payload->>'n01_id') stored references public.france_competitions(id),
 committee_id text generated always as (payload->>'committee_id') stored references public.france_committees(id),
 unique(competition_id,committee_id),
 check(coalesce(payload->>'status','') in ('VERIFIED','REVIEW_REQUIRED','REJECTED','UNASSIGNED'))
);
create index france_candidate_review on public.france_candidates ((payload->>'status'),committee_id);
create table public.france_runs (
 id text primary key,
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create index france_runs_date on public.france_runs ((payload->>'started_at') desc);
create table public.france_history (
 id text primary key default gen_random_uuid()::text,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now()
);
create index france_history_competition on public.france_history ((payload->'payload'->>'n01_id'),created_at desc);

create function public.france_history_seal() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'FRANCE_IMMUTABLE_HISTORY'; end $$;
create trigger france_history_immutable before update or delete on public.france_history
 for each row execute function public.france_history_seal();

create function public.france_require_evidence(p jsonb,target text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p is null or p->>'target' is distinct from target
    or coalesce(p->>'url','') !~ '^https://[^/@[:space:]]+(/|$)'
    or coalesce(p->>'kind','') not in ('OFFICIAL_DIRECTORY','OFFICIAL_LINK','ORGANIZER_CONFIRMATION','OFFICIAL_RESULT')
    or length(trim(coalesce(p->>'justification','')))=0
    or nullif(p->>'checked_at','') is null then
   raise exception 'FRANCE_EVIDENCE_REQUIRED';
 end if;
 perform (p->>'checked_at')::timestamptz;
end $$;

create function public.france_inventory_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 p jsonb := p_payload; old jsonb; rec jsonb; src jsonb; c jsonb;
 k text; changed boolean; audit boolean := false; overrides jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'FRANCE_INVALID_PAYLOAD'; end if;
 k := coalesce(p->>'n01_id',p->'record'->>'n01_id',p->>'id');
 -- Serialize commands about one competition, including competing manual decisions.
 perform pg_advisory_xact_lock(hashtextextended('france:'||coalesce(k,''),0));
 if p_action='committee' then
   if nullif(p->>'id','') is null or nullif(p->>'name','') is null then raise exception 'FRANCE_INVALID_ORGANISM'; end if;
   if p->>'verification_status'='VERIFIED' then
     if p->>'organism_type' not in ('COMMITTEE','REGIONAL_LEAGUE','FEDERATION') then raise exception 'FRANCE_NOT_A_COMMITTEE'; end if;
     perform public.france_require_evidence(p->'evidence',p->>'id');
   end if;
   select payload into old from public.france_committees where id=p->>'id';
   if found then
     if old is distinct from p then raise exception 'FRANCE_MANUAL_ORGANISM_EXISTS'; end if;
     return old;
   end if;
   insert into public.france_committees values(p->>'id',p);
   audit := true;
 elsif p_action='league' then
   select payload into old from public.france_leagues where id=k;
   p := coalesce(old,'{}'::jsonb)||p;
   p := (p - array['committee_id','evidence','verification_status']) ||
        coalesce((select jsonb_object_agg(key,value) from jsonb_each(old)
                  where key in ('committee_id','evidence','verification_status')),
                 (select jsonb_object_agg(key,value) from jsonb_each(p)
                  where key in ('committee_id','evidence','verification_status')), '{}'::jsonb);
   if p->>'verification_status'='VERIFIED' then
     perform public.france_require_evidence(p->'evidence',k);
     if not exists(select 1 from public.france_committees where id=p->>'committee_id' and payload->>'verification_status'='VERIFIED') then
       raise exception 'FRANCE_UNVERIFIED_ORGANISM';
     end if;
   end if;
   insert into public.france_leagues values(k,p) on conflict(id) do update set payload=excluded.payload;
 elsif p_action='observe' then
   src := p->'source'; rec := p->'record';
   if src->>'n01_id' is distinct from k or nullif(src->>'source_hash','') is null
      or jsonb_typeof(src->'raw') is distinct from 'object' then raise exception 'FRANCE_INVALID_SOURCE'; end if;
   select payload into old from public.france_sources where id=k;
   overrides := coalesce(old->'overrides','{}'::jsonb);
   changed := old->>'source_hash' is distinct from src->>'source_hash';
   select payload into c from public.france_competitions where id=k;
   -- Whitelist public metadata: raw results, evidence and API envelopes stay private.
   rec := (select jsonb_object_agg(key,value) from jsonb_each(rec) where key in
     ('n01_id','lgid','title','competition_date','season','competition_type','status','n01_status',
      'participants','formats','source_url','source_updated_at','source_public'));
   rec := rec || overrides || jsonb_build_object('committee_id',c->>'committee_id',
     'verification_status',coalesce(c->>'verification_status','UNASSIGNED'),
     'first_seen_at',coalesce(c->>'first_seen_at',now()::text),'last_synced_at',now()::text);
   insert into public.france_competitions(id,payload) values(k,rec) on conflict(id) do update set payload=excluded.payload;
   src := src || jsonb_build_object('overrides',overrides);
   insert into public.france_sources values(k,src) on conflict(id) do update set payload=excluded.payload;
   if changed then
     insert into public.france_history(payload) values(jsonb_build_object('action','observe','at',now(),
       'payload',jsonb_build_object('n01_id',k,'previous_hash',old->>'source_hash','source_hash',src->>'source_hash','record',rec,'source',src)));
   end if;
   return jsonb_build_object('changed',changed);
 elsif p_action='withdraw' then
   update public.france_competitions set payload=payload||jsonb_build_object('source_public',false,'last_synced_at',now()::text) where id=k;
   audit := found;
 elsif p_action='suggest' then
   k := (p->>'n01_id')||':'||(p->>'committee_id');
   p := p||jsonb_build_object('id',k,'status','REVIEW_REQUIRED','discovered_at',now()::text);
   insert into public.france_candidates(id,payload) values(k,p) on conflict(id) do nothing;
 elsif p_action='decide' then
   select payload into rec from public.france_competitions where id=k;
   select payload into c from public.france_committees where id=p->>'committee_id';
   if rec is null or c is null or coalesce(p->>'status','') not in ('VERIFIED','REVIEW_REQUIRED','REJECTED','UNASSIGNED')
      or length(trim(coalesce(p->>'actor','')))=0 or length(trim(coalesce(p->>'reason','')))=0 then
     raise exception 'FRANCE_INVALID_DECISION';
   end if;
   if p->>'status'='VERIFIED' then
     if c->>'verification_status' is distinct from 'VERIFIED' then raise exception 'FRANCE_UNVERIFIED_ORGANISM'; end if;
     perform public.france_require_evidence(p->'evidence',k);
     if rec->>'committee_id' is not null and rec->>'committee_id'<>p->>'committee_id' then raise exception 'FRANCE_CONFLICTING_COMMITTEE'; end if;
     rec := rec||jsonb_build_object('committee_id',p->>'committee_id','verification_status','VERIFIED');
   elsif rec->>'committee_id' is null or rec->>'committee_id'=p->>'committee_id' then
     rec := rec||jsonb_build_object('committee_id',null,'verification_status',case when p->>'status'='REVIEW_REQUIRED' then 'REVIEW_REQUIRED' else 'UNASSIGNED' end);
   end if;
   update public.france_competitions set payload=rec where id=k;
   k := k||':'||(p->>'committee_id');
   p := p||jsonb_build_object('id',k,'decided_at',now()::text);
   insert into public.france_candidates(id,payload) values(k,p) on conflict(id) do update set payload=excluded.payload;
   audit := true;
 elsif p_action='correct' then
   overrides := p->'overrides';
   if jsonb_typeof(overrides) is distinct from 'object' or overrides='{}'::jsonb
      or length(trim(coalesce(p->>'actor','')))=0 or length(trim(coalesce(p->>'reason','')))=0
      or exists(select 1 from jsonb_object_keys(overrides) as f where f not in
         ('title','competition_date','season','competition_type','status','participants','formats')) then
     raise exception 'FRANCE_INVALID_CORRECTION';
   end if;
   update public.france_sources set payload=jsonb_set(payload,'{overrides}',coalesce(payload->'overrides','{}'::jsonb)||overrides) where id=k;
   if not found then raise exception 'FRANCE_UNKNOWN_COMPETITION'; end if;
   update public.france_competitions set payload=payload||overrides where id=k;
   audit := true;
 elsif p_action='correct_committee' then
   overrides := p->'overrides';
   select payload into old from public.france_committees where id=k;
   if old is null or jsonb_typeof(overrides) is distinct from 'object' or overrides='{}'::jsonb
      or length(trim(coalesce(p->>'actor','')))=0 or length(trim(coalesce(p->>'reason','')))=0
      or exists(select 1 from jsonb_object_keys(overrides) as f where f not in
         ('name','normalized_name','aliases','department','region','parent_organization','reference_url','evidence')) then
     raise exception 'FRANCE_INVALID_ORGANISM_CORRECTION';
   end if;
   rec := old||overrides;
   if rec->>'verification_status'='VERIFIED' then
     perform public.france_require_evidence(rec->'evidence',k);
   end if;
   if nullif(trim(rec->>'name'),'') is null then raise exception 'FRANCE_INVALID_ORGANISM'; end if;
   update public.france_committees set payload=rec where id=k;
   audit := true;
 elsif p_action='run' then
   insert into public.france_runs values(k,p) on conflict(id) do update set payload=excluded.payload;
 else raise exception 'FRANCE_UNKNOWN_ACTION';
 end if;
 if audit then
   insert into public.france_history(payload) values(jsonb_build_object('action',p_action,'at',now(),'payload',p));
 end if;
 return p;
end $$;

alter table public.france_committees enable row level security;
alter table public.france_leagues enable row level security;
alter table public.france_competitions enable row level security;
alter table public.france_sources enable row level security;
alter table public.france_candidates enable row level security;
alter table public.france_runs enable row level security;
alter table public.france_history enable row level security;

create policy france_verified_organisms on public.france_committees for select to anon,authenticated
 using(payload->>'verification_status'='VERIFIED' and payload->>'organism_type' in ('COMMITTEE','REGIONAL_LEAGUE','FEDERATION'));
create policy france_verified_competitions on public.france_competitions for select to anon,authenticated
 using(payload->>'verification_status'='VERIFIED' and payload->>'source_public'='true'
   and exists(select 1 from public.france_committees c where c.id=committee_id and c.payload->>'verification_status'='VERIFIED'));

revoke all on public.france_committees,public.france_leagues,public.france_competitions,
 public.france_sources,public.france_candidates,public.france_runs,public.france_history from public,anon,authenticated;
grant select on public.france_committees,public.france_competitions to anon,authenticated;
grant select,insert,update on public.france_committees,public.france_leagues,public.france_competitions,
 public.france_sources,public.france_candidates,public.france_runs to service_role;
grant select,insert on public.france_history to service_role;
revoke all on function public.france_inventory_command(text,jsonb),public.france_require_evidence(jsonb,text),public.france_history_seal() from public,anon,authenticated;
grant execute on function public.france_inventory_command(text,jsonb),public.france_require_evidence(jsonb,text),public.france_history_seal() to service_role;
commit;
