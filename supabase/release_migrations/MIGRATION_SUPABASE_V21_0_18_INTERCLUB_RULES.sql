-- Bascule officielle vers la saison interclubs 2026-2027.
-- À appliquer en même temps que le déploiement applicatif, jamais avant.

begin;

alter table public.competition_rules
  add column if not exists forfeit_points integer not null default 0;

alter table public.championship_results
  add column if not exists forfeit_team_id uuid null
  references public.teams(id) on delete set null;

create index if not exists championship_results_forfeit_team_idx
  on public.championship_results(forfeit_team_id)
  where forfeit_team_id is not null;

do $$
declare
  target_season_id uuid;
begin
  update public.seasons
  set is_active = false
  where name = '2026';

  insert into public.seasons (name, is_active)
  values ('2026-2027', true)
  on conflict (name)
  do update set is_active = excluded.is_active
  returning id into target_season_id;

  update public.competition_rules
  set win_points = 4,
      draw_points = 2,
      loss_points = 1,
      forfeit_points = 0,
      updated_at = now()
  where season_id = target_season_id;

  if not found then
    insert into public.competition_rules (
      season_id,
      win_points,
      draw_points,
      loss_points,
      forfeit_points,
      ranking_order,
      best_of,
      legs_per_match
    )
    values (
      target_season_id,
      4,
      2,
      1,
      0,
      '["points","set_difference","sets_won","wins","name"]'::jsonb,
      null,
      null
    );
  end if;
end
$$;

commit;
