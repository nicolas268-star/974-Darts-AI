-- Isolated schema matching the columns/keys used by the interclub publisher.
create role anon; create role authenticated; create role service_role bypassrls;
create table seasons(id uuid primary key default gen_random_uuid(),name text unique,is_active boolean);
create table committee_clubs(code text primary key);
insert into committee_clubs values ('KAD'),('PDC'),('TDC'),('3BDC');
create table teams(id uuid primary key default gen_random_uuid(),name text unique not null,official_club_code text references committee_clubs);
create table players(id uuid primary key,display_name text not null);
create table player_identities(id uuid primary key,canonical_player_id uuid unique references players,canonical_display_name text,status text);
create table committee_licensed_players(id uuid primary key default gen_random_uuid(),season_key text,identity_id uuid references player_identities,
  license_status text,club_code text references committee_clubs,official_display_name text,official_source_name text,unique(season_key,identity_id));
create table rounds(id uuid primary key default gen_random_uuid(),season_id uuid references seasons,code text,played_on date,published boolean,unique(season_id,code));
create table imports(id uuid primary key default gen_random_uuid(),filename text not null,status text,rows_count int,file_sha256 text,analysis_json jsonb,published_at timestamptz);
create table encounters(id uuid primary key default gen_random_uuid(),round_id uuid references rounds,natural_key text unique not null,name text,
  home_team_id uuid references teams,away_team_id uuid references teams,import_id uuid references imports);
create table matches(id uuid primary key default gen_random_uuid(),encounter_id uuid references encounters,natural_key text unique not null,
  match_number int,nakka_match_number int,mode text,team_1_id uuid references teams,team_2_id uuid references teams,winner_team_id uuid references teams,import_id uuid references imports);
create table legs(id uuid primary key default gen_random_uuid(),match_id uuid references matches,natural_key text unique not null,leg_number int,
  winner_team_id uuid references teams,status text,import_id uuid references imports);
create table player_leg_stats(id uuid primary key default gen_random_uuid(),leg_id uuid references legs,player_id uuid references players,team_id uuid references teams,
  score int,darts_thrown int,average_3_darts numeric,first_9 numeric,finish int,scores_180 int,scores_170 int,scores_140 int,scores_100 int,scores_80 int,
  no_score int,leg_won boolean,import_id uuid references imports,unique(leg_id,player_id));
create table championship_results(id uuid primary key default gen_random_uuid(),natural_key text unique not null,season_id uuid references seasons,round_id uuid references rounds,
  home_team_id uuid references teams,away_team_id uuid references teams,home_score int check(home_score>=0),away_score int check(away_score>=0),
  detail_status text,quality_status text,quality_note text,source_sheet text,forfeit_team_id uuid references teams,check(home_team_id<>away_team_id));
create table player_profiles(id uuid primary key default gen_random_uuid(),player_id uuid references players,season_id uuid references seasons,
  legs_played int,legs_won int,average_3_darts numeric,first_9 numeric,best_finish int,summary text,updated_at timestamptz default now(),unique(player_id,season_id));
create table player_team_memberships(id uuid primary key default gen_random_uuid(),identity_id uuid references player_identities,team_id uuid references teams,
  season_id uuid references seasons,valid_from date,is_current boolean,source text,notes text);
grant select,insert,update on all tables in schema public to service_role;
