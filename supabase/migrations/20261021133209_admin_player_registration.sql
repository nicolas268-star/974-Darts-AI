-- One transaction creates the canonical identity, season membership and registry.
-- Admin input and licence numbers stay on the server; public rosters are projected by Python.
begin;

create table public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_snapshot jsonb not null,
  identity_id uuid not null references public.player_identities(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  season_key text not null,
  club_code text not null references public.committee_clubs(code) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  display_name text not null,
  first_name text not null,
  last_name text not null,
  nakka_name text not null default '',
  license_number text check (license_number is null or license_number ~ '^[0-9]{8}$'),
  joined_on date not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, identity_id),
  unique (season_id, license_number)
);
create index player_registrations_identity_idx on public.player_registrations(identity_id);
create index player_registrations_team_idx on public.player_registrations(team_id);
create index player_registrations_club_idx on public.player_registrations(club_code);
alter table public.player_registrations enable row level security;
revoke all on public.player_registrations from public, anon, authenticated;
grant select, insert, update on public.player_registrations to service_role;

-- These two canonical rows were introduced after the original club registry.
update public.teams set official_club_code='KAD'
where name in ('Kaz A Darts - A','Kaz A Darts - B') and official_club_code is null;

create function public.register_club_player(p jsonb, actor uuid) returns jsonb
language plpgsql security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  sid uuid := (p->>'season_id')::uuid;
  tid uuid := (p->>'team_id')::uuid;
  iid uuid := nullif(p->>'identity_id','')::uuid;
  pid uuid;
  rid uuid := (p->>'request_id')::uuid;
  first_name text := btrim(p->>'first_name');
  last_name text := upper(btrim(p->>'last_name'));
  display text;
  nickname text := btrim(coalesce(p->>'nakka_name',''));
  licence text := nullif(btrim(p->>'license_number'),'');
  arrival date := (p->>'joined_on')::date;
  club text := p->>'club_code';
  sname text;
  skey text;
  year_end int;
  existing public.player_registrations;
  saved public.player_registrations;
  alias text;
  is_new boolean := iid is null;
begin
  -- Serialise the small admin write path, including exact-name duplicate checks.
  perform pg_advisory_xact_lock(hashtext('974darts.register_club_player'));
  if actor is null or rid is null or sid is null or tid is null or arrival is null
     or first_name is null or first_name='' or length(first_name)>80
     or last_name is null or last_name='' or length(last_name)>80 or length(nickname)>120
     or (licence is not null and licence !~ '^[0-9]{8}$')
     or arrival > (now() at time zone 'Indian/Reunion')::date then
    raise exception 'REG_INVALID';
  end if;
  select * into existing from public.player_registrations where request_id=rid;
  if found then
    if existing.request_snapshot <> p then raise exception 'REG_REQUEST_CONFLICT'; end if;
    select canonical_player_id into pid from public.player_identities where id=existing.identity_id;
    return jsonb_build_object('status','UNCHANGED','player_id',pid,'registration',to_jsonb(existing));
  end if;
  select name into sname from public.seasons where id=sid;
  year_end := substring(sname from '(20[0-9]{2})$')::int;
  if year_end is null or extract(year from arrival) not between year_end-1 and year_end
     or not exists(select 1 from public.committee_clubs where code=club and is_active)
     or not exists(select 1 from public.teams where id=tid and official_club_code=club) then
    raise exception 'REG_INVALID';
  end if;
  skey := (year_end-1)::text || '-' || year_end::text;
  display := first_name || ' ' || last_name;
  if iid is null then
    if exists(select 1 from public.players where public.normalize_player_alias(display_name)=public.normalize_player_alias(display))
       or exists(select 1 from public.committee_licensed_players where normalized_official_name=public.normalize_player_alias(display))
       or exists(select 1 from public.player_aliases where normalized_alias=public.normalize_player_alias(display)) then
      raise exception 'REG_DUPLICATE_PLAYER';
    end if;
    insert into public.players(display_name,public_profile) values(display,true) returning id into pid;
    insert into public.player_identities(canonical_player_id,canonical_display_name,notes)
      values(pid,display,'Inscription administrateur') returning id into iid;
    insert into public.player_identity_events(identity_id,event_type,actor_id,payload)
      values(iid,'IDENTITY_CREATED',actor,jsonb_build_object('source','ADMIN_REGISTRATION'));
  else
    select canonical_player_id,canonical_display_name into pid,display from public.player_identities where id=iid and status='ACTIVE';
    if pid is null then raise exception 'REG_INVALID'; end if;
  end if;
  select * into existing from public.player_registrations where season_id=sid and identity_id=iid;
  if found and existing.team_id <> tid then raise exception 'REG_TEAM_CONFLICT'; end if;
  if exists(select 1 from public.player_team_memberships where identity_id=iid and season_id=sid and team_id<>tid
            and (valid_to is null or valid_to>=arrival)) then raise exception 'REG_TEAM_CONFLICT'; end if;
  if exists(select 1 from public.committee_licensed_players where season_key=skey
            and normalized_official_name=public.normalize_player_alias(display) and identity_id is distinct from iid) then
    raise exception 'REG_DUPLICATE_PLAYER';
  end if;
  if exists(select 1 from public.player_registrations where season_id=sid and license_number=licence and identity_id<>iid) then
    raise exception 'REG_DUPLICATE_LICENSE';
  end if;
  foreach alias in array array[display,nickname] loop
    if alias='' then continue; end if;
    if exists(select 1 from public.player_aliases where normalized_alias=public.normalize_player_alias(alias)
              and identity_id<>iid and confirmed) then raise exception 'REG_ALIAS_CONFLICT'; end if;
    insert into public.player_aliases(identity_id,source_player_id,alias_name,source,confidence,confirmed,created_by)
      values(iid,pid,alias,'MANUAL',100,true,actor) on conflict(identity_id,normalized_alias) do nothing;
  end loop;
  insert into public.player_team_memberships(identity_id,team_id,season_id,valid_from,is_current,source,created_by)
    select iid,tid,sid,arrival,true,'MANUAL',actor
    where not exists(select 1 from public.player_team_memberships where identity_id=iid and team_id=tid and season_id=sid);
  insert into public.committee_licensed_players(season_key,official_last_name,official_first_name,official_display_name,
    official_source_name,normalized_official_name,club_code,identity_id,license_status,source_label)
    values(skey,last_name,first_name,display,last_name||' '||first_name,public.normalize_player_alias(display),club,iid,
           case when licence is null then 'INACTIVE' else 'ACTIVE' end,'Inscription administrateur')
    on conflict(season_key,identity_id) where identity_id is not null do update
    set club_code=excluded.club_code,
        license_status=case when licence is null then committee_licensed_players.license_status else 'ACTIVE' end,
        updated_at=now();
  insert into public.player_registrations(request_id,request_snapshot,identity_id,season_id,season_key,club_code,team_id,
    display_name,first_name,last_name,nakka_name,license_number,joined_on,created_by)
    values(rid,p,iid,sid,skey,club,tid,display,first_name,last_name,nickname,licence,arrival,actor)
    on conflict(season_id,identity_id) do update
    set request_id=excluded.request_id,request_snapshot=excluded.request_snapshot,nakka_name=excluded.nakka_name,
        license_number=excluded.license_number,joined_on=excluded.joined_on,updated_at=now()
    returning * into saved;
  update public.player_team_memberships set valid_from=arrival,updated_at=now()
    where identity_id=iid and team_id=tid and season_id=sid and source='MANUAL' and created_by=actor;
  insert into public.player_identity_events(identity_id,event_type,actor_id,payload)
    values(iid,'MEMBERSHIP_ADDED',actor,jsonb_build_object('source','ADMIN_REGISTRATION','registration_id',saved.id,
      'season_id',sid,'team_id',tid,'joined_on',saved.joined_on));
  return jsonb_build_object('status',case when is_new then 'CREATED' else 'UPDATED' end,
    'player_id',pid,'registration',to_jsonb(saved));
end $$;
revoke all on function public.register_club_player(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.register_club_player(jsonb,uuid) to service_role;
commit;
