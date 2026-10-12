-- Correct the 2027 team name without changing IDs, results or source audits.
begin;

create or replace function public.interclub_team_name(value text) returns text
language sql immutable strict security invoker
set search_path = public, pg_temp
as $name$
  select case when value = '3B Darts Club - B(londe)'
    then '3B Darts Club - B(rune)' else value end
$name$;

-- Only teams[].name is normalized for comparison. Source title, IDs and all
-- sporting data still have to match exactly; stored payload/hash are never rewritten.
create or replace function public.interclub_team_payload(value jsonb) returns jsonb
language sql immutable strict security invoker
set search_path = public, pg_temp
as $payload$
  select case when jsonb_typeof(value->'teams') = 'array' then
    jsonb_set(value, '{teams}', coalesce((
      select jsonb_agg(case when item->>'name' = '3B Darts Club - B(londe)'
        then jsonb_set(item, '{name}', to_jsonb('3B Darts Club - B(rune)'::text), false)
        else item end order by position)
      from jsonb_array_elements(value->'teams') with ordinality as team(item, position)
    ), '[]'::jsonb), false)
  else value end
$payload$;
revoke all on function public.interclub_team_name(text), public.interclub_team_payload(jsonb)
  from public, anon, authenticated;
grant execute on function public.interclub_team_name(text), public.interclub_team_payload(jsonb)
  to service_role;

do $patch$
declare
  definition text;
  old_parts text[] := array[
    $old$old_hash text; adopted boolean := false; n integer;$old$,
    $old$select payload_hash into old_hash from public.interclub_auto_publications where source_event_id=p->>'event_id';
  if found and old_hash <> encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise exception 'INTERCLUB_SOURCE_CHANGED'; end if;$old$,
    $old$count(distinct x->>'name') from jsonb_array_elements(p->'teams') x$old$,
    $old$select t->>'name',t->>'club_code' from jsonb_array_elements(p->'teams') t on conflict(name) do nothing;
  select id into strict ta from public.teams where name=p->'teams'->0->>'name';
  select id into strict tb from public.teams where name=p->'teams'->1->>'name';$old$
  ];
  new_parts text[] := array[
    $new$old_hash text; old_payload jsonb; adopted boolean := false; n integer;$new$,
    $new$select payload_hash, payload into old_hash, old_payload from public.interclub_auto_publications where source_event_id=p->>'event_id';
  if found and old_hash <> encode(sha256(convert_to(p::text,'UTF8')),'hex')
     and public.interclub_team_payload(old_payload) is distinct from public.interclub_team_payload(p)
  then raise exception 'INTERCLUB_SOURCE_CHANGED'; end if;$new$,
    $new$count(distinct public.interclub_team_name(x->>'name')) from jsonb_array_elements(p->'teams') x$new$,
    $new$select public.interclub_team_name(t->>'name'),t->>'club_code' from jsonb_array_elements(p->'teams') t on conflict(name) do nothing;
  select id into strict ta from public.teams where name=public.interclub_team_name(p->'teams'->0->>'name');
  select id into strict tb from public.teams where name=public.interclub_team_name(p->'teams'->1->>'name');$new$
  ];
  team_name text;
  active_season uuid;
  index integer;
begin
  -- Use the publisher's season lock so old workers cannot race the rename.
  select id into active_season from public.seasons where name='2026-2027' and is_active;
  if active_season is not null then
    perform pg_advisory_xact_lock(hashtextextended('interclub:' || active_season::text, 0));
  end if;
  lock table public.teams in share row exclusive mode;
  select name into team_name from public.teams
    where id='9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3'::uuid for update;
  if not found or team_name not in ('3B Darts Club - B(londe)', '3B Darts Club - B(rune)') then
    raise exception 'BRUNE_TEAM_ID_OR_NAME_CHANGED';
  end if;
  if exists(select 1 from public.teams
      where name in ('3B Darts Club - B(londe)', '3B Darts Club - B(rune)')
      and id<>'9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3'::uuid) then
    raise exception 'BRUNE_DUPLICATE_TEAM';
  end if;

  definition := pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure);
  for index in 1..array_length(old_parts, 1) loop
    if strpos(definition, new_parts[index]) > 0 then
      if strpos(definition, old_parts[index]) > 0 then
        raise exception 'BRUNE_UNEXPECTED_PUBLISHER_DEFINITION';
      end if;
    elsif length(definition) - length(replace(definition, old_parts[index], '')) = length(old_parts[index]) then
      definition := replace(definition, old_parts[index], new_parts[index]);
    else
      raise exception 'BRUNE_UNEXPECTED_PUBLISHER_DEFINITION';
    end if;
  end loop;
  execute definition;
  update public.teams set name='3B Darts Club - B(rune)'
    where id='9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3'::uuid
      and name='3B Darts Club - B(londe)';
end $patch$;

revoke all on function public.publish_interclub_match(jsonb) from public, anon, authenticated;
grant execute on function public.publish_interclub_match(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
