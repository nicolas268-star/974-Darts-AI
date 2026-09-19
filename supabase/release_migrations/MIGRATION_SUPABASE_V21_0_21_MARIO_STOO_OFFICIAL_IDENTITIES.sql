-- Corrige deux identités officielles confirmées par le propriétaire du site.
-- Les statistiques historiques restent attachées à leurs joueurs sources :
-- la fusion ne déplace ni ne réécrit aucun leg.

begin;

do $$
declare
  mario_official_identity_id uuid;
  mario_official_player_id uuid;
  mario_historical_identity_id uuid;
  mario_historical_player_id uuid;
  stoo_official_identity_id uuid;
  stoo_official_player_id uuid;
  stoo_historical_identity_id uuid;
  stoo_historical_player_id uuid;
begin
  select licensed.identity_id, identity.canonical_player_id
    into mario_official_identity_id, mario_official_player_id
  from public.committee_licensed_players licensed
  join public.player_identities identity on identity.id = licensed.identity_id
  where licensed.season_key = '2026-2027'
    and licensed.normalized_official_name in ('mariedeville', 'mariodeville')
  order by (licensed.normalized_official_name = 'mariodeville') desc
  limit 1;

  if mario_official_identity_id is null then
    raise exception 'Identité officielle DEVILLE introuvable.';
  end if;

  select alias.identity_id, alias.source_player_id
    into mario_historical_identity_id, mario_historical_player_id
  from public.player_aliases alias
  join public.player_identities identity on identity.id = alias.identity_id
  where alias.normalized_alias = 'mario'
    and identity.status = 'ACTIVE'
    and alias.identity_id <> mario_official_identity_id
  order by alias.confirmed desc, alias.confidence desc, alias.created_at
  limit 1;

  if mario_historical_identity_id is null then
    select alias.source_player_id
      into mario_historical_player_id
    from public.player_aliases alias
    where alias.normalized_alias = 'mario'
      and alias.identity_id = mario_official_identity_id
    order by alias.confirmed desc, alias.confidence desc, alias.created_at
    limit 1;
  end if;

  update public.committee_licensed_players
  set official_first_name = 'Mario',
      official_display_name = 'Mario DEVILLE',
      official_source_name = 'DEVILLE Mario',
      normalized_official_name = 'mariodeville',
      club_code = 'TDC',
      verified_at = now(),
      updated_at = now()
  where season_key = '2026-2027'
    and identity_id = mario_official_identity_id;

  update public.player_identities
  set canonical_display_name = 'Mario DEVILLE',
      notes = concat_ws(E'\n', nullif(notes, ''),
        'Correction confirmée : Mario DEVILLE (alias historique Mario), TDC.'),
      updated_at = now()
  where id = mario_official_identity_id;

  update public.players official_player
  set display_name = 'Mario DEVILLE',
      team_id = coalesce(
        (select historical_player.team_id
         from public.players historical_player
         where historical_player.id = mario_historical_player_id),
        official_player.team_id
      )
  where official_player.id = mario_official_player_id;

  update public.player_aliases
  set alias_name = 'Mario DEVILLE',
      source = 'COMMITTEE_LICENSE_REGISTRY',
      confidence = 100,
      confirmed = true
  where identity_id = mario_official_identity_id
    and source_player_id = mario_official_player_id
    and normalized_alias in ('mariedeville', 'mariodeville');

  if mario_historical_identity_id is not null then
    perform public.merge_player_identities(
      p_keep_identity_id => mario_official_identity_id,
      p_merge_identity_id => mario_historical_identity_id,
      p_actor_id => null::uuid,
      p_notes => 'Mario confirmé comme Mario DEVILLE, licencié TDC.'
    );
  end if;

  select licensed.identity_id, identity.canonical_player_id
    into stoo_official_identity_id, stoo_official_player_id
  from public.committee_licensed_players licensed
  join public.player_identities identity on identity.id = licensed.identity_id
  where licensed.season_key = '2026-2027'
    and licensed.normalized_official_name = 'christophefernandez'
  limit 1;

  if stoo_official_identity_id is null then
    raise exception 'Identité officielle Christophe FERNANDEZ introuvable.';
  end if;

  select alias.identity_id, alias.source_player_id
    into stoo_historical_identity_id, stoo_historical_player_id
  from public.player_aliases alias
  join public.player_identities identity on identity.id = alias.identity_id
  where alias.normalized_alias = 'stoo'
    and identity.status = 'ACTIVE'
    and alias.identity_id <> stoo_official_identity_id
  order by alias.confirmed desc, alias.confidence desc, alias.created_at
  limit 1;

  if stoo_historical_identity_id is null then
    select alias.source_player_id
      into stoo_historical_player_id
    from public.player_aliases alias
    where alias.normalized_alias = 'stoo'
      and alias.identity_id = stoo_official_identity_id
    order by alias.confirmed desc, alias.confidence desc, alias.created_at
    limit 1;
  end if;

  update public.players official_player
  set team_id = coalesce(
        (select historical_player.team_id
         from public.players historical_player
         where historical_player.id = stoo_historical_player_id),
        official_player.team_id
      )
  where official_player.id = stoo_official_player_id;

  if stoo_historical_identity_id is not null then
    perform public.merge_player_identities(
      p_keep_identity_id => stoo_official_identity_id,
      p_merge_identity_id => stoo_historical_identity_id,
      p_actor_id => null::uuid,
      p_notes => 'Stoo confirmé comme Christophe FERNANDEZ, licencié PDC.'
    );
  end if;

  insert into public.player_identity_events (identity_id, event_type, payload)
  select mario_official_identity_id, 'OFFICIAL_NAME_CONFIRMED',
    jsonb_build_object(
      'season_key', '2026-2027',
      'official_display_name', 'Mario DEVILLE',
      'club_code', 'TDC',
      'historical_alias', 'Mario',
      'correction', 'Marie DEVILLE -> Mario DEVILLE'
    )
  where not exists (
    select 1 from public.player_identity_events event
    where event.identity_id = mario_official_identity_id
      and event.event_type = 'OFFICIAL_NAME_CONFIRMED'
      and event.payload ->> 'correction' = 'Marie DEVILLE -> Mario DEVILLE'
  );

  if not exists (
    select 1
    from public.committee_licensed_players licensed
    join public.player_identities identity on identity.id = licensed.identity_id
    join public.player_aliases alias on alias.identity_id = identity.id
    where licensed.season_key = '2026-2027'
      and licensed.normalized_official_name = 'mariodeville'
      and licensed.club_code = 'TDC'
      and identity.status = 'ACTIVE'
      and identity.canonical_display_name = 'Mario DEVILLE'
      and alias.normalized_alias = 'mario'
  ) then
    raise exception 'Échec du rapprochement Mario -> Mario DEVILLE.';
  end if;

  if not exists (
    select 1
    from public.committee_licensed_players licensed
    join public.player_identities identity on identity.id = licensed.identity_id
    join public.player_aliases alias on alias.identity_id = identity.id
    where licensed.season_key = '2026-2027'
      and licensed.normalized_official_name = 'christophefernandez'
      and licensed.club_code = 'PDC'
      and identity.status = 'ACTIVE'
      and identity.canonical_display_name = 'Christophe FERNANDEZ'
      and alias.normalized_alias = 'stoo'
  ) then
    raise exception 'Échec du rapprochement Stoo -> Christophe FERNANDEZ.';
  end if;

  if exists (
    select 1 from public.player_identities
    where status = 'ACTIVE'
      and canonical_display_name in ('Marie DEVILLE', 'Mario', 'Stoo')
  ) then
    raise exception 'Une ancienne identité est restée active.';
  end if;
end
$$;

commit;
