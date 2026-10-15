-- A second organiser confirmation identifies Christophe's actual source streams.
-- Install the guard/operation only; applying the four-row correction is explicit.
begin;
do $copy$
declare definition text;
begin
  if to_regprocedure('public.validate_interclub_result_adjustments_v1(jsonb)') is null then
    definition := pg_get_functiondef('public.validate_interclub_adjustments(jsonb)'::regprocedure);
    if strpos(definition,'INTERCLUB_J2_CORRECTION_MISMATCH')=0 then raise exception 'J2_RESULT_GUARD_NOT_FOUND'; end if;
    execute replace(definition,'FUNCTION public.validate_interclub_adjustments(',
                               'FUNCTION public.validate_interclub_result_adjustments_v1(');
  end if;
end $copy$;

create or replace function public.interclub_j2_player_totals(p jsonb) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
select jsonb_set(p,'{players}',(select jsonb_agg(case when x->>'id' in
 ('a9fded26-6e5a-489e-b15c-fb5568ee553d','78c05fc0-340e-43fa-93d6-7aadd225fe36') then x ||
 (select jsonb_build_object('leg',count(*),'winLeg',count(*) filter(where (st->>'leg_won')::boolean),
   'score',sum((st->>'score')::int),'darts',sum((st->>'darts_thrown')::int),
   'f9Score',sum((st->>'first_9_score')::int),'f9Darts',sum((st->>'first_9_darts')::int),
   'ton00',sum((st->>'scores_100')::int),'ton40',sum((st->>'scores_140')::int),
   'ton70',sum((st->>'scores_170')::int),'ton80',sum((st->>'scores_180')::int),'highOut',max((st->>'finish')::int))
  from jsonb_array_elements(p->'stats') st where st->>'player_id'=x->>'id') else x end order by ord)
 from jsonb_array_elements(p->'players') with ordinality a(x,ord)))
$$;

create or replace function public.interclub_j2_statistics_payload(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  base jsonb:=p; expected jsonb; raw_match jsonb; raw_leg jsonb; number int;
  match_key text:='8jsiG9Na_1791996900443';
  benoit text:='a9fded26-6e5a-489e-b15c-fb5568ee553d'; christophe text:='78c05fc0-340e-43fa-93d6-7aadd225fe36';
begin
  if p->>'event_id' is distinct from 't_uAfU_5679' then
    if p ? 'statistics_corrections' then raise exception 'INTERCLUB_UNAUTHORIZED_STATISTICS_ADJUSTMENT'; end if;
    perform public.validate_interclub_result_adjustments_v1(p);
    return p;
  end if;
  if p ? 'statistics_corrections' then
    -- Recover the result-only stage from the immutable source for these four
    -- numeric rows. All unrelated data/identities must still pass the old guard.
    base := p - 'statistics_corrections';
    base := jsonb_set(base,'{stats}',(select jsonb_agg(case when exists(
      select 1 from jsonb_array_elements(p->'legs') l where l->>'id'=x->>'leg_id' and l->>'match_id'=match_key)
      then (select src || jsonb_build_object('leg_won',(x->>'leg_won')::boolean)
        from jsonb_array_elements(p->'source_snapshot'->'stats') src
        where src->>'leg_id'=x->>'leg_id' and src->>'player_id'=x->>'player_id') else x end order by ord)
      from jsonb_array_elements(p->'stats') with ordinality a(x,ord)));
    base := public.interclub_j2_player_totals(base);
  end if;
  perform public.validate_interclub_result_adjustments_v1(base);
  select x into strict raw_match from jsonb_array_elements(base->'raw_nakka'->'sets') x where x->>'mid'=match_key;
  if jsonb_array_length(raw_match->'legData')<>2 then raise exception 'INTERCLUB_J2_CHECKOUT_SOURCE_CHANGED'; end if;
  for raw_leg,number in select x,ord::int from jsonb_array_elements(raw_match->'legData') with ordinality a(x,ord) loop
    if raw_leg->>'winner'<>'0' or raw_leg->'playerData'->0->(-2)->>'left' is distinct from (case when number=1 then '40' else '6' end)
       or raw_leg->'playerData'->0->(-1)->>'left' is distinct from '0'
       or raw_leg->'playerData'->0->(-1)->>'score' is distinct from '-1' then
      raise exception 'INTERCLUB_J2_CHECKOUT_SOURCE_CHANGED';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(base->'stats') x
      join jsonb_array_elements(base->'legs') l on l->>'id'=x->>'leg_id'
      where l->>'match_id'=match_key and x->>'player_id'=benoit and x->>'score'='501' and x->>'darts_thrown'='40'
      and x->>'finish'=case when l->>'leg_number'='1' then '40' else '6' end)<>2
     or (select count(*) from jsonb_array_elements(base->'stats') x
      join jsonb_array_elements(base->'legs') l on l->>'id'=x->>'leg_id'
      where l->>'match_id'=match_key and x->>'player_id'=christophe and x->>'finish'='0' and (x->>'score')::int<501)<>2 then
    raise exception 'INTERCLUB_J2_STATISTICS_SOURCE_CHANGED';
  end if;
  expected := jsonb_set(base,'{stats}',(select jsonb_agg(case when exists(
    select 1 from jsonb_array_elements(base->'legs') l where l->>'id'=x->>'leg_id' and l->>'match_id'=match_key)
    then (select (donor - 'player_id' - 'team_id' - 'leg_won') || jsonb_build_object(
        'player_id',x->>'player_id','team_id',x->>'team_id','leg_won',(x->>'leg_won')::boolean)
      from jsonb_array_elements(base->'stats') donor where donor->>'leg_id'=x->>'leg_id'
        and donor->>'player_id'=case when x->>'player_id'=benoit then christophe else benoit end)
    else x end order by ord) from jsonb_array_elements(base->'stats') with ordinality a(x,ord)));
  expected := public.interclub_j2_player_totals(expected) || jsonb_build_object('statistics_corrections',jsonb_build_array(jsonb_build_object(
    'key','J2_SIMPLE_16_CONFIRMED_STATISTICS_ATTRIBUTION','event_id','t_uAfU_5679','match_id',match_key,
    'player_ids',jsonb_build_array(benoit,christophe),
    'reason','Attribution des deux séries à Christophe confirmée par l’organisateur : finishes 40 et 6 en une fléchette',
    'confirmed_finishes',jsonb_build_array(jsonb_build_object('leg_number',1,'player_id',christophe,'finish',40,'checkout_darts',1),
                                        jsonb_build_object('leg_number',2,'player_id',christophe,'finish',6,'checkout_darts',1)))));
  if p ? 'statistics_corrections' and p is distinct from expected then raise exception 'INTERCLUB_J2_STATISTICS_CORRECTION_MISMATCH'; end if;
  return expected;
end $$;

create or replace function public.validate_interclub_adjustments(p jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p is distinct from public.interclub_j2_statistics_payload(p) then raise exception 'INTERCLUB_J2_STATISTICS_CORRECTION_REQUIRED'; end if;
end $$;

do $publisher$
declare
  definition text:=pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure);
  -- This assignment is shared by the initial publisher and the installed
  -- Brune-name compatibility publisher (which reads both hash and old payload).
  marker text:=$marker$  event_key := (p->>'season') || '|' || (p->>'round') || '|nakka:' || (p->>'event_id');$marker$;
begin
  if strpos(definition,'p := public.interclub_j2_statistics_payload(p);')=0 then
    if strpos(definition,marker)=0 then raise exception 'INTERCLUB_HASH_PATCH_POINT_NOT_FOUND'; end if;
    execute replace(definition,marker,'  p := public.interclub_j2_statistics_payload(p);' || chr(10) || marker);
  end if;
end $publisher$;

create or replace function public.refresh_interclub_j2_profiles(p_season uuid) returns void
language sql security invoker set search_path=public,pg_temp as $$
  insert into public.player_profiles(player_id,season_id,legs_played,legs_won,average_3_darts,first_9,best_finish,summary)
    select st.player_id,p_season,count(*),count(*) filter(where st.leg_won),
      round(3*sum(st.score)::numeric/nullif(sum(st.darts_thrown),0),2),
      case when count(st.first_9_darts)=count(*) then round(3*sum(st.first_9_score)::numeric/nullif(sum(st.first_9_darts),0),2) end,
      max(st.finish),'Statistiques calculées sur les rencontres interclubs publiées de la saison.'
    from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
    join public.encounters e on e.id=m.encounter_id join public.rounds r on r.id=e.round_id
    where st.player_id in ('a9fded26-6e5a-489e-b15c-fb5568ee553d','78c05fc0-340e-43fa-93d6-7aadd225fe36')
      and r.season_id=p_season and r.published and l.status='VALID' group by st.player_id
    on conflict(player_id,season_id) do update set legs_played=excluded.legs_played,legs_won=excluded.legs_won,
      average_3_darts=excluded.average_3_darts,first_9=excluded.first_9,best_finish=excluded.best_finish,
      summary=excluded.summary,updated_at=now();
$$;

create or replace function public.correct_interclub_j2_statistics() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp set lock_timeout='5s' set statement_timeout='30s' as $$
declare
  audit public.interclub_auto_publications%rowtype; corrected jsonb; oldrow jsonb; row_data jsonb; existing jsonb;
  enc uuid; imp uuid; lid uuid; changed int:=0; before_rows jsonb; before_profiles jsonb;
  target_key text:='2026-2027|J2|nakka:t_uAfU_5679'; match_key text:='8jsiG9Na_1791996900443'; new_hash text;
begin
  select * into strict audit from public.interclub_auto_publications where source_event_id='t_uAfU_5679';
  perform pg_advisory_xact_lock(hashtextextended('interclub:' || audit.season_id::text,0));
  select * into strict audit from public.interclub_auto_publications where source_event_id='t_uAfU_5679' for update;
  corrected := public.interclub_j2_statistics_payload(audit.payload);
  if audit.payload ? 'statistics_corrections' then
    perform public.publish_interclub_match(corrected);
    return jsonb_build_object('status','UNCHANGED','result_id',audit.result_id);
  end if;
  select id,import_id into strict enc,imp from public.encounters where natural_key=target_key;
  if not exists(select 1 from public.imports where id=imp and (analysis_json - 'local_statistics_corrections')=audit.payload) then
    raise exception 'INTERCLUB_J2_ORIGINAL_IMPORT_MISMATCH';
  end if;
  select jsonb_agg(to_jsonb(st) order by st.id) into before_rows from public.player_leg_stats st
    join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
    where m.natural_key=target_key||'|'||match_key;
  select jsonb_agg(to_jsonb(pf) order by pf.id) into before_profiles from public.player_profiles pf
    where pf.season_id=audit.season_id and pf.player_id in
      ('a9fded26-6e5a-489e-b15c-fb5568ee553d','78c05fc0-340e-43fa-93d6-7aadd225fe36');
  for row_data in select x from jsonb_array_elements(corrected->'stats') x
    join jsonb_array_elements(corrected->'legs') l on l->>'id'=x->>'leg_id' where l->>'match_id'=match_key loop
    select l.id into strict lid from public.legs l join public.matches m on m.id=l.match_id
      join jsonb_array_elements(corrected->'legs') src on src->>'id'=row_data->>'leg_id'
      where m.encounter_id=enc and l.natural_key=target_key||'|'||match_key||'|'||(src->>'leg_number');
    select x into strict oldrow from jsonb_array_elements(audit.payload->'stats') x
      where x->>'leg_id'=row_data->>'leg_id' and x->>'player_id'=row_data->>'player_id';
    select to_jsonb(st) into strict existing from public.player_leg_stats st where st.leg_id=lid and st.player_id=(row_data->>'player_id')::uuid;
    if not (existing @> (oldrow - 'leg_id' - 'team_id')) then raise exception 'INTERCLUB_J2_STORED_STATISTICS_CHANGED'; end if;
    update public.player_leg_stats set score=(row_data->>'score')::int,darts_thrown=(row_data->>'darts_thrown')::int,
      average_3_darts=round(3*(row_data->>'score')::numeric/(row_data->>'darts_thrown')::int,2),
      first_9=round(3*(row_data->>'first_9_score')::numeric/(row_data->>'first_9_darts')::int,2),
      first_9_score=(row_data->>'first_9_score')::int,first_9_darts=(row_data->>'first_9_darts')::int,
      finish=(row_data->>'finish')::int,scores_100=(row_data->>'scores_100')::int,scores_140=(row_data->>'scores_140')::int,
      scores_170=(row_data->>'scores_170')::int,scores_180=(row_data->>'scores_180')::int,
      scores_80=(row_data->>'scores_80')::int,no_score=(row_data->>'no_score')::int
      where leg_id=lid and player_id=(row_data->>'player_id')::uuid;
    if not found then raise exception 'INTERCLUB_J2_STATISTIC_ROW_MISSING'; end if;
    changed:=changed+1;
  end loop;
  if changed<>4 then raise exception 'INTERCLUB_J2_FOUR_ROWS_REQUIRED'; end if;
  perform public.refresh_interclub_j2_profiles(audit.season_id);
  new_hash:=encode(sha256(convert_to(corrected::text,'UTF8')),'hex');
  update public.interclub_auto_publications set payload=corrected,payload_hash=new_hash where source_event_id=audit.source_event_id;
  -- Keep the original import payload and add a dated, reversible correction record.
  update public.imports set analysis_json=analysis_json || jsonb_build_object('local_statistics_corrections',coalesce(analysis_json->'local_statistics_corrections','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'key','J2_SIMPLE_16_CONFIRMED_STATISTICS_ATTRIBUTION','applied_at',now(),'applied_by',current_user,
    'previous_payload_hash',audit.payload_hash,'corrected_payload_hash',new_hash,'previous_statistics',before_rows,
    'previous_profiles',before_profiles,'correction',corrected->'statistics_corrections'->0))) where id=imp;
  -- Reuse the full publisher validation after every stored change; failure rolls
  -- back all four rows, both profiles and both audit writes in this transaction.
  perform public.publish_interclub_match(corrected);
  return jsonb_build_object('status','CORRECTED','result_id',audit.result_id,'statistics_updated',changed);
end $$;

grant update(payload,payload_hash) on public.interclub_auto_publications to service_role;
revoke all on function public.validate_interclub_result_adjustments_v1(jsonb),public.interclub_j2_player_totals(jsonb),
  public.interclub_j2_statistics_payload(jsonb),public.validate_interclub_adjustments(jsonb),public.refresh_interclub_j2_profiles(uuid),public.correct_interclub_j2_statistics() from public,anon,authenticated;
grant execute on function public.validate_interclub_result_adjustments_v1(jsonb),public.interclub_j2_player_totals(jsonb),
  public.interclub_j2_statistics_payload(jsonb),public.validate_interclub_adjustments(jsonb),public.refresh_interclub_j2_profiles(uuid),public.correct_interclub_j2_statistics() to service_role;
notify pgrst,'reload schema';
commit;
