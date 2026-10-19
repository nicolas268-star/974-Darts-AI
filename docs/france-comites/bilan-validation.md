# Validation et récapitulatif — Comités France

## Vérifications locales

Python 3.12.14, dépendances backend préinstallées sous `.test-deps`, Node 24.18.0 et PGlite 0.3.14. Aucune dépendance ajoutée. Le frontend n'a pas été modifié ; aucune refonte ni nouvelle route publique.

- `python -m compileall -q app/backend/app` : réussi.
- `python -m unittest discover -s app/backend/tests -p test_france_discovery.py` : 33 tests spécifiques, fixtures synthétiques isolées. Pagination, filtres, timestamps, statuts, HTTP 429/Retry-After, erreurs HTTP avec enveloppe N01, reprise, interruptions, idempotence, corrections, refus des preuves insuffisantes et confidentialité.
- Suite backend sous Windows : 241 tests exécutables réussis ; deux modules existants ne sont pas importables sur Windows car ils importent `fcntl` (`test_interclub_analysis`, `test_match_day`). Ils restent dans la suite complète de CI Linux, sans remplacement fictif du verrou système.
- `node tests/workflow/france-discovery.test.mjs` : 41 contrôles SQL réussis, incluant RLS, droits de fonctions, unicité, préservation des décisions et corrections, rejet, journal immuable, rollback transactionnel et invariant sur des données sportives témoins.
- `node tests/workflow/database.test.mjs` : 51 contrôles existants réussis.
- `node tests/workflow/tournament-pages.test.mjs` : 65 contrôles existants réussis.
- `git diff --check` : réussi.
- `seed --dry-run --output test-results/france-dry-run` : réussi ; hash du fichier SQLite identique avant/après.

Le bac à sable Windows bloque aussi la socket locale utilisée par Starlette TestClient. Les tests backend complets exécutables ont donc été relancés hors de cette restriction, sans accès à une base distante. Les scripts SQL Interclubs existants appellent `python3` et requièrent également les modules Linux ; ils restent à exécuter dans la CI Linux. Les imports et règles Interclubs n'ont pas été modifiés.

## Collecte réelle

Commandes exécutées depuis la racine avec `PYTHONPATH=app/backend` et Python UTF-8 :

```text
python -m app.scripts.france_inventory probe
python -m app.scripts.france_inventory seed
python -m app.scripts.france_inventory discover --until 2027-08-31 --metadata-only --detail-budget 150 --max-pages 10
python -m app.scripts.france_inventory discover --until 2027-08-31 --metadata-only --detail-budget 150 --max-pages 10 --resume 32449096-47c2-4b74-bbcc-f0cbf3fecd34
python -m app.scripts.france_inventory update --until 2027-08-31 --candidates-only --detail-budget 100 --max-pages 30
python -m app.scripts.france_inventory update --until 2027-08-31 --candidates-only --detail-budget 100 --max-pages 30 --resume d93dffae-939c-42b8-b11f-e8aa471c5263
python -m app.scripts.france_inventory report
```

Les deux runs réels sont `SUCCEEDED`. Le premier a initialement atteint son budget, puis a repris sans doublon. Le second a révélé deux tournois sans poules : N01 répond HTTP 400 avec `result=-51`. Après correction du décodage des enveloppes d'erreurs HTTP, la reprise a terminé les deux tâches restantes. Les traces de la dernière tentative sont sauvegardées ; les checkpoints et erreurs antérieures restent dans les métadonnées de runs. Aucune trace HTTP des tentatives antérieures absente du fichier n'est reconstituée artificiellement.

Le rapport annonce 26 organismes documentés, 262 observations uniques, 31 associations candidates et zéro association confirmée. Les snapshots ont été renormalisés hors ligne après contrôle des champs de format ; le hash de toutes les observations était inchangé. Les références du catalogue portent une date de consultation, sans heure précise présumée.

## Fichiers ajoutés et modifiés

| Périmètre | Fichiers |
|---|---|
| Adaptateur N01 | `app/backend/app/services/n01_public_client.py` |
| Règles nationales | `app/backend/app/services/france_discovery_model.py` |
| Collecte et synchronisation | `app/backend/app/services/france_discovery_service.py` |
| Persistance SQLite/Supabase | `app/backend/app/services/france_discovery_store.py` |
| Rapports | `app/backend/app/services/france_discovery_report.py` |
| CLI opérateur | `app/backend/app/scripts/france_inventory.py` |
| Migration additive | `supabase/migrations/20261019090000_france_discovery.sql` |
| Tests | `app/backend/tests/test_france_discovery.py`, `app/backend/tests/fixtures/france_discovery/tournament.json`, `tests/workflow/france-discovery.test.mjs` |
| Intégration CI | `.github/workflows/quality.yml`, `tests/workflow/package.json` |
| Planification préparée | `deploy/france-inventory.service.example`, `deploy/france-inventory.timer.example` |
| Documentation et données réelles | Fichiers du présent répertoire, dont inventaire Markdown/CSV/JSON et vérification des sources |
| Exclusion de l'état privé | `.gitignore` : base SQLite opérationnelle |

Les fichiers existants de scoring, imports Nakka, classement Comité, MVP, statistiques, Interclubs, résultats historiques, API web et frontend ne sont pas modifiés.

## Limites d'exploitation

Aucun accès Supabase cible n'a été utilisé. La migration et la RPC ont été exécutées dans PostgreSQL embarqué isolé ; elles restent à appliquer puis tester dans un environnement Supabase de validation. Les droits publics concernent seulement les organismes documentés et les compétitions confirmées dont la source reste publique. Le contrôle du contenu d'une preuve reste humain.

La préparation d'une planification et d'une Pull Request n'autorise pas un déploiement, l'application de migrations de production ou l'activation d'une tâche planifiée : aucune de ces actions n'est effectuée.
