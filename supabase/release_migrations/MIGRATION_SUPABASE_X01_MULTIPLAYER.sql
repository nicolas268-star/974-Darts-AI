-- 974 Darts AI - V18.3.1 (migration introduite en V18.3.0)
-- Migration appliquee en production via Supabase : extend_live_x01_multiplayer_v1
-- Trace uniquement : NE PAS reexecuter manuellement sur la production actuelle.

alter table public.live_games
  add column if not exists play_format text not null default 'DUEL';

alter table public.live_game_players
  add column if not exists side smallint;

update public.live_game_players
set side = least(greatest(seat, 1), 4)
where side is null;

alter table public.live_game_players
  alter column side set not null;

create index if not exists live_game_players_game_side_idx
  on public.live_game_players(game_id, side);

alter table public.live_legs
  add column if not exists winner_side smallint;

-- Les contraintes CHECK ont egalement ete ajoutees en production :
-- play_format in SOLO, DUEL, THREE, FOUR, TEAMS_2V2
-- side entre 1 et 4
-- winner_side null ou entre 1 et 4
