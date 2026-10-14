-- Extend the installed publisher: same transaction, locks, validations and audit.
-- No data is changed by this migration. The targeted import is a separate action.
begin;
create or replace function public.validate_interclub_adjustments(p jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  raw jsonb; expected jsonb; original_score jsonb; match_key text := '8jsiG9Na_1791996900443';
  benoit text := 'a9fded26-6e5a-489e-b15c-fb5568ee553d';
  christophe text := '78c05fc0-340e-43fa-93d6-7aadd225fe36';
begin
  if p->>'event_id' is distinct from 't_uAfU_5679' then
    if p ? 'result_corrections' or p ? 'source_snapshot'
       or exists(select 1 from jsonb_array_elements(p->'players') x where x ? 'participation_exception') then
      raise exception 'INTERCLUB_UNAUTHORIZED_ADJUSTMENT';
    end if;
    return;
  end if;
  raw := p->'source_snapshot';
  if raw is null or raw ? 'source_snapshot' or raw ? 'result_corrections'
     or raw->>'event_id' is distinct from 't_uAfU_5679'
     or raw->>'season' is distinct from '2026-2027' or raw->>'league_id' is distinct from 'lg_EUoR_6095'
     or raw->>'round' is distinct from 'J2' or raw->>'date' is distinct from '2026-10-14'
     or raw->>'source_url' is distinct from 'https://n01darts.com/n01/league/season.php?id=t_uAfU_5679'
     or raw->'teams'->0->>'source_id' is distinct from 'z1ps'
     or raw->'teams'->0->>'name' is distinct from '3B Darts Club - A(mbré)'
     or raw->'teams'->1->>'source_id' is distinct from 'uwbj'
     or raw->'teams'->1->>'name' is distinct from 'Papangue Darts Club - Fournaise'
     or raw->'raw_nakka'->'data'->>'tdid' is distinct from 't_uAfU_5679' then
    raise exception 'INTERCLUB_J2_AUDIT_REQUIRED';
  end if;
  if (select count(*) from jsonb_array_elements(raw->'players') x where x ? 'participation_exception') <> 1
     or not exists(select 1 from jsonb_array_elements(raw->'players') x where x->>'id'=benoit
       and x->>'identity_id'='45f23d50-2f77-4ef4-983c-2cca7f5a425f' and x->>'source_id'='5ggq' and x->>'team_id'='z1ps'
       and x->'participation_exception'=jsonb_build_object('usual_team','3B Darts Club - B(rune)',
         'note','Renfort exceptionnel pour Ambrée — équipe habituelle : Brune'))
     or not exists(select 1 from jsonb_array_elements(raw->'players') x where x->>'id'=christophe
       and x->>'source_id'='a0zp' and x->>'team_id'='uwbj')
     or (select count(*) from jsonb_array_elements(raw->'matches') x where x->>'id'=match_key and x->>'mode'='S' and x->>'number'='18') <> 1
     or (select count(*) from jsonb_array_elements(raw->'legs') x where x->>'match_id'=match_key) <> 2
     or (select count(*) from jsonb_array_elements(raw->'stats') x
         join jsonb_array_elements(raw->'legs') l on l->>'id'=x->>'leg_id'
         where l->>'match_id'=match_key and (x->>'player_id',x->>'team_id') in ((benoit,'z1ps'),(christophe,'uwbj'))) <> 4 then
    raise exception 'INTERCLUB_J2_PARTICIPANTS_CHANGED';
  end if;
  select jsonb_build_array(count(*) filter(where x->>'winner_team_id'='z1ps'),count(*) filter(where x->>'winner_team_id'='uwbj'))
    into original_score from jsonb_array_elements(raw->'legs') x where x->>'match_id'=match_key;
  if original_score not in ('[2,0]'::jsonb,'[0,2]'::jsonb) then raise exception 'INTERCLUB_J2_SCORE_CHANGED'; end if;
  expected := raw;
  expected := jsonb_set(expected,'{matches}',(select jsonb_agg(case when x->>'id'=match_key
    then x || jsonb_build_object('winner_team_id','uwbj') else x end order by ord)
    from jsonb_array_elements(raw->'matches') with ordinality as a(x,ord)));
  expected := jsonb_set(expected,'{legs}',(select jsonb_agg(case when x->>'match_id'=match_key
    then x || jsonb_build_object('winner_team_id','uwbj') else x end order by ord)
    from jsonb_array_elements(raw->'legs') with ordinality as a(x,ord)));
  expected := jsonb_set(expected,'{stats}',(select jsonb_agg(case when exists(
    select 1 from jsonb_array_elements(raw->'legs') l where l->>'id'=x->>'leg_id' and l->>'match_id'=match_key)
    then x || jsonb_build_object('leg_won',x->>'player_id'=christophe) else x end order by ord)
    from jsonb_array_elements(raw->'stats') with ordinality as a(x,ord)));
  expected := jsonb_set(expected,'{players}',(select jsonb_agg(x || jsonb_build_object('winLeg',
    (select count(*) from jsonb_array_elements(expected->'stats') st where st->>'player_id'=x->>'id' and (st->>'leg_won')::boolean)) order by ord)
    from jsonb_array_elements(raw->'players') with ordinality as a(x,ord)));
  expected := jsonb_set(expected,'{score}',(select jsonb_build_array(count(*) filter(where x->>'winner_team_id'='z1ps'),
    count(*) filter(where x->>'winner_team_id'='uwbj')) from jsonb_array_elements(expected->'matches') x));
  if expected->'score' <> '[5,15]'::jsonb then raise exception 'INTERCLUB_J2_AGGREGATION_MISMATCH'; end if;
  expected := expected || jsonb_build_object('source_snapshot',raw,'result_corrections',jsonb_build_array(jsonb_build_object(
    'key','J2_FOURNAISE_AMBREE_SIMPLE_16','event_id','t_uAfU_5679','match_id',match_key,
    'player_ids',jsonb_build_array(benoit,christophe),'initial_score',original_score,'corrected_score',jsonb_build_array(0,2),
    'reason','Inversion de score confirmée par l’organisateur')));
  -- Exact comparison allows only the result fields above. Scoring and every
  -- other match must equal the retained, validated source snapshot.
  if p is distinct from expected then raise exception 'INTERCLUB_J2_CORRECTION_MISMATCH'; end if;
end $$;
revoke all on function public.validate_interclub_adjustments(jsonb) from public, anon, authenticated;
grant execute on function public.validate_interclub_adjustments(jsonb) to service_role;

do $migration$
declare
  definition text := pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure);
  marker text := $marker$  select count(*) into n from jsonb_array_elements(p->'players') x$marker$;
  membership_guard text := $guard$      where not exists(select 1 from public.player_team_memberships where identity_id=$guard$;
  patched_guard text := $guard$      where not (row_data ? 'participation_exception')
        and not exists(select 1 from public.player_team_memberships where identity_id=$guard$;
begin
  if strpos(definition,'perform public.validate_interclub_adjustments(p);') = 0 then
    if strpos(definition,marker)=0 or strpos(definition,membership_guard)=0 then
      raise exception 'INTERCLUB_PUBLISHER_PATCH_POINT_NOT_FOUND';
    end if;
    definition := replace(definition,marker,'  perform public.validate_interclub_adjustments(p);' || chr(10) || marker);
    definition := replace(definition,membership_guard,patched_guard);
    execute definition;
  elsif strpos(definition,patched_guard)=0 then
    raise exception 'INTERCLUB_MEMBERSHIP_PATCH_NOT_FOUND';
  end if;
end $migration$;
revoke all on function public.publish_interclub_match(jsonb) from public, anon, authenticated;
grant execute on function public.publish_interclub_match(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
