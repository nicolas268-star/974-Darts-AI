
-- Sprint 1 / v0.6 : droits complémentaires pour l'authentification.

create policy "admins read all profiles"
on public.profiles for select
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
);

create policy "admins update profiles"
on public.profiles for update
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
);

create policy "users update own display name"
on public.profiles for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
