# A018 — Optimisation des politiques RLS

## Périmètre

A018 traite les constats F-031 et F-032 de l’audit :

- 14 politiques recalculent `auth.uid()` ou une fonction d’identité par ligne.
- 36 alertes signalent des politiques permissives qui se chevauchent.

## Principe de modification

- Les fonctions d’identité indépendantes de la ligne sont mises dans un `select` afin de créer un init plan par requête.
- Les accès joueur, capitaine et administrateur sont fusionnés par rôle et action avec les mêmes conditions reliées par `OR`.
- Les anciennes politiques `ALL` sont remplacées par des politiques d’action précises.
- Les helpers de session live restent inchangés. Ils incluent déjà le propriétaire.
- Les droits propriétaire distincts sont conservés pour INSERT, DELETE ou UPDATE lorsqu’aucune politique de session équivalente n’existe.

## Séquence sécurisée

1. Exécuter `VERIFY_SUPABASE_A018_RLS_OPTIMIZATION.sql` avant la migration et conserver le résultat.
2. Vérifier que le préflight de la migration correspond encore au schéma.
3. Appliquer `MIGRATION_SUPABASE_A018_RLS_OPTIMIZATION.sql` dans une transaction.
4. Réexécuter le script VERIFY.
5. Lancer les Advisors Supabase performance et sécurité.
6. Exécuter les tests anon, joueur, capitaine, admin, propriétaire et scorer.
7. En cas d’écart, appliquer immédiatement `ROLLBACK_SUPABASE_A018_RLS_OPTIMIZATION.sql`.

## Critères de validation

- Aucun accès existant n’est élargi.
- Les parcours publics, joueur, capitaine, admin et jeu live restent opérationnels.
- Les alertes `auth_rls_initplan` couvertes par A018 disparaissent.
- Les alertes `multiple_permissive_policies` couvertes par A018 disparaissent.
- Aucun nouvel avertissement de sécurité RLS n’apparaît.
