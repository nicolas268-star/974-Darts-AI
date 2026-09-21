-- Aligne les identités canoniques sur la composition officielle 2026/2027.
-- Les alias Nakka existants (Pierre, Adrien, Stephan, etc.) restent attachés
-- aux mêmes identités : aucune statistique historique n'est réécrite.

begin;

with corrections(old_normalized_name, last_name, first_name, display_name, source_name, normalized_name) as (
  values
    ('pierrebertler', 'BERLET', 'Pierre', 'Pierre BERLET', 'BERLET Pierre', 'pierreberlet'),
    ('etiennebeaur', 'BEAUR', 'Etienne', 'Etienne BEAUR', 'BEAUR Etienne', 'etiennebeaur'),
    ('adrienluchtenhahn', 'LICHTENHAHN', 'Adrien', 'Adrien LICHTENHAHN', 'LICHTENHAHN Adrien', 'adrienlichtenhahn'),
    ('stephanperpillat', 'PERRIAU', 'Stephan', 'Stephan PERRIAU', 'PERRIAU Stephan', 'stephanperriau'),
    ('ulrichtecher', 'TECHER', 'Uldrich', 'Uldrich TECHER', 'TECHER Uldrich', 'uldrichtecher'),
    ('stephanearbousse', 'ABROUSSE', 'Stéphane', 'Stéphane ABROUSSE', 'ABROUSSE Stéphane', 'stephaneabrousse')
), updated as (
  update public.committee_licensed_players licensed
  set official_last_name = correction.last_name,
      official_first_name = correction.first_name,
      official_display_name = correction.display_name,
      official_source_name = correction.source_name,
      normalized_official_name = correction.normalized_name,
      source_label = 'Composition officielle des équipes 2026/2027',
      verified_at = now(),
      updated_at = now()
  from corrections correction
  where licensed.season_key = '2026-2027'
    and licensed.normalized_official_name = correction.old_normalized_name
  returning licensed.identity_id, correction.display_name
)
update public.player_identities identity
set canonical_display_name = updated.display_name,
    notes = concat_ws(E'\n', nullif(identity.notes, ''),
      'Orthographe confirmée par la composition officielle des équipes 2026/2027.'),
    updated_at = now()
from updated
where identity.id = updated.identity_id;

update public.players player
set display_name = identity.canonical_display_name
from public.player_identities identity
join public.committee_licensed_players licensed on licensed.identity_id = identity.id
where player.id = identity.canonical_player_id
  and licensed.season_key = '2026-2027'
  and licensed.normalized_official_name in (
    'pierreberlet', 'etiennebeaur', 'adrienlichtenhahn',
    'stephanperriau', 'uldrichtecher', 'stephaneabrousse'
  );

do $$
begin
  if (
    select count(*)
    from public.committee_licensed_players
    where season_key = '2026-2027'
      and normalized_official_name in (
        'pierreberlet', 'etiennebeaur', 'adrienlichtenhahn',
        'stephanperriau', 'uldrichtecher', 'stephaneabrousse'
      )
  ) <> 6 then
    raise exception 'Les six corrections orthographiques officielles n''ont pas toutes été appliquées.';
  end if;
end
$$;

commit;
