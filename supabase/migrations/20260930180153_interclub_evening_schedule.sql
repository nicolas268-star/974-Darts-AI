-- Preserve the installed publication function and all validation/permissions.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure);
  old_guard text := $guard$time '23:50'$guard$;
  new_guard text := $guard$time '22:00'$guard$;
begin
  if strpos(definition, old_guard) > 0 then
    execute replace(definition, old_guard, new_guard);
  elsif strpos(definition, new_guard) = 0 then
    raise exception 'INTERCLUB_SCHEDULE_GUARD_NOT_FOUND';
  end if;
end $migration$;
revoke all on function public.publish_interclub_match(jsonb) from public, anon, authenticated;
grant execute on function public.publish_interclub_match(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
