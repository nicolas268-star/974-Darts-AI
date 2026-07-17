# Correctif v0.8.1 — Pagination Supabase

## Problème corrigé

La publication créait plus de 1 000 legs, mais la requête de récupération
des identifiants ne renvoyait que les 1 000 premières lignes. Le backend
levait ensuite un `KeyError` sur un leg situé après cette limite.

## Installation

1. Fermer FastAPI avec `Ctrl + C`.
2. Copier les trois fichiers de ce patch à la racine du projet v0.8,
   au même niveau que `package.json`.
3. Double-cliquer sur `APPLIQUER_CORRECTIF_V0_8_1.bat`.
4. Relancer le backend FastAPI.
5. Relancer Next.js si nécessaire.
6. Revenir dans Administration et cliquer de nouveau sur `Publier`.

Le patch ajoute aussi un traceback complet dans la console FastAPI pour
les futures erreurs.

## Données déjà partiellement publiées

La publication utilise des `upsert` et des clés naturelles. Relancer le
même fichier doit reprendre et mettre à jour les données sans dupliquer
les saisons, équipes, joueurs, rencontres, matchs ou legs.
