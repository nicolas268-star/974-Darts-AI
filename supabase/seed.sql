
insert into public.clubs(name) values ('Papangue Dart Club') on conflict do nothing;
insert into public.teams(name, club_id)
select 'Fournaise', id from public.clubs where name='Papangue Dart Club'
on conflict do nothing;
insert into public.teams(name, club_id)
select 'Neige', id from public.clubs where name='Papangue Dart Club'
on conflict do nothing;

insert into public.players(display_name, team_id, public_profile)
select 'Nico', id, true from public.teams where name='Fournaise'
on conflict do nothing;
insert into public.players(display_name, team_id, public_profile)
select 'Pierre', id, true from public.teams where name='Fournaise'
on conflict do nothing;
insert into public.players(display_name, team_id, public_profile)
select 'Alex', id, true from public.teams where name='Fournaise'
on conflict do nothing;

insert into public.seasons(name, is_active)
values ('Championnat 2026', true)
on conflict do nothing;
