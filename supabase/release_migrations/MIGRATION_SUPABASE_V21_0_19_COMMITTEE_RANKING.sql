-- Publication contrôlée du classement individuel Comité 974.

begin;

create table if not exists public.committee_ranking_events (
  id text primary key,
  tournament_code text not null,
  season_key text not null,
  title text not null,
  event_date date not null,
  ranking_category text not null check (ranking_category in ('C', 'D', 'E')),
  ranking_kind text not null check (ranking_kind in ('COMMITTEE_OPEN', 'COMMITTEE_CUP', 'CLUB_SINGLE', 'CLUB_DOUBLE')),
  source_url text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'VALIDATED', 'PUBLISHED')),
  validated_by uuid,
  validated_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.committee_ranking_results (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.committee_ranking_events(id) on delete cascade,
  player_name text not null,
  club text,
  gender text not null default 'X' check (gender in ('M', 'F', 'X')),
  placement text not null check (placement in ('WINNER', 'RUNNER_UP', 'SEMI_FINALIST', 'QUARTER_FINALIST', 'ROUND_OF_16')),
  points integer not null check (points >= 0),
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  unique (event_id, player_name)
);

create index if not exists committee_ranking_results_event_idx
  on public.committee_ranking_results(event_id, display_order);

alter table public.committee_ranking_events enable row level security;
alter table public.committee_ranking_results enable row level security;

revoke all on table public.committee_ranking_events from anon, authenticated;
revoke all on table public.committee_ranking_results from anon, authenticated;
grant select on table public.committee_ranking_events to anon, authenticated;
grant select on table public.committee_ranking_results to anon, authenticated;
grant select, insert, update, delete on table public.committee_ranking_events to service_role;
grant select, insert, update, delete on table public.committee_ranking_results to service_role;

drop policy if exists "Public reads published committee events" on public.committee_ranking_events;
create policy "Public reads published committee events"
  on public.committee_ranking_events for select
  to anon, authenticated
  using (status = 'PUBLISHED');

drop policy if exists "Public reads results of published committee events" on public.committee_ranking_results;
create policy "Public reads results of published committee events"
  on public.committee_ranking_results for select
  to anon, authenticated
  using (exists (
    select 1 from public.committee_ranking_events event
    where event.id = event_id and event.status = 'PUBLISHED'
  ));

commit;
