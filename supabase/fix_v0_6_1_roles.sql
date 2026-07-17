
-- 974 Darts AI Web v0.6.1
-- Correctif définitif des rôles et des politiques RLS récursives.
-- À exécuter UNE FOIS dans Supabase SQL Editor.

begin;

-- Les anciennes politiques administrateur lisaient public.profiles
-- depuis une politique appliquée à public.profiles : cela peut provoquer
-- une récursion RLS et empêcher l'application de lire le rôle.
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "users update own display name" on public.profiles;

-- Fonctions SECURITY DEFINER : elles lisent le profil courant sans
-- réévaluer récursivement les politiques RLS de la table profiles.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select role
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_captain_team_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select captain_team_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_captain_team_id() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_captain_team_id() to authenticated;

-- Lecture de son propre profil, ou de tous les profils pour un administrateur.
drop policy if exists "users read own profile" on public.profiles;
create policy "profiles read own or admin"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_app_role() = 'ADMIN'::public.app_role
);

-- Un utilisateur peut modifier uniquement son nom d'affichage.
create policy "profiles update own display name"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and role = public.current_app_role()
);

-- Un administrateur peut mettre à jour tous les profils.
create policy "profiles admin update"
on public.profiles
for update
to authenticated
using (public.current_app_role() = 'ADMIN'::public.app_role)
with check (public.current_app_role() = 'ADMIN'::public.app_role);

-- Remplacement des politiques capitaine potentiellement récursives.
drop policy if exists "captains read team profiles" on public.player_profiles;
create policy "captains read team profiles"
on public.player_profiles
for select
to authenticated
using (
  public.current_app_role() = 'ADMIN'::public.app_role
  or player_id in (
    select p.id
    from public.players p
    where p.team_id = public.current_captain_team_id()
  )
);

drop policy if exists "captains read team daily stats" on public.player_daily_stats;
create policy "captains read team daily stats"
on public.player_daily_stats
for select
to authenticated
using (
  public.current_app_role() = 'ADMIN'::public.app_role
  or team_id = public.current_captain_team_id()
);

-- Imports et anomalies : fonctions non récursives.
drop policy if exists "admins manage imports" on public.imports;
create policy "admins manage imports"
on public.imports
for all
to authenticated
using (public.current_app_role() = 'ADMIN'::public.app_role)
with check (public.current_app_role() = 'ADMIN'::public.app_role);

drop policy if exists "admins manage anomalies" on public.data_anomalies;
create policy "admins manage anomalies"
on public.data_anomalies
for all
to authenticated
using (public.current_app_role() = 'ADMIN'::public.app_role)
with check (public.current_app_role() = 'ADMIN'::public.app_role);

commit;

-- Vérification : doit retourner ton email, ton nom et ADMIN.
select
  u.email,
  p.display_name,
  p.role,
  public.current_app_role() as role_via_function
from auth.users u
join public.profiles p on p.user_id = u.id
where lower(u.email) = lower('nicolasdupont268@gmail.com');
