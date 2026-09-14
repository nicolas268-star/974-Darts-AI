-- Barème interclubs 2026-2027 : victoire 4, nul 2, défaite 1, forfait 0.
-- Le champ explicite évite de confondre un forfait avec une défaite sportive 0-20.

alter table public.championship_results
  add column if not exists forfeit_team_id uuid null
  references public.teams(id) on delete set null;

create index if not exists championship_results_forfeit_team_idx
  on public.championship_results(forfeit_team_id)
  where forfeit_team_id is not null;
