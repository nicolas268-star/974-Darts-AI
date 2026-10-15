-- Exact counts only: NULL means the source retained no visit-level evidence.
begin;
alter table public.player_leg_stats add column scores_120_139 integer
  check (scores_120_139 >= 0 and scores_120_139 <= scores_100);
comment on column public.player_leg_stats.scores_120_139 is
  'Visits scoring 120 through 139 inclusive; subset of the existing 100-139 Nakka bucket. NULL = unavailable.';

-- Preserve the established publisher, its checksums and all J2 corrections.
-- Removing this one additive field reproduces the historical payload exactly.
-- Both publication and enrichment occur in the same transaction and season lock.
create function public.publish_interclub_scoring(p jsonb) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  legacy jsonb := p; snapshot jsonb; result jsonb; row_data jsonb;
  event_key text; leg_key text; affected integer;
begin
  legacy := jsonb_set(legacy, '{stats}', (
    select jsonb_agg(x - 'scores_120_139' order by ord)
    from jsonb_array_elements(p->'stats') with ordinality a(x, ord)));
  if p ? 'source_snapshot' then
    snapshot := p->'source_snapshot';
    snapshot := jsonb_set(snapshot, '{stats}', (
      select jsonb_agg(x - 'scores_120_139' order by ord)
      from jsonb_array_elements(snapshot->'stats') with ordinality a(x, ord)));
    legacy := jsonb_set(legacy, '{source_snapshot}', snapshot);
  end if;
  result := public.publish_interclub_match(legacy);
  event_key := (p->>'season') || '|' || (p->>'round') || '|nakka:' || (p->>'event_id');
  for row_data in select x from jsonb_array_elements(p->'stats') x where x ? 'scores_120_139' loop
    if jsonb_typeof(row_data->'scores_120_139') is distinct from 'number'
       or (row_data->>'scores_120_139') !~ '^[0-9]+$'
       or (row_data->>'scores_120_139')::numeric > (row_data->>'scores_100')::numeric then
      raise exception 'INTERCLUB_INVALID_SCORING_RANGE';
    end if;
    select event_key || '|' || (x->>'match_id') || '|' || (x->>'leg_number')
      into strict leg_key from jsonb_array_elements(p->'legs') x where x->>'id'=row_data->>'leg_id';
    update public.player_leg_stats st set scores_120_139=(row_data->>'scores_120_139')::int
      from public.legs l where st.leg_id=l.id and l.natural_key=leg_key
      and st.player_id=(row_data->>'player_id')::uuid;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'INTERCLUB_SCORING_ROW_MISSING'; end if;
  end loop;
  return result;
end $$;
revoke all on function public.publish_interclub_scoring(jsonb) from public, anon, authenticated;
grant execute on function public.publish_interclub_scoring(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
