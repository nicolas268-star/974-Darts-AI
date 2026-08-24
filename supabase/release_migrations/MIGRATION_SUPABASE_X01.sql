-- 974 Darts AI - X01 Live
-- Trace des migrations appliquees en production le 22/08/2026.
-- Ne pas reexecuter manuellement sur la production actuelle : elles sont deja appliquees.

-- Migration 20260822173900 : add_live_x01_game_engine_v1
create table if not exists public.live_games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  game_type text not null default 'X01' check (game_type in ('X01')),
  starting_score integer not null default 501 check (starting_score between 2 and 5001),
  in_rule text not null default 'STRAIGHT_IN' check (in_rule in ('STRAIGHT_IN','DOUBLE_IN')),
  out_rule text not null default 'DOUBLE_OUT' check (out_rule in ('STRAIGHT_OUT','DOUBLE_OUT')),
  input_mode text not null default 'QUICK_SCORE' check (input_mode in ('QUICK_SCORE','DART_BY_DART')),
  best_of_legs integer not null default 3 check (best_of_legs > 0 and best_of_legs <= 99 and mod(best_of_legs,2)=1),
  best_of_sets integer not null default 1 check (best_of_sets > 0 and best_of_sets <= 31 and mod(best_of_sets,2)=1),
  status text not null default 'SETUP' check (status in ('SETUP','IN_PROGRESS','COMPLETED','CANCELLED')),
  current_leg_number integer not null default 1 check (current_leg_number > 0),
  current_turn integer not null default 1 check (current_turn > 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.live_games(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  seat smallint not null check (seat between 1 and 8),
  legs_won integer not null default 0 check (legs_won >= 0),
  sets_won integer not null default 0 check (sets_won >= 0),
  created_at timestamptz not null default now(),
  unique (game_id, seat)
);

create table if not exists public.live_legs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.live_games(id) on delete cascade,
  leg_number integer not null check (leg_number > 0),
  set_number integer not null default 1 check (set_number > 0),
  starting_game_player_id uuid references public.live_game_players(id) on delete set null,
  winner_game_player_id uuid references public.live_game_players(id) on delete set null,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','COMPLETED','CANCELLED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, set_number, leg_number)
);

create table if not exists public.live_visits (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references public.live_legs(id) on delete cascade,
  game_player_id uuid not null references public.live_game_players(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  score_before integer not null check (score_before >= 0),
  score_scored integer not null default 0 check (score_scored between 0 and 180),
  score_after integer not null check (score_after >= 0),
  darts_thrown smallint not null default 3 check (darts_thrown between 0 and 3),
  input_mode text not null check (input_mode in ('QUICK_SCORE','DART_BY_DART')),
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  created_at timestamptz not null default now(),
  unique (leg_id, turn_number)
);

create table if not exists public.live_throws (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.live_visits(id) on delete cascade,
  dart_number smallint not null check (dart_number between 1 and 3),
  segment smallint not null check (segment between 0 and 25 and segment not in (21,22,23,24)),
  multiplier smallint not null check (multiplier between 0 and 3),
  score integer not null check (score between 0 and 60),
  is_double boolean not null default false,
  is_bull boolean not null default false,
  is_miss boolean not null default false,
  created_at timestamptz not null default now(),
  unique (visit_id, dart_number),
  check (
    (is_miss = true and segment = 0 and multiplier = 0 and score = 0)
    or (is_miss = false and segment between 1 and 20 and multiplier between 1 and 3 and score = segment * multiplier)
    or (is_miss = false and segment = 25 and multiplier in (1,2) and score = 25 * multiplier)
  ),
  check (is_double = (multiplier = 2)),
  check (is_bull = (segment = 25))
);

create index if not exists live_games_created_by_idx on public.live_games(created_by, created_at desc);
create index if not exists live_game_players_game_idx on public.live_game_players(game_id);
create index if not exists live_game_players_player_idx on public.live_game_players(player_id) where player_id is not null;
create index if not exists live_legs_game_idx on public.live_legs(game_id, set_number, leg_number);
create index if not exists live_visits_leg_idx on public.live_visits(leg_id, turn_number);
create index if not exists live_visits_player_idx on public.live_visits(game_player_id);
create index if not exists live_throws_visit_idx on public.live_throws(visit_id, dart_number);

alter table public.live_games enable row level security;
alter table public.live_game_players enable row level security;
alter table public.live_legs enable row level security;
alter table public.live_visits enable row level security;
alter table public.live_throws enable row level security;

-- Les politiques exactes sont deja presentes en production.
-- Voir Supabase > Database > Policies pour audit.

-- Migration 20260822174207 : extend_live_x01_visit_state_v1
alter table public.live_visits
  add column if not exists opens_scoring boolean not null default false,
  add column if not exists checkout_verified boolean not null default false,
  add column if not exists attempted_score integer;
