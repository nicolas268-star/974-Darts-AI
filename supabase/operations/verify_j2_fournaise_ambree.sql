-- Read-only post-apply checks. Expected: Ambrée 5–15 Fournaise, 20 matches,
-- 47 legs (15–32), 118 statistic rows; Simple 16 (stored #18) 0–2.
select cr.id result_id,e.id encounter_id,cr.natural_key,cr.home_score,cr.away_score,
  h.name home,a.name away,
  (select count(*) from public.matches m where m.encounter_id=e.id) matches,
  (select count(*) from public.legs l join public.matches m on m.id=l.match_id where m.encounter_id=e.id) legs,
  (select count(*) from public.player_leg_stats st join public.legs l on l.id=st.leg_id join public.matches m on m.id=l.match_id where m.encounter_id=e.id) statistic_rows
from public.championship_results cr join public.encounters e on e.natural_key=cr.natural_key
join public.teams h on h.id=cr.home_team_id join public.teams a on a.id=cr.away_team_id
where cr.natural_key='2026-2027|J2|nakka:t_uAfU_5679';

select m.id match_id,m.match_number,m.mode,p.display_name,st.player_id,
  count(*) legs_played,count(*) filter(where st.leg_won) legs_won,m.winner_team_id
from public.matches m join public.legs l on l.match_id=m.id join public.player_leg_stats st on st.leg_id=l.id
join public.players p on p.id=st.player_id
where m.natural_key='2026-2027|J2|nakka:t_uAfU_5679|8jsiG9Na_1791996900443'
group by m.id,m.match_number,m.mode,p.display_name,st.player_id,m.winner_team_id;

select tm.id,tm.identity_id,t.name usual_team,tm.season_id,tm.source from public.player_team_memberships tm
join public.teams t on t.id=tm.team_id where tm.identity_id='45f23d50-2f77-4ef4-983c-2cca7f5a425f';

select source_event_id,result_id,published_at,payload_hash,payload->'result_corrections' correction,
  payload->'source_snapshot'->'score' original_score,payload->'score' corrected_score
from public.interclub_auto_publications where source_event_id='t_uAfU_5679';
