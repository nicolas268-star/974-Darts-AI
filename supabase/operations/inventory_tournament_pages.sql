-- READ ONLY. Capture before and after deployment; no ranking publication occurs.
select e.id,e.source_id,e.discipline,e.season_key,e.published_revision_id,
 r.number as published_version,r.status,
 jsonb_array_length(coalesce(r.snapshot->'results','[]'::jsonb)) as published_results,
 (select sum((item->>'points')::numeric) from jsonb_array_elements(coalesce(r.snapshot->'results','[]'::jsonb)) item) as published_points,
 encode(sha256(convert_to((r.snapshot->'results')::text,'UTF8')),'hex') as published_results_sha256,
 jsonb_array_length(coalesce(r.snapshot->'source'->'matches','[]'::jsonb)) as snapshot_matches,
 jsonb_array_length(coalesce(r.snapshot->'source'->'participants','[]'::jsonb)) as snapshot_participants
from public.ranking_workflow_events e
left join public.ranking_workflow_revisions r on r.id=e.published_revision_id
where e.published_revision_id is not null
order by e.created_at;

-- Run these after installing the additive migration.
select p.source_id,p.discipline,p.code,p.official_revision_id,p.source_hash,
 p.payload->>'classification' as classification,
 p.payload->'summary' as summary,p.updated_at
from public.tournament_pages p order by p.updated_at desc;
select event_id,state,attempts,error from public.tournament_page_jobs order by updated_at;
