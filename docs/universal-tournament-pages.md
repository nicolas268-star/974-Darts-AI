# Fiches Nakka universelles — livraison et déploiement

## Résultat

Le moteur commun produit le contrat de la fiche T5 depuis une analyse Nakka validée ou le snapshot de la version officielle publiée. La route historique `/tournaments/[code]` et le style T5 sont conservés. Les nouveaux événements n’exigent plus d’ajout dans un registre de codes.

Les poules, tableaux principaux, consolantes, véritables Winner/Loser Brackets et grandes finales/reset suivent les structures réellement présentes. Une consolante Nakka `s2` reste un tableau secondaire. Seules les structures `dw`/`dl` prouvent la double élimination. Les positions du tableau viennent de Nakka, indépendamment de l’ordre dans lequel les rencontres se terminent.

Les statistiques absentes restent nulles et affichent « Non disponible ». Les catégories de scoring exposées sont disjointes ; une volée n’est pas cumulée artificiellement dans plusieurs compteurs. Les doublettes conservent leurs statistiques collectives. Les nouveaux résultats sans identité canonique validée n’alimentent pas les records individuels.

## Audit initial et OC1

Contrôle de production effectué **en lecture seule le 18 octobre 2026** :

- Dossier : `nakka-t_ssSW_4561-single`, saison `2026-2027`, catégorie D.
- Version officielle active : **14**, ID `45426f3f-6382-4bc0-9ab2-99aa5a2c4938`, statut `PUBLISHED`.
- 29 résultats publiés ; total existant **150 points**.
- Snapshot enregistré : 29 participants et 83 rencontres.
- Source réelle : 6 poules, 56 rencontres de poules, 15 du tableau principal, 12 de consolante, 226 legs.
- Les règles de départage des poules n’étaient pas conservées par l’ancien parseur. La reprise complète ces métadonnées depuis Nakka seulement après comparaison stricte des participants, scores et statistiques communes avec la version publiée.

La fixture `app/backend/tests/fixtures/oc1_published.json` contient exclusivement les métadonnées, résultats publics et source Nakka nécessaires à cette régression ; les éléments privés de reconnaissance, signatures et notifications sont exclus.

L’URL proposée est `/tournaments/oc1-2026-10-18`. Une URL déjà attribuée à la même source est conservée. L’organisateur vient de la publication officielle, et le lieu « Saint-Leu, La Réunion » peut être complété dans la projection par la commande de reprise ci-dessous.

**Aucune migration, reprise, publication de points ni mise en production n’a été exécutée pendant cette livraison.** La disponibilité sur `974darts.re` dépend donc de l’application du déploiement après validation.

## Écarts corrigés et fichiers

| Écart constaté | Mise en œuvre |
| --- | --- |
| Le workflow officiel ne produisait pas de fiche | Trigger de publication, file durable et traitement dans `ranking_workflow_worker.py` |
| Registre local limité aux codes `Tn` | Projection `tournament_pages`, clé unique source Nakka + discipline, slugs stables |
| Deux chemins de présentation distincts | `tournament_engine.py`, appelé par l’import amical et la projection officielle |
| Consolante présentée comme Loser Bracket | Normalisation dans `nakka_direct_import.py`, partition explicite des tableaux frontend |
| Règles de poules non sauvegardées | Métadonnées source, critères Nakka et classement indisponible en cas de règles insuffisantes |
| Valeurs absentes transformées en zéro | Valeurs nulles jusqu’au tableau de performances et distinctions |
| Pas de révision ni aperçu | Versions immuables, empreinte de contenu, verrouillage transactionnel, aperçu Admin lié à sa fiche et à son auteur |
| Risque de doublon officiel/amical | Réservation de source dans le workflow, priorité aux projections publiées et catalogue commun |
| Identité officielle confondue avec joueur canonique | Correspondance explicite `player_identities.id` → `canonical_player_id` |

Fichiers principaux :

- Backend : `nakka_direct_import.py`, `tournament_engine.py`, `tournament_round_robin.py`, `tournament_page_service.py`, `tournament_classification.py`, `competition_hub_service.py`, `ranking_workflow.py`, `ranking_workflow_worker.py`.
- API : `tournament_page_router.py`, `ranking_workflow_router.py`, `nakka_sync_router.py`, `player_router.py`, enregistrement dans `main.py`.
- Frontend : `app/tournaments/[code]/page.tsx`, catalogue Compétitions, types `sprint14.ts`, `tournament-presentation.ts`, `tournament-records.ts`, panneau `TournamentRefreshPanel`, proxy Admin et intégrations des outils existants.
- Persistance : `supabase/migrations/20261018165909_universal_tournament_pages.sql`.
- Reprise : `app/backend/app/scripts/backfill_tournament_pages.py` ; inventaire SQL en lecture seule `supabase/operations/inventory_tournament_pages.sql`.
- Tests : fixtures publiques OC1/T5, moteur, service de projection, Hub, sécurité des routes, SQL transactionnel, rendu React et navigateur ; CI `.github/workflows/quality.yml`.

## Persistance et séparation des responsabilités

Les quatre tables ajoutées sont protégées par RLS, sans droits `anon`/`authenticated`. Le backend expose uniquement les projections publiques ; les aperçus et l’historique de révision restent côté serveur. Les fonctions SQL sont `SECURITY INVOKER`, avec exécution réservée à `service_role`.

`tournament_pages` possède une ligne par `(source_id, discipline)` et une URL stable. `tournament_page_revisions` conserve les changements de contenu ; une répétition du même contenu ne crée pas de révision. `tournament_page_previews` lie un aperçu à son auteur, à la fiche, à la version officielle et à l’empreinte précédente, avec expiration d’une heure. `tournament_page_jobs` assure la reprise après publication, avec bail et tentatives bornées.

Le trigger crée ou remet en attente le travail **dans la transaction qui change `published_revision_id`**. La migration met également en attente les événements déjà publiés. Une nouvelle révision officielle en brouillon ne remplace jamais la publication active sur le site. Une panne Nakka conserve la dernière fiche validée.

Les points sont lus dans les résultats immuables de la version officielle publiée ; aucun barème n’est recalculé par la fiche. Le mécanisme n’appelle aucune commande de publication officielle et ne modifie aucune table de classement, ELO ou statistiques de championnat.

L’actualisation Admin utilise un aperçu puis une confirmation. Une correction sportive d’une source officielle nécessite une nouvelle validation dans le workflow officiel ; l’actualisation de la fiche ne republie jamais ses points. Un enrichissement d’anciennes métadonnées de poules est possible si le contenu sportif contrôlé reste identique.

## Déploiement après validation

1. Sauvegarder la base et capturer l’inventaire officiel avant modification, notamment `published_revision_id`, nombre de résultats, total de points et SHA256 des résultats d’OC1.
2. Exécuter la migration additive avec le processus Supabase habituel, sur l’environnement de prévisualisation d’abord. Elle ajoute des tables/fonctions/triggers ; elle ne modifie pas les résultats sportifs existants et ne publie aucun dossier en attente.
3. Déployer les images backend/frontend et redémarrer le worker de classement. Le service Compose existant `ranking-worker` utilise le profil `ranking-workflow` ; vérifier `RANKING_WORKFLOW_ENABLED=true`, les secrets serveur habituels et le fonctionnement de la file. Aucun secret ne doit être exposé au frontend.

Le worker doit monter `/var/lib/974darts/backend-data:/app/data:ro`, soit le même répertoire persistant que le backend. Il lit `sprint14_tournaments.json` pour conserver les URL historiques, dont `/tournaments/t5`. Un worker utilisant uniquement le cache embarqué dans l'image pourrait attribuer un nouveau slug au premier traitement. Les projections sont écrites dans Supabase ; le worker n'a pas besoin d'écrire dans ce volume. La CI vérifie les montages normalisés par Compose avec `deploy/check-tournament-data-volume.py`.

Construire et recréer uniquement les trois services de cette livraison, en conservant le Caddyfile local et les autres workers :

Le script `deploy/deploy-tournament-pages.sh RELEASE_SHA PREVIOUS_SHA` automatise cette séquence depuis `/opt/974darts/current`, avec sudo et le checkout déjà positionné sur le SHA validé. Il exige la migration déjà appliquée, sauvegarde les images, l'environnement, le cache et SQLite, puis conserve tous les snapshots `PUBLISHED` et les lignes historiques de points dans un fichier privé `official-published-backup.json` en mode 0600. Les empreintes des snapshots complets et de leurs résultats sont comparées après déploiement. Un worker auparavant arrêté avec un stock d'analyses ou notifications, ou une dérive des flags effectifs, fait échouer le précontrôle. Une modification concurrente de l'environnement bloque le rollback automatique plutôt que d'écraser ce changement. Le script ne modifie aucun flag et n'applique aucune migration SQL.

```sh
docker compose --env-file /etc/974darts/production.env --profile ranking-workflow -f deploy/compose.yaml build backend frontend ranking-worker
docker compose --env-file /etc/974darts/production.env --profile ranking-workflow -f deploy/compose.yaml up -d --no-deps --wait --wait-timeout 180 backend frontend
docker compose --env-file /etc/974darts/production.env --profile ranking-workflow -f deploy/compose.yaml up -d --no-deps ranking-worker
```

Avant la migration et le redémarrage, enregistrer le SHA du checkout, les identifiants des images de ces trois services et l'état initial du worker ; arrêter temporairement `ranking-worker` s'il tourne. Sauvegarder la base Supabase et le volume persistant, avec l'API de sauvegarde SQLite pour les fichiers SQLite actifs. Conserver les sauvegardes et l'environnement serveur dans un répertoire réservé à root. Les identifiants et secrets ne doivent pas apparaître dans les sorties de commande.

Inventorier également `ranking_workflow_jobs` et `ranking_notification_outbox` par état sans afficher leurs payloads. Le même worker traite les analyses déjà demandées et les emails lorsque `RANKING_EMAIL_ENABLED` était activé : préserver les réglages existants et examiner ce stock avant de le relancer. La migration met tous les dossiers déjà publiés dans la file des fiches, ce qui peut enrichir plusieurs anciennes fiches. Elle ne publie aucun nouveau résultat officiel. Avant installation du schéma, n'exécuter que la première requête de `inventory_tournament_pages.sql` ; les suivantes nécessitent les nouvelles tables.
4. Contrôler les travaux et la fiche OC1. Pour une reprise ciblée et le lieu exact, exécuter depuis `app/backend`, dans l’environnement backend configuré :

```sh
# Inventaire uniquement, aucune écriture.
python -m app.scripts.backfill_tournament_pages --source-id t_ssSW_4561

# Projection publique uniquement ; complément Nakka si nécessaire.
python -m app.scripts.backfill_tournament_pages --source-id t_ssSW_4561 --apply --collect-missing --location "Saint-Leu, La Réunion"

# Reprise d'autres publications sans fiche ; aucun nouvel événement officiel.
python -m app.scripts.backfill_tournament_pages --all --apply --collect-missing
```

La commande affiche le checksum des résultats avant/après et ne les écrit jamais. Sans `--collect-missing`, elle réutilise uniquement les données enregistrées. Pour relancer une reprise via l’API serveur Admin : `POST /api/v1/competitions/tournaments/recovery/official` avec `{ "event_id": "nakka-t_ssSW_4561-single", "confirmed": true }`, session Admin vérifiée et token interne.

5. Ouvrir `/competitions`, la fiche OC1 et `/tournaments/t5`. Contrôler les six poules d’OC1, principal/consolante, statistiques disponibles, source Nakka et palmarès officiel. Les cartes officielles se trouvent dans `official_tournaments` ; `/tournaments` conserve les amicaux.
6. Comparer à l’inventaire initial : **même version officielle, mêmes résultats, mêmes 150 points pour OC1**, sauf nouvelle publication distincte décidée par l’administrateur entre-temps.
7. Publier un événement de test en prévisualisation, puis valider un import amical : vérifier la génération automatique, répéter les opérations et confirmer une seule fiche/révision de contenu sans effets sur les points.

En cas de problème, revenir aux images précédentes ; conserver les nouvelles tables et l’historique. Ne pas supprimer les données officielles ni appliquer de rollback destructif. Une file échouée peut être reprise par la commande ciblée ou l’outil Admin après résolution de l’erreur source.

Le rollback applicatif restaure les images backend, frontend **et ranking-worker**, puis son état initial (le laisser arrêté s'il était arrêté avant la livraison). Les tables, fonctions et le trigger additifs peuvent rester installés : l'ancien worker ignore la nouvelle file, et les points publiés restent inchangés. Ne pas réutiliser `deploy/deploy-match-day.sh` pour cette release : ce script active Match Day et ne sauvegarde pas l'image du worker de classement.

## Validation et limites

Les tests couvrent les formats demandés, les données incomplètes, les identités ambiguës, les doublettes, l’actualisation concurrente, la reprise d’OC1, les points inchangés et la conservation de T5. Les fixtures réelles sont figées et les tests n’ont pas besoin de Nakka ou Supabase en ligne.

| Vérification exécutée | Résultat |
| --- | --- |
| Backend Python 3.12, UTF-8, toutes les suites compatibles Windows | 221 tests et 10 sous-tests réussis, gardes historiques T5 et rejeu d’ancien import inclus |
| Nouveaux contrôles transactionnels PostgreSQL/PGlite | 65 réussis |
| Régression SQL DS facultatif / classement | 38 / 51 réussis |
| Régressions SQL X01 et synchronisation | Réussies |
| Rendu React des formats et proxy Admin | Réussis, y compris absence d’attribution des identités ambiguës |
| Navigateur T5/OC1, 1440 / 768 / 390 px | 6 scénarios réussis ; captures inspectées, aucun débordement de page |
| TypeScript et ESLint | Réussis ; avertissements existants dans d’autres écrans |
| Build Next.js de production | Réussi |
| Audit des dépendances de production | 0 vulnérabilité |
| Suite frontend globale `npm test` sous Windows | S’arrête dans l’ancien `test-player-card.mjs` : chemin `C:\\C:\\...` construit depuis une URL ; script inchangé par cette PR |
| Deux anciennes suites backend Linux (`interclub_analysis`, `match_day`) | Non exécutables sur cet hôte Windows : import `fcntl` ; conservées dans la CI Linux |

Les données de poules sans règles suffisantes, classements manuels ou critères avancés non interprétables restent explicitement indisponibles. Aucun départage n’est inventé. Les métriques ou répartitions individuelles absentes d’une doublette restent absentes. Les noms déjà corrompus dans la source Nakka, notamment certains caractères T5, ne sont pas corrigés arbitrairement ; les alias canoniques confirmés restent utilisables.

Les contrôles exécutés et leur résultat final sont consignés dans le rapport associé à la PR. Sous Windows, les anciennes suites reposant sur `fcntl` nécessitent Linux, et l’ancien script `test-player-card.mjs` construit un chemin URL incompatible avec Windows. La CI Linux conserve ces contrôles complets. Le contrôle `npm audit --omit=dev` ne rapporte aucune vulnérabilité de production au moment de la livraison.
