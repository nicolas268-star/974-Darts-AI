-- Test-only Supabase shape. Fictitious actors; never run against a shared database.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create type public.app_role as enum('VISITOR','PLAYER','CAPTAIN','ADMIN');
create table public.profiles(user_id uuid primary key,role public.app_role not null,display_name text);
insert into public.profiles values('00000000-0000-0000-0000-000000000001','ADMIN','Admin test'),('00000000-0000-0000-0000-000000000002','PLAYER','DS test'),('00000000-0000-0000-0000-000000000003','PLAYER','Joueur test'),('00000000-0000-0000-0000-000000000004','PLAYER','Autre DS');
grant select on public.profiles to service_role;

create table public.player_identities(id uuid primary key,canonical_display_name text,status text);
