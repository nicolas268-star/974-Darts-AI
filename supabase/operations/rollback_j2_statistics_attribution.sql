-- Roll back only the second (statistics) confirmation, keeping the 15–5 result.
-- Stop interclub-analysis first. No player, match or leg is deleted/reassigned.
begin;
do $rollback$
declare
  audit public.interclub_auto_publications%rowtype; original jsonb; history jsonb; record jsonb; row_data jsonb;
  imp uuid; changed int:=0;
begin
  select * into strict audit from public.interclub_auto_publications where source_event_id='t_uAfU_5679';
  perform pg_advisory_xact_lock(hashtextextended('interclub:' || audit.season_id::text,0));
  select * into strict audit from public.interclub_auto_publications where source_event_id='t_uAfU_5679' for update;
  select i.id,i.analysis_json - 'local_statistics_corrections',i.analysis_json->'local_statistics_corrections'
    into strict imp,original,history from public.imports i join public.encounters e on e.import_id=i.id
    where e.natural_key='2026-2027|J2|nakka:t_uAfU_5679';
  record:=history->(-1);
  if not (audit.payload ? 'statistics_corrections') or record is null or record ? 'rolled_back_at' then
    raise exception 'INTERCLUB_J2_NO_ACTIVE_STATISTICS_CORRECTION';
  end if;
  if audit.payload_hash is distinct from record->>'corrected_payload_hash'
     or audit.payload is distinct from public.interclub_j2_statistics_payload(original) then
    raise exception 'INTERCLUB_J2_ROLLBACK_AUDIT_MISMATCH';
  end if;
  perform public.publish_interclub_match(audit.payload);
  for row_data in select x from jsonb_array_elements(record->'previous_statistics') x loop
    update public.player_leg_stats set score=(row_data->>'score')::int,darts_thrown=(row_data->>'darts_thrown')::int,
      average_3_darts=(row_data->>'average_3_darts')::numeric,first_9=(row_data->>'first_9')::numeric,
      first_9_score=(row_data->>'first_9_score')::int,first_9_darts=(row_data->>'first_9_darts')::int,
      finish=(row_data->>'finish')::int,scores_100=(row_data->>'scores_100')::int,scores_140=(row_data->>'scores_140')::int,
      scores_170=(row_data->>'scores_170')::int,scores_180=(row_data->>'scores_180')::int,
      scores_80=(row_data->>'scores_80')::int,no_score=(row_data->>'no_score')::int
      where id=(row_data->>'id')::uuid and player_id=(row_data->>'player_id')::uuid and leg_id=(row_data->>'leg_id')::uuid;
    if not found then raise exception 'INTERCLUB_J2_ROLLBACK_ROW_MISSING'; end if;
    changed:=changed+1;
  end loop;
  if changed<>4 then raise exception 'INTERCLUB_J2_ROLLBACK_FOUR_ROWS_REQUIRED'; end if;
  perform public.refresh_interclub_j2_profiles(audit.season_id);
  update public.interclub_auto_publications set payload=original,payload_hash=record->>'previous_payload_hash'
    where source_event_id=audit.source_event_id;
  update public.imports set analysis_json=jsonb_set(analysis_json,
    array['local_statistics_corrections',(jsonb_array_length(history)-1)::text],
    record || jsonb_build_object('rolled_back_at',now(),'rolled_back_by',current_user)) where id=imp;
end $rollback$;
commit;
