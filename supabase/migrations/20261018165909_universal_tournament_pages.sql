-- Additive public-page projection; official sporting tables are never written here.
begin;
create table public.tournament_pages (
 id uuid primary key default gen_random_uuid(),
 source_id text not null,
 discipline text not null check (discipline in ('SINGLE','DOUBLE')),
 code text not null unique check (code ~ '^[a-z0-9_-]{1,120}$'),
 event_id text unique references public.ranking_workflow_events(id),
 official_revision_id uuid references public.ranking_workflow_revisions(id),
 source_hash text not null,
 payload jsonb not null check (jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now(),
 unique(source_id,discipline),
 check ((event_id is null) = (official_revision_id is null))
);
create table public.tournament_page_revisions (
 id bigint generated always as identity primary key,
 page_id uuid not null references public.tournament_pages(id),
 source_hash text not null,
 official_revision_id uuid references public.ranking_workflow_revisions(id),
 payload jsonb not null,
 actor_id uuid,
 created_at timestamptz not null default now()
);
create index on public.tournament_page_revisions(page_id,created_at);
create trigger tournament_page_revision_seal before update or delete on public.tournament_page_revisions
 for each row execute function public.ranking_reject_mutation();

create table public.tournament_page_previews (
 id uuid primary key,
 source_id text not null,
 discipline text not null check (discipline in ('SINGLE','DOUBLE')),
 actor_id uuid not null,
 code text not null,
 payload jsonb not null,
 baseline_hash text,
 official_revision_id uuid references public.ranking_workflow_revisions(id),
 can_apply boolean not null,
 created_at timestamptz not null default now()
);
create index on public.tournament_page_previews(created_at);
create table public.tournament_page_jobs (
 id uuid primary key default gen_random_uuid(),
 event_id text not null unique references public.ranking_workflow_events(id),
 state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','FAILED','SUCCEEDED')),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 error text,
 updated_at timestamptz not null default now()
);

create function public.tournament_page_enqueue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.published_revision_id is not null and
    (tg_op='INSERT' or new.published_revision_id is distinct from old.published_revision_id) then
   insert into public.tournament_page_jobs(event_id) values(new.id)
   on conflict(event_id) do update set state='QUEUED',attempts=0,lease_id=null,lease_until=null,error=null,updated_at=now();
 end if;
 return new;
end $$;
create trigger tournament_page_publication after insert or update of published_revision_id
 on public.ranking_workflow_events for each row execute function public.tournament_page_enqueue();

-- Recover OC1 and any other already-published event without touching its points.
insert into public.tournament_page_jobs(event_id)
 select id from public.ranking_workflow_events where published_revision_id is not null;

create function public.tournament_page_claim() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job public.tournament_page_jobs%rowtype;
begin
 select * into job from public.tournament_page_jobs
 where state='QUEUED' or (state='RUNNING' and lease_until<now())
 order by updated_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.tournament_page_jobs set state='RUNNING',attempts=attempts+1,
 lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 where id=job.id returning * into job;
 return to_jsonb(job);
end $$;

create function public.tournament_page_commit(
 p_source_id text,p_discipline text,p_code text,p_payload jsonb,p_hash text,
 p_expected_hash text default null,p_event_id text default null,
 p_revision_id uuid default null,p_actor uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare page public.tournament_pages%rowtype; official public.ranking_workflow_events%rowtype;
begin
 if p_source_id is null or p_hash is null or p_payload->>'source_tournament_id' is distinct from p_source_id
    or p_discipline not in ('SINGLE','DOUBLE') then raise exception 'INVALID_PAGE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source_id||':'||p_discipline,0));
 select * into official from public.ranking_workflow_events
  where source_id=p_source_id and discipline=p_discipline for share;
 if found then
   if official.id is distinct from p_event_id or official.published_revision_id is null
      or official.published_revision_id is distinct from p_revision_id then
     raise exception 'OFFICIAL_WORKFLOW_REQUIRED';
   end if;
 elsif p_event_id is not null or p_revision_id is not null then
   raise exception 'INVALID_OFFICIAL_ASSOCIATION';
 elsif p_payload->>'classification' is distinct from 'FRIENDLY'
       or coalesce((p_payload->>'affects_committee_ranking')::boolean,false)
       or jsonb_array_length(coalesce(p_payload->'official_results','[]'::jsonb))>0 then
   raise exception 'FRIENDLY_POINTS_FORBIDDEN';
 end if;
 select * into page from public.tournament_pages where source_id=p_source_id and discipline=p_discipline for update;
 -- Replay is idempotent, even if the client retried after its response was lost.
 if found and page.source_hash=p_hash and page.official_revision_id is not distinct from p_revision_id then
   return to_jsonb(page);
 end if;
 if p_expected_hash is not null and p_expected_hash is distinct from coalesce(page.source_hash,'ABSENT') then
   raise exception 'STALE_TOURNAMENT_PAGE';
 end if;
 if page.id is null then
   insert into public.tournament_pages(source_id,discipline,code,event_id,official_revision_id,source_hash,payload)
    values(p_source_id,p_discipline,p_code,p_event_id,p_revision_id,p_hash,p_payload) returning * into page;
 else
   -- An event's public URL is immutable, including promotion from friendly to official.
   update public.tournament_pages set event_id=p_event_id,official_revision_id=p_revision_id,
    source_hash=p_hash,payload=jsonb_set(p_payload,'{code}',to_jsonb(page.code)),updated_at=now()
    where id=page.id returning * into page;
 end if;
 insert into public.tournament_page_revisions(page_id,source_hash,official_revision_id,payload,actor_id)
 values(page.id,page.source_hash,page.official_revision_id,page.payload,p_actor);
 return to_jsonb(page);
end $$;

-- All access is through the backend's public allowlisted projection or Admin API.
alter table public.tournament_pages enable row level security;
alter table public.tournament_page_revisions enable row level security;
alter table public.tournament_page_previews enable row level security;
alter table public.tournament_page_jobs enable row level security;
revoke all on public.tournament_pages,public.tournament_page_revisions,public.tournament_page_previews,public.tournament_page_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.tournament_pages,public.tournament_page_previews,public.tournament_page_jobs to service_role;
grant select,insert on public.tournament_page_revisions to service_role;
grant usage,select on sequence public.tournament_page_revisions_id_seq to service_role;
revoke execute on function public.tournament_page_enqueue(),public.tournament_page_claim(),
 public.tournament_page_commit(text,text,text,jsonb,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tournament_page_enqueue(),public.tournament_page_claim(),
 public.tournament_page_commit(text,text,text,jsonb,text,text,text,uuid,uuid) to service_role;
commit;
