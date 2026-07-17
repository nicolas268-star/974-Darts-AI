
-- 974 Darts AI Web v0.8 — Sprint 3.1 Publication
-- Exécuter après les migrations précédentes.

begin;

alter table public.imports
  add column if not exists file_sha256 text,
  add column if not exists analysis_json jsonb,
  add column if not exists published_at timestamptz;

create unique index if not exists imports_file_sha256_key
on public.imports(file_sha256)
where file_sha256 is not null;

create unique index if not exists players_display_name_team_id_key
on public.players(display_name, team_id);

create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  natural_key text not null unique,
  name text not null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  import_id uuid references public.imports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  natural_key text not null unique,
  match_number integer,
  nakka_match_number integer,
  mode text,
  team_1_id uuid references public.teams(id) on delete set null,
  team_2_id uuid references public.teams(id) on delete set null,
  winner_team_id uuid references public.teams(id) on delete set null,
  import_id uuid references public.imports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.legs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  natural_key text not null unique,
  leg_number integer,
  winner_team_id uuid references public.teams(id) on delete set null,
  status text not null default 'VALID',
  import_id uuid references public.imports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.player_leg_stats (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references public.legs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  score integer,
  darts_thrown integer,
  average_3_darts numeric(8,3),
  first_9 numeric(8,3),
  finish integer,
  scores_180 integer not null default 0,
  scores_170 integer not null default 0,
  scores_140 integer not null default 0,
  scores_100 integer not null default 0,
  scores_80 integer not null default 0,
  no_score integer not null default 0,
  leg_won boolean not null default false,
  import_id uuid references public.imports(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(leg_id, player_id)
);

alter table public.encounters enable row level security;
alter table public.matches enable row level security;
alter table public.legs enable row level security;
alter table public.player_leg_stats enable row level security;

drop policy if exists "published encounters readable" on public.encounters;
create policy "published encounters readable"
on public.encounters for select
using (true);

drop policy if exists "published matches readable" on public.matches;
create policy "published matches readable"
on public.matches for select
using (true);

drop policy if exists "published legs readable" on public.legs;
create policy "published legs readable"
on public.legs for select
using (true);

drop policy if exists "public player leg stats readable" on public.player_leg_stats;
create policy "public player leg stats readable"
on public.player_leg_stats for select
using (
  player_id in (
    select id from public.players where public_profile = true
  )
  or player_id in (
    select player_id from public.profiles where user_id = auth.uid()
  )
  or public.current_app_role() in ('CAPTAIN','ADMIN')
);

commit;
