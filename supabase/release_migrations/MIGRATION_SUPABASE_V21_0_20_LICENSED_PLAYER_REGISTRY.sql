-- Registre officiel des licenciés Comité 974 pour la saison 2026-2027.
-- La source brute reste conservée et les anciennes appellations deviennent des alias.

begin;

-- La fonction existante est appelée pendant toute la migration. Un chemin de
-- recherche explicite évite qu'un objet homonyme placé dans un autre schéma
-- soit résolu à sa place.
alter function public.normalize_player_alias(text)
  set search_path = pg_catalog, public, extensions;

create table if not exists public.committee_clubs (
  code text primary key,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.committee_clubs (code, name)
values
  ('KAD', 'Kaz A Darts 974'),
  ('PDC', 'Papangue Darts Club'),
  ('3BDC', '3B Darts Club'),
  ('TDC', 'Tampon Darts Club')
on conflict (code) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

alter table public.teams
  add column if not exists official_club_code text
  references public.committee_clubs(code) on update cascade on delete set null;

create index if not exists teams_official_club_code_idx
  on public.teams(official_club_code);

update public.teams
set official_club_code = case
  when name in ('Kazadarts A', 'Kazadarts B') then 'KAD'
  when name in ('Fournaise', 'Neige', 'PDC Fournaise', 'PDC Neige') then 'PDC'
  when name = '3BDC' then '3BDC'
  when name = 'TDC' then 'TDC'
  else official_club_code
end
where official_club_code is null;

create table if not exists public.committee_licensed_players (
  id uuid primary key default gen_random_uuid(),
  season_key text not null,
  official_last_name text not null,
  official_first_name text not null,
  official_display_name text not null,
  official_source_name text not null,
  normalized_official_name text not null,
  club_code text not null references public.committee_clubs(code)
    on update cascade on delete restrict,
  identity_id uuid references public.player_identities(id)
    on update cascade on delete set null,
  license_status text not null default 'ACTIVE'
    check (license_status in ('ACTIVE', 'INACTIVE')),
  source_label text not null,
  source_url text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_key, normalized_official_name)
);

create unique index if not exists committee_licensed_players_season_identity_idx
  on public.committee_licensed_players(season_key, identity_id)
  where identity_id is not null;

create index if not exists committee_licensed_players_club_idx
  on public.committee_licensed_players(season_key, club_code, official_last_name);

create index if not exists committee_licensed_players_club_code_idx
  on public.committee_licensed_players(club_code);

create index if not exists committee_licensed_players_identity_idx
  on public.committee_licensed_players(identity_id);

alter table public.committee_ranking_results
  add column if not exists identity_id uuid
  references public.player_identities(id) on update cascade on delete set null;

create index if not exists committee_ranking_results_identity_idx
  on public.committee_ranking_results(identity_id);

alter table public.player_identity_events
  drop constraint if exists player_identity_events_event_type_check;
alter table public.player_identity_events
  add constraint player_identity_events_event_type_check
  check (event_type in (
    'IDENTITY_CREATED', 'ALIAS_LINKED', 'ALIAS_UNLINKED',
    'MEMBERSHIP_ADDED', 'MEMBERSHIP_UPDATED',
    'MERGE_REQUESTED', 'MERGE_APPLIED', 'OFFICIAL_NAME_CONFIRMED'
  ));

alter table public.player_aliases
  drop constraint if exists player_aliases_source_check;
alter table public.player_aliases
  add constraint player_aliases_source_check
  check (source in (
    'INITIAL_MIGRATION', 'MANUAL', 'NAKKA_IMPORT', 'ADMIN_MERGE',
    'COMMITTEE_LICENSE_REGISTRY'
  ));

with official_players(
  official_last_name, official_first_name, official_display_name,
  official_source_name, normalized_official_name, club_code
) as (
  values
    ('GRASSET', 'Emmanuel', 'Emmanuel GRASSET', 'GRASSET Emmanuel', 'emmanuelgrasset', 'KAD'),
    ('DURUISSEAU', 'Nicolas', 'Nicolas DURUISSEAU', 'DURUISSEAU Nicolas', 'nicolasduruisseau', 'KAD'),
    ('DUPONT', 'Nicolas', 'Nicolas DUPONT', 'DUPONT Nicolas', 'nicolasdupont', 'PDC'),
    ('GUINOBERT', 'Fabien', 'Fabien GUINOBERT', 'GUINOBERT Fabien', 'fabienguinobert', 'PDC'),
    ('THOMAS', 'Esteban', 'Esteban THOMAS', 'THOMAS Esteban', 'estebanthomas', '3BDC'),
    ('CANTY', 'Dominique', 'Dominique CANTY', 'CANTY Dominique', 'dominiquecanty', 'KAD'),
    ('BERTLER', 'Pierre', 'Pierre BERTLER', 'BERTLER Pierre', 'pierrebertler', 'PDC'),
    ('SANZ VILLAR', 'Alexandre', 'Alexandre SANZ VILLAR', 'SANZ VILLAR Alexandre', 'alexandresanzvillar', 'PDC'),
    ('MARQUES', 'Yoann', 'Yoann MARQUES', 'MARQUES Yoann', 'yoannmarques', 'KAD'),
    ('GEFFROY', 'Yvan', 'Yvan GEFFROY', 'GEFFROY Yvan', 'yvangeffroy', 'KAD'),
    ('GUILLAUMOND', 'Vincent', 'Vincent GUILLAUMOND', 'GUILLAUMOND Vincent', 'vincentguillaumond', 'TDC'),
    ('LARRIEU', 'Julien', 'Julien LARRIEU', 'LARRIEU Julien', 'julienlarrieu', 'KAD'),
    ('MAGARIAN', 'Hugo', 'Hugo MAGARIAN', 'MAGARIAN Hugo', 'hugomagarian', 'KAD'),
    ('AUBERT', 'Vincent', 'Vincent AUBERT', 'AUBERT Vincent', 'vincentaubert', '3BDC'),
    ('BEAUR', 'Étienne', 'Étienne BEAUR', 'BEAUR Étienne', 'etiennebeaur', 'PDC'),
    ('BROUAZIN', 'Corentin', 'Corentin BROUAZIN', 'BROUAZIN Corentin', 'corentinbrouazin', 'PDC'),
    ('BRUNET', 'Benoit', 'Benoit BRUNET', 'BRUNET Benoit', 'benoitbrunet', '3BDC'),
    ('CHOUPEAULT', 'Benoit', 'Benoit CHOUPEAULT', 'CHOUPEAULT Benoit', 'benoitchoupeault', 'PDC'),
    ('DESCHRYVER', 'David', 'David DESCHRYVER', 'DESCHRYVER David', 'daviddeschryver', '3BDC'),
    ('FAUCHER', 'Julien', 'Julien FAUCHER', 'FAUCHER Julien', 'julienfaucher', 'PDC'),
    ('FERNANDEZ', 'Christophe', 'Christophe FERNANDEZ', 'FERNANDEZ Christophe', 'christophefernandez', 'PDC'),
    ('LUCHTENHAHN', 'Adrien', 'Adrien LUCHTENHAHN', 'LUCHTENHAHN Adrien', 'adrienluchtenhahn', 'PDC'),
    ('PARET', 'Caroline', 'Caroline PARET', 'PARET Caroline', 'carolineparet', '3BDC'),
    ('PARET', 'Laurent', 'Laurent PARET', 'PARET Laurent', 'laurentparet', '3BDC'),
    ('PERPILLAT', 'Stephan', 'Stephan PERPILLAT', 'PERPILLAT Stephan', 'stephanperpillat', '3BDC'),
    ('ROCHE', 'Martin', 'Martin ROCHE', 'ROCHE Martin', 'martinroche', '3BDC'),
    ('ROUSSETTE', 'Patrick', 'Patrick ROUSSETTE', 'ROUSSETTE Patrick', 'patrickroussette', '3BDC'),
    ('TECHER', 'Harold', 'Harold TECHER', 'TECHER Harold', 'haroldtecher', '3BDC'),
    ('TECHER', 'Ulrich', 'Ulrich TECHER', 'TECHER Ulrich', 'ulrichtecher', '3BDC'),
    ('VERDIER', 'Jacky', 'Jacky VERDIER', 'VERDIER Jacky', 'jackyverdier', '3BDC'),
    ('VOLTOLINI', 'Marco', 'Marco VOLTOLINI', 'VOLTOLINI Marco', 'marcovoltolini', '3BDC'),
    ('VERIN', 'Gregory', 'Gregory VERIN', 'VERIN Gregory', 'gregoryverin', 'KAD'),
    ('BIGNON', 'William', 'William BIGNON', 'BIGNON William', 'williambignon', 'KAD'),
    ('CABANES', 'Frédéric', 'Frédéric CABANES', 'CABANES Frédéric', 'fredericcabanes', 'KAD'),
    ('JACOB', 'Antoine', 'Antoine JACOB', 'JACOB Antoine', 'antoinejacob', 'KAD'),
    ('MAGARIAN', 'Hervé', 'Hervé MAGARIAN', 'MAGARIAN Hervé', 'hervemagarian', 'KAD'),
    ('OLIVIER', 'Ambroise', 'Ambroise OLIVIER', 'OLIVIER Ambroise', 'ambroiseolivier', 'KAD'),
    ('SIBERIL', 'Mickaël', 'Mickaël SIBERIL', 'SIBERIL Mickaël', 'mickaelsiberil', 'KAD'),
    ('HOARAU', 'Guillaume', 'Guillaume HOARAU', 'HOARAU Guillaume', 'guillaumehoarau', 'TDC'),
    ('ECALLE', 'Beverley', 'Beverley ECALLE', 'ECALLE Beverley', 'beverleyecalle', 'TDC'),
    ('FONTAINE', 'Dominique', 'Dominique FONTAINE', 'FONTAINE Dominique', 'dominiquefontaine', 'TDC'),
    ('CHARNEAU', 'Elodie', 'Elodie CHARNEAU', 'CHARNEAU Elodie', 'elodiecharneau', 'TDC'),
    ('JOUGLET', 'Laurent', 'Laurent JOUGLET', 'JOUGLET Laurent', 'laurentjouglet', 'TDC'),
    ('COUILLON', 'Maxime', 'Maxime COUILLON', 'COUILLON Maxime', 'maximecouillon', 'TDC'),
    ('DUBOURDIEU', 'Benjamin', 'Benjamin DUBOURDIEU', 'DUBOURDIEU Benjamin', 'benjamindubourdieu', 'TDC'),
    ('BARRET', 'Kévin', 'Kévin BARRET', 'BARRET Kévin', 'kevinbarret', 'TDC'),
    ('PAYET', 'Coralie', 'Coralie PAYET', 'PAYET Coralie', 'coraliepayet', 'TDC'),
    ('DEVILLE', 'Marie', 'Marie DEVILLE', 'DEVILLE Marie', 'mariedeville', 'TDC'),
    ('DEVILLE', 'Gary', 'Gary DEVILLE', 'DEVILLE Gary', 'garydeville', 'TDC'),
    ('RIVIERE', 'Jean François', 'Jean François RIVIERE', 'RIVIERE Jean François', 'jeanfrancoisriviere', 'TDC'),
    ('ARBOUSSE', 'Stéphane', 'Stéphane ARBOUSSE', 'ARBOUSSE Stéphane', 'stephanearbousse', 'TDC')
)
insert into public.committee_licensed_players (
  season_key, official_last_name, official_first_name, official_display_name,
  official_source_name, normalized_official_name, club_code, source_label
)
select
  '2026-2027', official_last_name, official_first_name, official_display_name,
  official_source_name, normalized_official_name, club_code,
  'Comité de Fléchettes de La Réunion · classement individuel après Open Club #1 Kaz A Darts'
from official_players
on conflict (season_key, normalized_official_name) do update
set official_last_name = excluded.official_last_name,
    official_first_name = excluded.official_first_name,
    official_display_name = excluded.official_display_name,
    official_source_name = excluded.official_source_name,
    club_code = excluded.club_code,
    license_status = 'ACTIVE',
    source_label = excluded.source_label,
    verified_at = now(),
    updated_at = now();

-- Rapprochements sûrs : prénom/surnom déjà contrôlé, club cohérent et,
-- pour les classés, ordre et points identiques à la publication officielle.
with identity_links(normalized_official_name, legacy_display_name) as (
  values
    ('emmanuelgrasset', 'Manu'),
    ('nicolasduruisseau', 'Dudul'),
    ('nicolasdupont', 'Nico'),
    ('fabienguinobert', 'Fabien'),
    ('estebanthomas', 'Esteban'),
    ('dominiquecanty', 'Domi'),
    ('pierrebertler', 'Pierre'),
    ('alexandresanzvillar', 'Alex'),
    ('yoannmarques', 'Yoann'),
    ('yvangeffroy', 'Yvan'),
    ('vincentguillaumond', 'Vincent G'),
    ('julienlarrieu', 'Ju'),
    ('hugomagarian', 'Hugo'),
    ('vincentaubert', 'Vincent'),
    ('etiennebeaur', 'Etienne'),
    ('corentinbrouazin', 'Corentin'),
    ('benoitbrunet', 'Benoit'),
    ('benoitchoupeault', 'Ben'),
    ('daviddeschryver', 'David'),
    ('julienfaucher', 'Julien'),
    ('adrienluchtenhahn', 'Adrien'),
    ('stephanperpillat', 'Stephan'),
    ('patrickroussette', 'Patrick'),
    ('haroldtecher', 'Harold'),
    ('ulrichtecher', 'Ulrich'),
    ('jackyverdier', 'Jacky'),
    ('marcovoltolini', 'Marco'),
    ('gregoryverin', 'Greg'),
    ('williambignon', 'Willou'),
    ('fredericcabanes', 'Cabanes'),
    ('antoinejacob', 'Antoine'),
    ('hervemagarian', 'Hervé'),
    ('ambroiseolivier', 'Ambroise'),
    ('mickaelsiberil', 'Micka'),
    ('guillaumehoarau', 'Guillaume'),
    ('beverleyecalle', 'Beverley'),
    ('elodiecharneau', 'Elodie'),
    ('benjamindubourdieu', 'Benjamin'),
    ('kevinbarret', 'Kevin'),
    ('garydeville', 'Gary'),
    ('stephanearbousse', 'Stéphane A')
), resolved as (
  select licensed.id as licensed_id, identity.id as identity_id
  from identity_links link
  join public.committee_licensed_players licensed
    on licensed.season_key = '2026-2027'
   and licensed.normalized_official_name = link.normalized_official_name
  join public.player_identities identity
    on identity.status = 'ACTIVE'
   and identity.canonical_display_name = link.legacy_display_name
)
update public.committee_licensed_players licensed
set identity_id = resolved.identity_id,
    updated_at = now()
from resolved
where licensed.id = resolved.licensed_id;

do $$
begin
  if (
    select count(*)
    from public.committee_licensed_players
    where season_key = '2026-2027' and identity_id is not null
  ) <> 41 then
    raise exception
      'Registre licenciés : 41 rapprochements existants attendus avant création des nouvelles fiches.';
  end if;
end
$$;

do $$
declare
  licensed record;
  new_player_id uuid;
  new_identity_id uuid;
begin
  -- Les licenciés sans rapprochement certain obtiennent une fiche officielle
  -- distincte. Aucun ancien surnom n'est fusionné par simple ressemblance.
  for licensed in
    select *
    from public.committee_licensed_players
    where season_key = '2026-2027' and identity_id is null
    order by official_display_name
  loop
    insert into public.players (display_name, team_id, public_profile)
    values (licensed.official_display_name, null, true)
    returning id into new_player_id;

    insert into public.player_identities (
      canonical_player_id, canonical_display_name, notes
    ) values (
      new_player_id,
      licensed.official_display_name,
      'Identité créée depuis le registre officiel des licenciés 2026-2027.'
    ) returning id into new_identity_id;

    insert into public.player_aliases (
      identity_id, source_player_id, alias_name,
      source, confidence, confirmed
    ) values (
      new_identity_id, new_player_id, licensed.official_display_name,
      'COMMITTEE_LICENSE_REGISTRY', 100, true
    );

    update public.committee_licensed_players
    set identity_id = new_identity_id, updated_at = now()
    where id = licensed.id;
  end loop;
end
$$;

do $$
begin
  if (
    select count(*)
    from public.committee_licensed_players
    where season_key = '2026-2027'
      and license_status = 'ACTIVE'
      and identity_id is not null
  ) <> 51 then
    raise exception
      'Registre licenciés : les 51 fiches officielles n''ont pas toutes une identité.';
  end if;
end
$$;

-- Le nom officiel devient l'affichage canonique. Le surnom historique reste
-- présent dans player_aliases et continue de résoudre les anciens résultats.
update public.player_identities identity
set canonical_display_name = licensed.official_display_name,
    notes = concat_ws(E'\n', nullif(identity.notes, ''),
      'Nom officiel confirmé par le registre des licenciés Comité 974 2026-2027.'),
    updated_at = now()
from public.committee_licensed_players licensed
where licensed.season_key = '2026-2027'
  and licensed.identity_id = identity.id;

update public.players player
set display_name = licensed.official_display_name
from public.player_identities identity
join public.committee_licensed_players licensed
  on licensed.identity_id = identity.id
 and licensed.season_key = '2026-2027'
where player.id = identity.canonical_player_id;

insert into public.player_aliases (
  identity_id, source_player_id, alias_name,
  source, confidence, confirmed
)
select
  licensed.identity_id,
  identity.canonical_player_id,
  licensed.official_display_name,
  'COMMITTEE_LICENSE_REGISTRY',
  100,
  true
from public.committee_licensed_players licensed
join public.player_identities identity on identity.id = licensed.identity_id
where licensed.season_key = '2026-2027'
on conflict (identity_id, normalized_alias) do update
set alias_name = excluded.alias_name,
    source = excluded.source,
    confidence = 100,
    confirmed = true;

insert into public.player_identity_events (identity_id, event_type, payload)
select
  licensed.identity_id,
  'OFFICIAL_NAME_CONFIRMED',
  jsonb_build_object(
    'season_key', licensed.season_key,
    'official_display_name', licensed.official_display_name,
    'club_code', licensed.club_code,
    'source', licensed.source_label
  )
from public.committee_licensed_players licensed
where licensed.season_key = '2026-2027'
  and not exists (
    select 1
    from public.player_identity_events event
    where event.identity_id = licensed.identity_id
      and event.event_type = 'OFFICIAL_NAME_CONFIRMED'
      and event.payload ->> 'season_key' = licensed.season_key
  );

-- L'événement déjà publié garde son texte source, mais pointe désormais vers
-- l'identité canonique. Les non-licenciés restent volontairement sans lien.
update public.committee_ranking_results result
set club = '3B Darts Club'
where club = '3 B Darts Club';

with alias_match as (
  select result.id as result_id, min(alias.identity_id::text)::uuid as identity_id
  from public.committee_ranking_results result
  join public.player_aliases alias
    on lower(alias.alias_name) = lower(result.player_name)
   and alias.confirmed = true
  join public.committee_licensed_players licensed
    on licensed.identity_id = alias.identity_id
   and licensed.season_key = '2026-2027'
   and licensed.license_status = 'ACTIVE'
  group by result.id
  having count(distinct alias.identity_id) = 1
)
update public.committee_ranking_results result
set identity_id = alias_match.identity_id
from alias_match
where result.id = alias_match.result_id;

alter table public.committee_clubs enable row level security;
alter table public.committee_licensed_players enable row level security;

revoke all on table public.committee_clubs from anon, authenticated;
revoke all on table public.committee_licensed_players from anon, authenticated;
grant select on table public.committee_clubs to anon, authenticated;
grant select on table public.committee_licensed_players to anon, authenticated;
grant select, insert, update, delete on table public.committee_clubs to service_role;
grant select, insert, update, delete on table public.committee_licensed_players to service_role;

drop policy if exists "Public reads official committee clubs" on public.committee_clubs;
create policy "Public reads official committee clubs"
  on public.committee_clubs for select to anon, authenticated using (true);

drop policy if exists "Public reads active licensed players" on public.committee_licensed_players;
create policy "Public reads active licensed players"
  on public.committee_licensed_players for select to anon, authenticated
  using (license_status = 'ACTIVE');

commit;
