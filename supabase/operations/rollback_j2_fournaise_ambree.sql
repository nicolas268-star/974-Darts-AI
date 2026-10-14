-- Run only after stopping interclub-analysis and exporting the pre-apply audit.
-- Intended for this PR's first publication when the preview had no result.
-- Keep the correction guard installed so no erroneous reimport can overwrite it.
begin;
do $rollback$
declare
  audit public.interclub_auto_publications%rowtype;
  enc uuid; imp uuid; affected uuid[];
begin
  select * into strict audit from public.interclub_auto_publications where source_event_id='t_uAfU_5679';
  perform pg_advisory_xact_lock(hashtextextended('interclub:' || audit.season_id::text,0));
  perform public.validate_interclub_adjustments(audit.payload);
  -- The existing publisher checks every stored score/stat against the audit.
  -- Refuse rollback after a different manual edit or a partial import.
  perform public.publish_interclub_match(audit.payload);
  select id,import_id into strict enc,imp from public.encounters
    where natural_key='2026-2027|J2|nakka:t_uAfU_5679';
  if not exists(select 1 from public.imports where id=imp and filename='NAKKA_AUTO_t_uAfU_5679.json') then
    raise exception 'J2_ROLLBACK_REQUIRES_NEW_AUTO_IMPORT';
  end if;
  select array_agg(distinct st.player_id) into affected from public.player_leg_stats st
    join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id where m.encounter_id=enc;
  delete from public.interclub_auto_publications where source_event_id=audit.source_event_id;
  delete from public.player_leg_stats st using public.legs l,public.matches m
    where st.leg_id=l.id and l.match_id=m.id and m.encounter_id=enc;
  delete from public.legs l using public.matches m where l.match_id=m.id and m.encounter_id=enc;
  delete from public.matches where encounter_id=enc;
  delete from public.encounters where id=enc;
  delete from public.championship_results where id=audit.result_id;
  delete from public.imports where id=imp;
  -- Recompute only the affected season's profiles from remaining valid play.
  delete from public.player_profiles pf where pf.season_id=audit.season_id and pf.player_id=any(affected)
    and not exists(select 1 from public.player_leg_stats st join public.legs l on l.id=st.leg_id
      join public.matches m on m.id=l.match_id join public.encounters e on e.id=m.encounter_id
      join public.rounds r on r.id=e.round_id
      where st.player_id=pf.player_id and r.season_id=audit.season_id and r.published and l.status='VALID');
  insert into public.player_profiles(player_id,season_id,legs_played,legs_won,average_3_darts,first_9,best_finish,summary)
    select st.player_id,audit.season_id,count(*),count(*) filter(where st.leg_won),
      round(3*sum(st.score)::numeric/nullif(sum(st.darts_thrown),0),2),
      case when count(st.first_9_darts)=count(*) then round(3*sum(st.first_9_score)::numeric/nullif(sum(st.first_9_darts),0),2) end,
      max(st.finish),'Statistiques calculées sur les rencontres interclubs publiées de la saison.'
    from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id
    join public.encounters e on e.id=m.encounter_id join public.rounds r on r.id=e.round_id
    where st.player_id=any(affected) and r.season_id=audit.season_id and r.published and l.status='VALID'
    group by st.player_id
    on conflict(player_id,season_id) do update set legs_played=excluded.legs_played,legs_won=excluded.legs_won,
      average_3_darts=excluded.average_3_darts,first_9=excluded.first_9,best_finish=excluded.best_finish,
      summary=excluded.summary,updated_at=now();
  -- Official season memberships are valid independently of this publication.
  -- No Ambrée membership was inserted for Benoit; his Brune row is untouched.
end $rollback$;
commit;
