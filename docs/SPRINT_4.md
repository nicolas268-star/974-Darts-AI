# Sprint 4 — Core Championship

## Livré dans v0.10.0
- Classement dynamique reconstruit depuis les rencontres, matchs et legs publiés.
- Barème configurable par saison dans `competition_rules` (2026 : 3/2/1).
- Pages `/dashboard`, `/teams`, `/players` et `/admin/rules`.
- API FastAPI `/api/v1/ranking`, `/api/v1/competition-rules`, `/api/v1/players`.
- Pagination Supabase pour dépasser la limite de 1000 lignes.
- Règle métier Nakka documentée : un finish est un total de volée, jamais une combinaison de fléchettes.

## À compléter dans les versions suivantes du Sprint 4
- Pages détaillées équipe et joueur.
- Graphiques de progression par journée.
- ELO recalculé et expliqué.
- Transposition progressive de tous les visuels Power BI.
- Statistiques de doubles uniquement lorsqu’une source fiable fournit les tentatives et segments précis.
