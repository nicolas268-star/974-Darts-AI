# Audit préalable — Comités France, phase 1

Audit du 19 octobre 2026 sur `main` au commit `1afca2d`, avant les changements de cette branche. Le checkout était propre ; branche créée : `feature/comites-france-discovery`.

## Architecture constatée

Le produit comporte un frontend Next.js/React/TypeScript et un backend FastAPI/Python 3.12. Le moteur Nakka opérationnel se trouve dans le backend, pas dans Next.js. Les migrations SQL sont dans `supabase/migrations`; les anciennes migrations de version sont conservées dans `supabase/release_migrations`.

| Composant existant | Fonction et contraintes |
|---|---|
| `app/backend/app/services/nakka_competition_radar.py` | Recherche de ligues et tournois, normalisation des noms, rapprochement avec un catalogue réunionnais, décisions, état JSON atomique. Recherche bornée, mots-clés Réunion/974/clubs. Transport historique `tk2-228-23746.vs.sakura.ne.jp`, `cmd=get_list`, POST de filtres. |
| `nakka_sync_agent.py` | Collecte d'un portail de ligue, référence de synchronisation, hash de snapshot, validation des doublons et données manquantes, contrôle manuel de la référence. |
| `nakka_browser_collector.py` | Extraction Playwright de textes de résultats pour les rencontres ; inutile pour le nouvel inventaire public puisque l'API documentée fournit les documents JSON. |
| `nakka_direct_import.py` | Analyse/persistance des imports individuels ; identifiants `tdid`, validation d'URL, listes d'entrées, poules et tableaux, hash, verrou fichier multiplateforme. Le traitement contient également des règles éditoriales et des rapprochements de joueurs locaux. |
| `season_registry_service.py` | Registre de saisons des championnats réunionnais ; écrit dans le calendrier existant. À exclure de l'orchestration nationale. |
| `ranking_workflow.py`, `ranking_workflow_worker.py` | Révisions privées, validation et publication transactionnelle des compétitions officielles. Le workflow dispose de son propre contrôle d'acteur et de permissions SQL. |
| `committee_ranking_service.py` | Points officiels du Comité La Réunion, identités et catégories. Hors périmètre de cette phase. |
| `tournament_page_service.py`, `competition_hub_service.py` | Projections publiques, synchronisation des fiches depuis les résultats validés et cache Nakka. Aucune écriture nationale vers ces projections. |
| `repositories/sync_repository.py` | Pagination Supabase et reconstruction de snapshots publiés, natural keys des rencontres/legs. Ne constitue pas un registre national d'organisateurs. |

Le radar historique expose sa normalisation de noms, réutilisée par le nouveau périmètre. Son catalogue d'équipes et son seuil de confiance ne peuvent pas devenir des preuves de comités français. L'analyse complète d'import individuel n'est pas appelée : elle comporte des rapprochements de joueurs réunionnais, des limites propres aux tournois locaux et des règles de publication qui ne s'appliquent pas au recensement.

## Synchronisations existantes

Fréquences par défaut constatées dans les modules workers : surveillance Nakka 300 s (minimum 60 s), veille de tournois 3 600 s (minimum 900 s), registre de saisons 86 400 s (minimum 3 600 s), match day 15 s, analyse Interclubs au rythme de la minute, workflow de publication 5 s. La configuration de production peut les surcharger. Aucune de ces boucles n'est modifiée, et le nouveau service n'est enregistré dans aucune boucle.

## Schéma et intégrité existants

Les tables officielles comprennent notamment `committee_ranking_events`, `committee_ranking_results`, `ranking_workflow_events`, `ranking_workflow_revisions`, les tables de décisions/audit/notifications, `tournament_pages`, `tournament_page_revisions`, `championship_results`, `matches`, `legs`, `player_leg_stats` et `imports`. Les natural keys, identifiants Nakka et hashes permettent l'idempotence dans leurs périmètres respectifs. Aucun référentiel indépendant de comités français avec preuves ciblées n'est présent.

Les migrations récentes utilisent transactions, fonctions SQL à `search_path` explicite, permissions nominatives, contrôles d'accès, journaux immuables et tests PostgreSQL embarqués PGlite. Les tests backend utilisent `unittest` avec des fixtures sauvegardées, certains complétés par pytest. La CI vérifie compilation Python, tests backend, intégrité SQL, frontend et images.

## Décision d'extension

Le recensement étend la couche de découverte Nakka avec un adaptateur public documenté `n01_public_client.py` et une orchestration nationale séparée de la publication sportive. Ce n'est pas un second import de points/résultats dans les tables existantes : aucun appel à `import_direct_event`, au calendrier, aux identités des joueurs ou aux publications officielles.

La nouvelle API utilise une enveloppe `{result, list/tournament/league/...}`, des paramètres GET et une pagination différentes du transport historique. Réutiliser son ancien `_request_json` empêcherait de traiter correctement HTTP 429 et `Retry-After`. Le nouvel adaptateur est donc partagé et réutilisable, tandis que les clients historiques restent fonctionnellement identiques.

Le modèle utilise sept tables `france_*`, dont des métadonnées JSONB extensibles avec contraintes, clés étrangères et index d'expressions. Les alias résident dans le référentiel des organismes, sans table d'alias supplémentaire nécessaire en phase 1. Les sources brutes et preuves de décisions sont privées. Les organismes, compétitions, ligues et décisions ont des identifiants séparés ; une ligue N01 n'est jamais promue automatiquement en comité.

Les observations et corrections sont distinctes : un import actualise la source, puis réapplique les corrections manuelles et conserve la décision d'association. Chaque modification de source et chaque décision est historisée. La lecture publique nécessite à la fois un organisme vérifié, une association vérifiée et une source N01 publique. Une source devenue privée/inaccessible est retirée de la projection publique.

## Sources techniques vérifiées

- [Documentation officielle N01](https://push.n01darts.com/api/v1/n01_api_manual_en.html) et appels réels aux neuf endpoints : `verification-endpoints.json`.
- [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) : permissions de tables et politiques de lignes traitées séparément. Les RPC sont `SECURITY INVOKER`, réservées au service ; aucun nouveau `SECURITY DEFINER` ni autorisation depuis `user_metadata`.
- [Changelog Supabase](https://supabase.com/changelog), consulté le 19 octobre : le changement TLS annoncé ne modifie pas ce SQL ni le client Python existant ; aucune nouvelle dépendance ajoutée.

Les migrations sont préparées et testées localement, sans application à Supabase partagé et sans déploiement de production.
