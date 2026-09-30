-- Atomic, service-only publication of complete calendar interclub matches.
begin;
alter table public.player_leg_stats add column if not exists first_9_score integer;
alter table public.player_leg_stats add column if not exists first_9_darts integer;
alter table public.championship_results add column if not exists played_on date;

create table public.interclub_auto_publications (
  source_event_id text primary key,
  season_id uuid not null references public.seasons(id),
  result_id uuid not null unique references public.championship_results(id),
  played_on date not null,
  payload_hash text not null,
  payload jsonb not null,
  published_at timestamptz not null default now()
);
create index interclub_auto_publications_season_idx on public.interclub_auto_publications(season_id);
alter table public.interclub_auto_publications enable row level security;
revoke all on public.interclub_auto_publications from public, anon, authenticated;
grant select, insert on public.interclub_auto_publications to service_role;

create or replace function public.publish_interclub_match(p jsonb) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  s uuid; r uuid; imp uuid; enc uuid; result_id uuid; ta uuid; tb uuid; mid uuid; lid uuid;
  event_key text; team_map jsonb; row_data jsonb; existing public.championship_results%rowtype;
  old_hash text; adopted boolean := false; n integer;
begin
  if coalesce(p->>'version','') <> '1' or coalesce(p->>'season','') <> '2026-2027'
     or coalesce(p->>'league_id','') <> 'lg_EUoR_6095'
     or coalesce(p->>'event_id','') !~ '^t_[A-Za-z0-9]+_[0-9]+$'
     or coalesce(p->>'round','') !~ '^J([1-9]|1[0-4])$'
     or coalesce(p->>'source_url','') <> 'https://n01darts.com/n01/league/season.php?id=' || (p->>'event_id')
     or jsonb_array_length(p->'teams') is distinct from 2
     or jsonb_array_length(p->'matches') is distinct from 20
     or coalesce(jsonb_array_length(p->'players'),0) not between 8 and 16
     or coalesce(jsonb_array_length(p->'legs'),0) not between 40 and 60
     or coalesce(jsonb_array_length(p->'stats'),0) not between 96 and 144
     or coalesce((p->'score'->>0)::int,-1) not between 0 and 20
     or coalesce((p->'score'->>1)::int,-1) not between 0 and 20
     or (p->'score'->>0)::int + (p->'score'->>1)::int <> 20
     or (p->>'date')::date is null then
    raise exception 'INVALID_INTERCLUB_PAYLOAD';
  end if;
  if now() < (((p->>'date')::date + time '23:50') at time zone 'Indian/Reunion') then
    raise exception 'INTERCLUB_TOO_EARLY';
  end if;
  select id into strict s from public.seasons where name=p->>'season' and is_active;
  -- One season lock protects cumulative profiles and concurrent games in a round.
  perform pg_advisory_xact_lock(hashtextextended('interclub:' || s::text, 0));
  event_key := (p->>'season') || '|' || (p->>'round') || '|nakka:' || (p->>'event_id');
  select payload_hash into old_hash from public.interclub_auto_publications where source_event_id=p->>'event_id';
  if found and old_hash <> encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise exception 'INTERCLUB_SOURCE_CHANGED'; end if;

  if (select count(distinct x->>'source_id') from jsonb_array_elements(p->'teams') x) <> 2
     or (select count(distinct x->>'name') from jsonb_array_elements(p->'teams') x) <> 2
     or (select count(distinct x->>'id') from jsonb_array_elements(p->'players') x) <> jsonb_array_length(p->'players')
     or (select count(distinct x->>'id') from jsonb_array_elements(p->'matches') x) <> 20
     or (select count(distinct x->>'number') from jsonb_array_elements(p->'matches') x) <> 20
     or (select count(*) from jsonb_array_elements(p->'matches') x where (x->>'number')::int between 1 and 20
         and x->>'mode'=case when (x->>'number')::int in (9,10,19,20) then 'D' else 'S' end) <> 20
     or (select count(distinct x->>'id') from jsonb_array_elements(p->'legs') x) <> jsonb_array_length(p->'legs') then
    raise exception 'INTERCLUB_DUPLICATE_OR_FORMAT';
  end if;
  select count(*) into n from jsonb_array_elements(p->'players') x
    join public.player_identities i on i.id=(x->>'identity_id')::uuid and i.canonical_player_id=(x->>'id')::uuid and i.status='ACTIVE'
    join public.committee_licensed_players c on c.identity_id=i.id and c.season_key=p->>'season' and c.license_status='ACTIVE'
    join jsonb_array_elements(p->'teams') t on t->>'source_id'=x->>'team_id' and t->>'club_code'=c.club_code;
  if n <> jsonb_array_length(p->'players') then raise exception 'INTERCLUB_CANONICAL_IDENTITY_CHANGED'; end if;

  insert into public.teams(name,official_club_code)
    select t->>'name',t->>'club_code' from jsonb_array_elements(p->'teams') t on conflict(name) do nothing;
  select id into strict ta from public.teams where name=p->'teams'->0->>'name';
  select id into strict tb from public.teams where name=p->'teams'->1->>'name';
  team_map := jsonb_build_object(p->'teams'->0->>'source_id',ta,p->'teams'->1->>'source_id',tb);
  if exists(select 1 from jsonb_array_elements(p->'matches') x where not coalesce(team_map ? (x->>'winner_team_id'),false))
     or exists(select 1 from jsonb_array_elements(p->'legs') x where not coalesce(team_map ? (x->>'winner_team_id'),false)
       or coalesce((x->>'leg_number')::int,0) not between 1 and 3
       or not exists(select 1 from jsonb_array_elements(p->'matches') m where m->>'id'=x->>'match_id'))
     or exists(select 1 from jsonb_array_elements(p->'stats') x where
       not coalesce(team_map ? (x->>'team_id'),false)
       or coalesce((x->>'darts_thrown')::int,0) <= 0 or coalesce((x->>'score')::int,-1) < 0
       or coalesce((x->>'first_9_darts')::int,0) not between 1 and 9
       or coalesce((x->>'first_9_score')::int,-1) < 0
       or (x->>'first_9_darts')::int > (x->>'darts_thrown')::int
       or (x->>'first_9_score')::int > (x->>'score')::int
       or not exists(select 1 from jsonb_array_elements(p->'players') a where a->>'id'=x->>'player_id' and a->>'team_id'=x->>'team_id')
       or not exists(select 1 from jsonb_array_elements(p->'legs') l where l->>'id'=x->>'leg_id'
         and (x->>'leg_won')::boolean=(l->>'winner_team_id'=x->>'team_id'))) then
    raise exception 'INTERCLUB_INVALID_DETAILS';
  end if;

  insert into public.rounds(season_id,code,played_on,published)
    values(s,p->>'round',(p->>'date')::date,false) on conflict(season_id,code) do nothing;
  select id into strict r from public.rounds where season_id=s and code=p->>'round';
  select * into existing from public.championship_results where natural_key=event_key;
  if found then
    if existing.season_id<>s or existing.round_id<>r or existing.home_team_id<>ta or existing.away_team_id<>tb
       or existing.home_score<>(p->'score'->>0)::int or existing.away_score<>(p->'score'->>1)::int
       or existing.quality_status<>'VERIFIED' or existing.detail_status<>'DETAILED' or existing.forfeit_team_id is not null then
      raise exception 'INTERCLUB_EXISTING_RESULT_CONFLICT';
    end if;
    adopted := true; result_id := existing.id;
    select id,import_id into strict enc,imp from public.encounters where natural_key=event_key
      and round_id=r and home_team_id=ta and away_team_id=tb;
  else
    if exists(select 1 from public.championship_results where season_id=s and
        (source_sheet=p->>'source_url' or (round_id=r and (home_team_id in (ta,tb) or away_team_id in (ta,tb)))))
       or exists(select 1 from public.encounters where round_id=r and (home_team_id in (ta,tb) or away_team_id in (ta,tb))) then
      raise exception 'INTERCLUB_EXISTING_RESULT_CONFLICT';
    end if;
    insert into public.imports(filename,status,rows_count,file_sha256,analysis_json)
      values('NAKKA_AUTO_' || (p->>'event_id') || '.json','PUBLISHING',jsonb_array_length(p->'stats'),encode(sha256(convert_to(p::text,'UTF8')),'hex'),p) returning id into imp;
    insert into public.encounters(round_id,natural_key,name,home_team_id,away_team_id,import_id)
      values(r,event_key,p->>'title',ta,tb,imp) returning id into enc;
    for row_data in select value from jsonb_array_elements(p->'matches') loop
      insert into public.matches(encounter_id,natural_key,match_number,nakka_match_number,mode,team_1_id,team_2_id,winner_team_id,import_id)
        values(enc,event_key||'|'||(row_data->>'id'),(row_data->>'number')::int,(row_data->>'number')::int,
          row_data->>'mode',ta,tb,(team_map->>(row_data->>'winner_team_id'))::uuid,imp);
    end loop;
    for row_data in select value from jsonb_array_elements(p->'legs') loop
      select id into strict mid from public.matches where natural_key=event_key||'|'||(row_data->>'match_id');
      insert into public.legs(match_id,natural_key,leg_number,winner_team_id,status,import_id)
        values(mid,event_key||'|'||(row_data->>'match_id')||'|'||(row_data->>'leg_number'),(row_data->>'leg_number')::int,
          (team_map->>(row_data->>'winner_team_id'))::uuid,'VALID',imp);
    end loop;
    for row_data in select value from jsonb_array_elements(p->'stats') loop
      select l.id into strict lid from public.legs l join public.matches m on m.id=l.match_id
        join jsonb_array_elements(p->'legs') x on x->>'id'=row_data->>'leg_id'
        where l.natural_key=event_key||'|'||(x->>'match_id')||'|'||(x->>'leg_number') and m.encounter_id=enc;
      insert into public.player_leg_stats(leg_id,player_id,team_id,score,darts_thrown,average_3_darts,first_9,first_9_score,first_9_darts,
        finish,scores_180,scores_170,scores_140,scores_100,scores_80,no_score,leg_won,import_id)
      values(lid,(row_data->>'player_id')::uuid,(team_map->>(row_data->>'team_id'))::uuid,
        (row_data->>'score')::int,(row_data->>'darts_thrown')::int,
        round(3*(row_data->>'score')::numeric/(row_data->>'darts_thrown')::numeric,2),
        round(3*(row_data->>'first_9_score')::numeric/(row_data->>'first_9_darts')::numeric,2),
        (row_data->>'first_9_score')::int,(row_data->>'first_9_darts')::int,
        (row_data->>'finish')::int,(row_data->>'scores_180')::int,(row_data->>'scores_170')::int,
        (row_data->>'scores_140')::int,(row_data->>'scores_100')::int,(row_data->>'scores_80')::int,
        (row_data->>'no_score')::int,(row_data->>'leg_won')::boolean,imp);
    end loop;
    insert into public.championship_results(natural_key,season_id,round_id,home_team_id,away_team_id,home_score,away_score,
      detail_status,quality_status,quality_note,source_sheet,played_on)
      values(event_key,s,r,ta,tb,(p->'score'->>0)::int,(p->'score'->>1)::int,'DETAILED','VERIFIED',
        'Publication automatique après contrôle des 20 matchs, des volées et des identités officielles.',p->>'source_url',(p->>'date')::date) returning id into result_id;
  end if;

  -- Validate the entire stored representation, including legacy J1 adoption.
  if (select count(*) from public.matches where encounter_id=enc)<>20
     or (select count(*) from public.legs l join public.matches m on m.id=l.match_id where m.encounter_id=enc)<>jsonb_array_length(p->'legs')
     or (select count(*) from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
         where m.encounter_id=enc)<>jsonb_array_length(p->'stats') then raise exception 'INTERCLUB_STORED_TOTALS_CONFLICT'; end if;
  for row_data in select value from jsonb_array_elements(p->'matches') loop
    select id into strict mid from public.matches where encounter_id=enc and natural_key=event_key||'|'||(row_data->>'id')
      and match_number=(row_data->>'number')::int and mode=row_data->>'mode'
      and winner_team_id=(team_map->>(row_data->>'winner_team_id'))::uuid;
    if (select count(*) from public.legs where match_id=mid) not between 2 and 3
       or (select count(*) from public.legs where match_id=mid and winner_team_id=(team_map->>(row_data->>'winner_team_id'))::uuid)<>2 then
      raise exception 'INTERCLUB_INVALID_MATCH_SCORE'; end if;
  end loop;
  if (select count(*) from public.matches where encounter_id=enc and winner_team_id=ta)<>(p->'score'->>0)::int then
    raise exception 'INTERCLUB_INVALID_TEAM_SCORE'; end if;
  for row_data in select value from jsonb_array_elements(p->'legs') loop
    select l.id into strict lid from public.legs l join public.matches m on m.id=l.match_id
      where m.encounter_id=enc and l.natural_key=event_key||'|'||(row_data->>'match_id')||'|'||(row_data->>'leg_number')
      and l.status='VALID' and l.winner_team_id=(team_map->>(row_data->>'winner_team_id'))::uuid;
    select case when mode='D' then 2 else 1 end into n from public.matches where id=(select match_id from public.legs where id=lid);
    if (select count(*) from public.player_leg_stats where leg_id=lid and team_id=ta)<>n
       or (select count(*) from public.player_leg_stats where leg_id=lid and team_id=tb)<>n then raise exception 'INTERCLUB_LEG_PARTICIPANTS'; end if;
  end loop;
  for row_data in select value from jsonb_array_elements(p->'stats') loop
    select l.id into strict lid from public.legs l
      join jsonb_array_elements(p->'legs') x on x->>'id'=row_data->>'leg_id'
      where l.natural_key=event_key||'|'||(x->>'match_id')||'|'||(x->>'leg_number');
    if not exists(select 1 from public.player_leg_stats st where st.leg_id=lid and st.player_id=(row_data->>'player_id')::uuid
      and st.team_id=(team_map->>(row_data->>'team_id'))::uuid and st.score=(row_data->>'score')::int
      and st.darts_thrown=(row_data->>'darts_thrown')::int and st.finish=(row_data->>'finish')::int
      and st.scores_180=(row_data->>'scores_180')::int and st.scores_170=(row_data->>'scores_170')::int
      and st.scores_140=(row_data->>'scores_140')::int and st.scores_100=(row_data->>'scores_100')::int
      and st.scores_80=(row_data->>'scores_80')::int and st.no_score=(row_data->>'no_score')::int
      and st.leg_won=(row_data->>'leg_won')::boolean
      and (st.first_9_score is null or st.first_9_score=(row_data->>'first_9_score')::int)
      and (st.first_9_darts is null or st.first_9_darts=(row_data->>'first_9_darts')::int)) then
      raise exception 'INTERCLUB_STORED_STATS_CONFLICT'; end if;
    -- Legacy details keep every existing statistic; add exact First 9 weights.
    update public.player_leg_stats set first_9_score=(row_data->>'first_9_score')::int,first_9_darts=(row_data->>'first_9_darts')::int
      where leg_id=lid and player_id=(row_data->>'player_id')::uuid and first_9_darts is null;
  end loop;
  for row_data in select value from jsonb_array_elements(p->'players') loop
    if not exists(select 1 from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
      where m.encounter_id=enc and st.player_id=(row_data->>'id')::uuid group by st.player_id
      having count(*)=(row_data->>'leg')::int and sum(st.score)=(row_data->>'score')::int
      and sum(st.darts_thrown)=(row_data->>'darts')::int and count(*) filter(where st.leg_won)=(row_data->>'winLeg')::int
      and max(st.finish)=(row_data->>'highOut')::int and sum(st.first_9_score)=(row_data->>'f9Score')::int
      and sum(st.first_9_darts)=(row_data->>'f9Darts')::int) then raise exception 'INTERCLUB_PLAYER_TOTALS_CONFLICT'; end if;
  end loop;
  update public.championship_results set played_on=(p->>'date')::date where id=result_id and played_on is null;
  if old_hash is not null then return jsonb_build_object('status','UNCHANGED','result_id',result_id); end if;
  update public.rounds set published=true,played_on=least(played_on,(p->>'date')::date) where id=r;
  if not adopted then
    update public.imports set status='PUBLISHED',published_at=now() where id=imp;
  end if;
  for row_data in select value from jsonb_array_elements(p->'players') loop
    insert into public.player_profiles(player_id,season_id,legs_played,legs_won,average_3_darts,first_9,best_finish,summary)
      select st.player_id,s,count(*),count(*) filter(where st.leg_won),round(3*sum(st.score)::numeric/nullif(sum(st.darts_thrown),0),2),
        case when count(st.first_9_darts)=count(*) then round(3*sum(st.first_9_score)::numeric/nullif(sum(st.first_9_darts),0),2) end,
        max(st.finish),'Statistiques calculées sur les rencontres interclubs publiées de la saison.'
      from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
      join public.encounters e on e.id=m.encounter_id join public.rounds rd on rd.id=e.round_id
      where st.player_id=(row_data->>'id')::uuid and rd.season_id=s and rd.published and l.status='VALID'
      group by st.player_id
      on conflict(player_id,season_id) do update set legs_played=excluded.legs_played,legs_won=excluded.legs_won,
        average_3_darts=excluded.average_3_darts,first_9=excluded.first_9,best_finish=excluded.best_finish,
        summary=excluded.summary,updated_at=now();
    insert into public.player_team_memberships(identity_id,team_id,season_id,valid_from,is_current,source,notes)
      select (row_data->>'identity_id')::uuid,(team_map->>(row_data->>'team_id'))::uuid,s,(p->>'date')::date,false,'NAKKA_IMPORT',
        'Équipe représentée en championnat, contrôlée avec l’effectif officiel.'
      where not exists(select 1 from public.player_team_memberships where identity_id=(row_data->>'identity_id')::uuid
        and team_id=(team_map->>(row_data->>'team_id'))::uuid and season_id=s);
  end loop;
  insert into public.interclub_auto_publications(source_event_id,season_id,result_id,played_on,payload_hash,payload)
    values(p->>'event_id',s,result_id,(p->>'date')::date,encode(sha256(convert_to(p::text,'UTF8')),'hex'),p);
  return jsonb_build_object('status',case when adopted then 'UNCHANGED' else 'PUBLISHED' end,'result_id',result_id);
end $$;
revoke all on function public.publish_interclub_match(jsonb) from public, anon, authenticated;
grant execute on function public.publish_interclub_match(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
