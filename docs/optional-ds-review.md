# Relecture facultative du directeur sportif

La relecture DS devient facultative pour le classement individuel comité. Le contrôle final Admin et la publication Admin restent deux actions explicites, avec les confirmations et vérifications techniques existantes. Aucun déploiement, email réel ou publication réelle n’a été effectué dans ce chantier.

## Diagnostic

La fonction transactionnelle `ranking_workflow_command` exigeait le statut `DS_VALIDATED`, une signature DS de la même empreinte et un DS actif avant contrôle final/publication. L’interface n’offrait que l’envoi au DS après analyse et désactivait aussi son bouton en l’absence d’affectation. Les compteurs assimilaient `READY_TO_PUBLISH` et `PUBLISHED` à une validation sportive.

Le worker `ranking_workflow_worker` ne traite que les analyses explicitement demandées et l’outbox email. Il ne scanne ni ne publie les dossiers en attente. Le classement public utilise exclusivement `published_revision_id`. Les workers Interclubs et les publications Facebook n’utilisent pas cette validation et ne sont pas modifiés. Les réserves BDC sur un barème réellement provisoire sont conservées.

Lecture seule de production le 15/10/2026 : **1 version courante `PUBLISHED`, aucun stock en attente**. Le corps de la RPC installée correspond à celui de la migration initiale du dépôt (MD5 `3f205834cda16bede4b05f67eeee020a`). Ce constat est daté ; refaire l’inventaire juste avant toute intervention.

## Comportement

| Situation | Comportement |
| --- | --- |
| Analysé et conforme, sans DS affecté ou sans relecture | Contrôle final Admin possible, puis publication Admin distincte |
| Ancien `PENDING_DS` conforme | Même reprise explicite, dossier par dossier ; aucune reprise automatique |
| Données incomplètes, identités ambiguës, quota club dépassé | Blocages existants maintenus |
| Demande de correction DS | `CORRECTION_REQUESTED` reste bloquant ; créer et contrôler une nouvelle version |
| Relecture d’une version prête ou publiée | Décision nominative/date conservées ; statut et publication inchangés ; aucun email |
| Répétition de validation DS | Même clé : réponse rejouée ; autre clé : audit de la commande, aucune nouvelle décision/email |
| Nouvelle analyse ou correction | Nouvelle révision immuable ; aucune signature héritée |
| DS signale un résultat déjà publié | La demande bloque les étapes suivantes ; l’ancien instantané public reste visible jusqu’au remplacement contrôlé |

Le DS assigné peut consulter dès `ANALYZED`, approuver ou demander une correction motivée. L’invitation `SUBMIT` est facultative et reste une action explicite de l’Admin ; elle seule avertit le DS. Les permissions nominatives, RLS, l’Admin configuré, la version attendue et l’idempotence restent vérifiés en base. Les rôles navigateur ne donnent aucun droit direct sur les tables/RPC.

La projection privée `ds_review` est calculée à partir des seules décisions de la révision, de son empreinte et de son DS assigné. Elle distingue `NOT_REVIEWED`, `VALIDATED` et `CORRECTION_REQUESTED`. Publier ne crée aucune signature. Les anciennes signatures restent consultables avec leurs auteurs et dates. Aucun statut de relecture n’est ajouté à la vue publique.

## Fichiers

- `supabase/migrations/20261015172851_optional_ds_review.sql` : remplacement de la seule RPC de commande, sans nouvelle table/colonne ni réécriture de données.
- `supabase/operations/inventory_optional_ds_review.sql` : inventaire en lecture seule, avec distinction corrections/anomalies/absence de DS/action Admin.
- `supabase/operations/rollback_optional_ds_review.sql` : restauration de la RPC antérieure, sans toucher aux données.
- `app/backend/app/services/ranking_workflow.py` et `app/backend/app/api/ranking_workflow_router.py` : projection de relecture cohérente dans liste, détail et historique ; accès DS aux versions analysées affectées.
- `app/backend/app/services/ranking_workflow_worker.py` : formulation des emails facultatifs ; pipeline d’analyse inchangé.
- `app/frontend/components/ranking/{RankingWorkflow.tsx,types.ts}` : contrôle final direct, relecture tardive, vrais compteurs et libellés de relecture.
- `app/backend/tests/test_optional_ds_review.py`, `tests/workflow/optional-ds-review{.test.mjs,.browser.mjs}` et adaptation des tests existants : migration/stock, états, API, worker, interfaces et retour arrière.
- `tests/workflow/package.json`, `tests/workflow/browser.test.mjs`, `tests/workflow/database.test.mjs`, `docs/ranking-workflow.md` et ce guide : exécution et documentation.

## Vérifications

Résultats locaux :

- Backend : **146 tests unittest** réussis, compilation Python réussie ; **41 tests pytest** Match Day/scoring réussis.
- SQL : suite `npm test` complète réussie (Interclubs J1/J2, scoring, synchronisation, identités et historique), dont **51 contrôles du workflow initial** ; scénario ciblé final : **38 contrôles relecture facultative / migration / stock / inventaire / rollback** réussis.
- Frontend : `npm test`, lint, TypeScript et build Next.js 16.3.8 réussis. Le lint conserve **44 avertissements préexistants, aucune erreur**.
- Navigateur : parcours ciblé réel Admin/DS réussi, avec correction avant publication, publication sans DS, relecture tardive sans email/republication, nouvelle révision non relue, publication sans affectation, compteurs sans faux validés, permissions, CSRF, classement public et mobile 390 px.
- `git diff --check` : réussi.

[Relecture après publication](ranking-workflow-preview/06-ds-review-after-publication.webp) · [Publication sans DS](ranking-workflow-preview/07-admin-published-without-ds.webp).

Les tests utilisent PostgreSQL/PGlite, des comptes fictifs et une API locale. Aucun SMTP ni projet connecté n’est utilisé pour les écritures de test. Le premier lancement navigateur était bloqué par un proxy SOCKS local sans dépendance `socksio` ; la recette a été rejouée sans proxy pour les services loopback. Le build a été rejoué avec des dépendances locales après refus par Turbopack d’un lien symbolique externe.

Non exécutés : déploiement/migration sur un projet connecté, envoi SMTP, publication réelle, Docker et test de charge PostgreSQL multi-connexions. La suite navigateur élargie jeux/Vision/Visibilité n’a pas été relancée localement ; son scénario CI existant reste actif et inclut les nouvelles vérifications. Les règles sportives n’ont pas été modifiées.

Pour rejouer :

```sh
cd app/backend
python -m compileall -q app
python -m unittest discover -s tests -p 'test_*.py'
python -m pytest -q tests/test_match_day.py tests/test_scoring_120_139.py
cd ../../tests/workflow
npm ci
npm test
RANKING_BROWSER_ONLY=1 npm run test:browser
cd ../../app/frontend
npm ci
npm test
npm run build
```

Sans `RANKING_BROWSER_ONLY`, le parcours navigateur existant exécute aussi les jeux, Vision et Visibilité. Les tests navigateur utilisent les ports loopback 55321, 8008 et 3008. Les tests SQL exercent une vraie mise à niveau sur des dossiers déjà en attente/corrigés/validés, vérifient chaque ligne des sept tables avant/après migration et après rollback.

Recette manuelle sur un environnement isolé :

1. Préparer une compétition conforme sans affecter de DS. Confirmer le contrôle final, vérifier que rien n’est encore publié, puis publier. Vérifier « Non revu par le DS » et le classement public.
2. Préparer une compétition affectée à un DS sans lui envoyer d’invitation. Vérifier qu’il voit la version analysée. Publier via l’Admin, puis valider depuis le DS : même version publique, même total, une seule validation, aucun nouvel email.
3. Créer une nouvelle version de résultats validés : vérifier qu’elle est non relue, que l’ancienne signature reste dans l’historique et que l’ancienne version reste publique jusqu’au remplacement.
4. Demander une correction DS avant ou après publication : vérifier le blocage Admin jusqu’à une nouvelle version corrigée. Vérifier aussi une source incomplète, une identité manquante et un compte non autorisé.
5. Sur une copie contenant des dossiers `PENDING_DS`, appliquer la migration, relancer le worker sans SMTP et constater l’absence de publication/reprise/notifications supplémentaires. Reprendre un seul dossier par les deux actions Admin.
6. Contrôler desktop/mobile et comparer les scores, points et classements à l’état précédent ; vérifier les Security Advisors du projet isolé après application autorisée.

## Déploiement ultérieur — instructions uniquement

1. Après fusion autorisée, prendre le commit validé et sauvegarder la base ainsi que les images applicatives actuellement déployées. Conserver leur SHA pour rollback. Ne pas activer de feature ni d’email auparavant désactivé.
2. Exécuter `supabase/operations/inventory_optional_ds_review.sql` avec un accès SQL opérateur. Relire anomalies et corrections ; aucune ligne de ce script ne modifie les données. L’inventaire ne dispense pas du quota de reconnaissance ni des contrôles serveur finaux.
3. Arrêter temporairement `ranking-worker` s’il tourne, suspendre les actions du workflow (`RANKING_WORKFLOW_ENABLED=false` dans frontend/backend/worker et recréer les services concernés). Le lecteur public continue de servir les instantanés publiés. Préparer les nouvelles images.
4. Appliquer **uniquement la nouvelle migration**, via le processus de migrations habituel, après vérification de la cible. Ne pas rejouer les migrations historiques ni celles du bootstrap Preview. La nouvelle migration remplace une fonction et réaffirme ses droits service-only ; elle n’ajoute aucun job/email, ne modifie aucun statut et ne publie aucun dossier.
5. Déployer backend/frontend ensemble, puis le worker s’il était déjà activé. Restaurer les valeurs antérieures de `RANKING_WORKFLOW_ENABLED` ; conserver `RANKING_EMAIL_ENABLED` et tous les réglages Facebook. Exemple depuis la racine du dépôt, en conservant le nom Compose déjà utilisé sur le VPS :

```sh
docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml build backend frontend ranking-worker
docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml up -d backend frontend
# Uniquement si ce worker était déjà activé :
docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml --profile ranking-workflow up -d ranking-worker
```

6. Vérifier la santé des services, les lectures publiques et l’accès DS/Admin sans valider ni publier de vrai dossier pour tester. Refaire l’inventaire et comparer les versions publiées. Toute reprise d’un ancien dossier se fait explicitement dans l’interface Admin : contrôle final, puis publication. Aucun script de rattrapage en masse n’est fourni.

## Retour arrière

Suspendre les actions/worker, conserver le lecteur public actif et les snapshots. Exécuter `supabase/operations/rollback_optional_ds_review.sql`, restaurer les images backend/frontend/worker au SHA sauvegardé, puis rétablir les réglages précédents. Ne supprimer ni révisions, ni décisions, ni notifications, ni historique de migrations.

Une version publiée sans DS reste publiée après rollback ; ne pas la retirer ou fabriquer une signature. Une version `READY_TO_PUBLISH` sans signature DS sera refusée par l’ancien serveur : enregistrer une nouvelle version avec un DS affecté et suivre l’ancien circuit, ou garder les actions suspendues jusqu’au correctif. Le rollback SQL restaure uniquement la règle précédente et conserve les points déjà publiés.
