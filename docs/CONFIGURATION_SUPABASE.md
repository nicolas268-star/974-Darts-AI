# Configuration Supabase — Sprint 1 v0.6

## 1. Créer le projet

Créer un projet Supabase, puis ouvrir **SQL Editor**.

Exécuter dans cet ordre :

1. `supabase/schema.sql`
2. `supabase/migration_v0_6_auth.sql`
3. `supabase/seed.sql`

## 2. Copier les clés

Dans Supabase : **Project Settings → API**.

Créer `.env.local` à partir de `.env.example`, puis renseigner :

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

La clé `SUPABASE_SERVICE_ROLE_KEY` doit rester uniquement dans `.env.local`.
Elle ne doit jamais être publiée dans Git ni préfixée par `NEXT_PUBLIC_`.

## 3. Configurer les redirections

Dans Supabase : **Authentication → URL Configuration**.

Pour le test local :

- Site URL : `http://localhost:3000`
- Redirect URL : `http://localhost:3000/auth/callback`

Pour le futur site en ligne, ajouter également son domaine.

## 4. Configurer les emails

Dans **Authentication → Email Templates**, personnaliser :

- Invite user
- Reset password
- Confirm signup

Pour une utilisation réelle avec plusieurs joueurs, configurer un SMTP personnalisé.

## 5. Créer le premier administrateur

1. Créer un utilisateur dans Supabase Authentication.
2. Copier son UUID.
3. Exécuter :

```sql
update public.profiles
set role = 'ADMIN', display_name = 'Nicolas'
where user_id = 'UUID_UTILISATEUR';
```

## 6. Tester

- connexion ;
- déconnexion ;
- accès `/player` ;
- accès `/team` avec un rôle PLAYER : refus attendu ;
- mot de passe oublié ;
- invitation depuis l'API administrateur.
