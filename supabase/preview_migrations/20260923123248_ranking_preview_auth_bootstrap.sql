-- PREVIEW ONLY: yndxyiaclzcfyqrxdxdo, never the production migration directory.
-- The existing preview has the registry and T5, but no Auth accounts or profiles.
-- Refuse any database that already has authentication/profile application data.
begin;
do $$
begin
  if to_regclass('public.profiles') is not null
     or to_regtype('public.app_role') is not null
     or exists(select 1 from auth.users)
     or to_regclass('public.committee_licensed_players') is null
     or to_regclass('public.committee_ranking_results') is null then
    raise exception 'PREVIEW_BOOTSTRAP_PRECONDITION_FAILED';
  end if;
end $$;

create type public.app_role as enum ('VISITOR','PLAYER','CAPTAIN','ADMIN');
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'VISITOR',
  display_name text,
  player_id uuid references public.players(id),
  captain_team_id uuid references public.teams(id),
  created_at timestamptz not null default now()
);
create index profiles_player_id_idx on public.profiles(player_id);
create index profiles_captain_team_id_idx on public.profiles(captain_team_id);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;
create policy "preview profiles read own" on public.profiles
  for select to authenticated using ((select auth.uid())=user_id);
create policy "preview profiles update own name" on public.profiles
  for update to authenticated using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
-- Profiles and roles are provisioned explicitly after creating a test account
-- through Supabase Auth. No trigger, account, invitation or email is created here.
commit;
