
-- 974 Darts AI Web v0.5
-- À exécuter dans l'éditeur SQL Supabase.

create extension if not exists "pgcrypto";

create type public.app_role as enum ('VISITOR','PLAYER','CAPTAIN','ADMIN');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  team_id uuid references public.teams(id) on delete set null,
  public_profile boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'PLAYER',
  player_id uuid unique references public.players(id) on delete set null,
  captain_team_id uuid references public.teams(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  code text not null,
  played_on date,
  published boolean not null default false,
  unique(season_id, code)
);

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  average_3_darts numeric(7,2),
  first_9 numeric(7,2),
  best_finish integer,
  elo integer,
  scoring_index numeric(6,2),
  finishing_index numeric(6,2),
  consistency_index numeric(6,2),
  form_index numeric(6,2),
  efficiency_index numeric(6,2),
  confidence_score numeric(6,2),
  global_score numeric(6,2),
  archetype text,
  summary text,
  updated_at timestamptz not null default now(),
  unique(player_id, season_id)
);

create table public.player_daily_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  average_3_darts numeric(7,2),
  first_9 numeric(7,2),
  best_finish integer,
  elo_after integer,
  created_at timestamptz not null default now(),
  unique(player_id, round_id)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  filename text not null,
  status text not null default 'UPLOADED',
  rows_count integer,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.data_anomalies (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports(id) on delete cascade,
  rule_code text not null,
  severity text not null,
  source_row integer,
  field_name text,
  observed_value text,
  status text not null default 'NEW',
  validated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.rounds enable row level security;
alter table public.player_profiles enable row level security;
alter table public.player_daily_stats enable row level security;
alter table public.imports enable row level security;
alter table public.data_anomalies enable row level security;

-- Données publiques autorisées.
create policy "public read clubs"
on public.clubs for select using (true);

create policy "public read teams"
on public.teams for select using (true);

create policy "public read public players"
on public.players for select
using (public_profile = true or auth.uid() is not null);

create policy "public read published seasons"
on public.seasons for select using (true);

create policy "public read published rounds"
on public.rounds for select using (published = true or auth.uid() is not null);

-- Un utilisateur lit son propre profil de compte.
create policy "users read own profile"
on public.profiles for select
using (user_id = auth.uid());

-- Un joueur lit son propre profil statistique.
create policy "players read own statistics"
on public.player_profiles for select
using (
  player_id in (
    select player_id from public.profiles where user_id = auth.uid()
  )
);

create policy "players read own daily statistics"
on public.player_daily_stats for select
using (
  player_id in (
    select player_id from public.profiles where user_id = auth.uid()
  )
);

-- Les profils publics peuvent être consultés sans révéler les comptes utilisateurs.
create policy "public read allowed player profiles"
on public.player_profiles for select
using (
  player_id in (select id from public.players where public_profile = true)
);

create policy "public read allowed daily stats"
on public.player_daily_stats for select
using (
  player_id in (select id from public.players where public_profile = true)
);

-- Les capitaines voient les données de leur équipe.
create policy "captains read team profiles"
on public.player_profiles for select
using (
  player_id in (
    select p.id
    from public.players p
    join public.profiles pr on pr.captain_team_id = p.team_id
    where pr.user_id = auth.uid() and pr.role in ('CAPTAIN','ADMIN')
  )
);

create policy "captains read team daily stats"
on public.player_daily_stats for select
using (
  team_id in (
    select captain_team_id from public.profiles
    where user_id = auth.uid() and role in ('CAPTAIN','ADMIN')
  )
);

-- Les imports et anomalies sont réservés aux administrateurs.
create policy "admins manage imports"
on public.imports for all
using (
  exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN')
)
with check (
  exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN')
);

create policy "admins manage anomalies"
on public.data_anomalies for all
using (
  exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN')
)
with check (
  exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN')
);

-- Création automatique d'un profil à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
