-- 974 Darts AI v0.10.0 — Sprint 4
-- Règles configurables par saison. Barème actuel : victoire 3, nul 2, défaite 1.
begin;
create table if not exists public.competition_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references public.seasons(id) on delete cascade,
  win_points integer not null default 3 check (win_points >= 0),
  draw_points integer not null default 2 check (draw_points >= 0),
  loss_points integer not null default 1 check (loss_points >= 0),
  ranking_order jsonb not null default '["points","leg_difference","legs_won","wins","name"]'::jsonb,
  best_of integer,
  legs_per_match integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.competition_rules enable row level security;
drop policy if exists "public read competition rules" on public.competition_rules;
create policy "public read competition rules" on public.competition_rules for select using (true);
drop policy if exists "admins manage competition rules" on public.competition_rules;
create policy "admins manage competition rules" on public.competition_rules for all
using (exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN'))
with check (exists(select 1 from public.profiles where user_id=auth.uid() and role='ADMIN'));
insert into public.competition_rules (season_id, win_points, draw_points, loss_points)
select id, 3, 2, 1 from public.seasons
on conflict (season_id) do nothing;
commit;
