-- Read-only diagnosis. Never resumes or publishes an event.
begin read only;
with current_versions as (
  select e.published_revision_id,r.*,
    exists(select 1 from public.ranking_workflow_decisions d
      where d.revision_id=r.id and d.fingerprint=r.fingerprint
        and d.actor_id=r.director_id and d.actor_role='SPORTS_DIRECTOR'
        and d.action='APPROVE_DS') as has_ds_validation,
    jsonb_array_length(r.snapshot->'blockers')=0
      and jsonb_array_length(r.snapshot->'results')>0
      and not exists(select 1 from jsonb_array_elements(r.snapshot->'results') x
        where (x->>'points')::integer>0 and nullif(x->>'identity_id','') is null)
      and not exists(select 1 from jsonb_array_elements(r.snapshot->'results') x
        where nullif(x->>'identity_id','') is not null
        group by x->>'identity_id' having count(*)>1) as technical_checks_pass
  from public.ranking_workflow_events e
  join public.ranking_workflow_revisions r on r.id=e.current_revision_id
)
select event_id,id as revision_id,number,status,
  snapshot->'metadata'->>'title' as title,
  published_revision_id,director_id,has_ds_validation,technical_checks_pass,
  snapshot->'blockers' as blockers,
  case
    when status='CORRECTION_REQUESTED' then 'EXPLICIT_CORRECTION_REQUIRED'
    when status='ARCHIVED' then 'ARCHIVED'
    when status='DRAFT' then 'ANALYSIS_REQUIRED'
    when not technical_checks_pass then 'TECHNICAL_BLOCKERS'
    when status='PUBLISHED' then 'ALREADY_PUBLISHED'
    when status='READY_TO_PUBLISH' then 'EXPLICIT_ADMIN_PUBLICATION_REQUIRED'
    when status in ('ANALYZED','PENDING_DS') and not has_ds_validation
      then 'OPTIONAL_DS_REVIEW__EXPLICIT_ADMIN_CHECK_REQUIRED'
    else 'EXPLICIT_ADMIN_CHECK_REQUIRED'
  end as next_step
from current_versions order by created_at,event_id;
commit;
