-- Apply and commit before the workflow migration. Existing Supabase Auth is retained.
alter type public.app_role add value if not exists 'SPORTS_DIRECTOR';
-- Personal profile edits must never change a role or sporting association.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
