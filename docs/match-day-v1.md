# Studio Match Day V1

## Livraison

`/admin/communication/match-day` réutilise le garde Admin existant et ajoute cinq étapes : rencontre, joueurs/KPI, thèmes, texte, validation/diffusion. Les vues Publications programmées et Historique donnent accès aux tâches, brouillons, versions PNG et journal d’actions. Sur téléphone, Configuration/Aperçu évite de parcourir tout le formulaire pour voir l’image.

Deux équipes distinctes, deux thèmes indépendants, Publication 1080 × 1350 et Story 1080 × 1920. Le registre partagé Player Card contient les huit choix demandés : Piton des Neiges, Piton de la Fournaise, Bière Ambrée, Bière Brune, Kaz B, Kaz A, TDC Zarboutant et TDC Zarlord. Les noms canoniques des équipes restent inchangés. Les variantes supplémentaires sont aussi disponibles dans les cartes publiques ; leurs choix et associations historiques restent inchangés.

Aperçu, téléchargement et validation utilisent le même PNG encodé. Le backend conserve ces octets avec SHA-256, sans régénération au moment de l’envoi. Des contrôles de type réel, décodage, dimensions, taille et métadonnées refusent les fichiers incompatibles plutôt que modifier l’image approuvée.

La V1 propose un visuel unique. Trois KPI maximum et huit joueurs maximum par côté. Une composition trop dense ou un texte qui ne tient pas bloque l’export/validation ; choisir Story ou réduire la sélection. Aucun joueur n’est retiré automatiquement. Aucun carrousel ou export en lot n’est annoncé. Les photos sont importées explicitement, contrôlées avec le pipeline Player Card et ramenées à des sources PNG de 360 px ; les fichiers originaux ne sont pas envoyés au serveur. Les petites sources nécessaires à la réédition restent dans le brouillon et ses versions privées, sans changement du profil du joueur.

## Sources et identités

`match_day_source.py` utilise `CompetitionHubService`, le même `PlayerStatisticsEngine` que les profils, le registre officiel `interclub_rosters_2027.json`, les identités/licences confirmées et les UUID d’équipes vérifiés dans `player-card-v1.md`. Le renderer utilise directement `adaptDashboard`, `CARD_METRICS`, `metricValue`, `fitText`, les fonctions photo et l’encodeur PNG existants. Pas de second moteur statistique.

Pour 2027, les effectifs officiels sont résolus par nom complet exact dans le registre de licenciés, club et identité active. Les noms publics viennent du joueur canonique. Une identité non résolue ou non publique n’est pas sélectionnable et ses statistiques ne sont pas divulguées. Une licence seule, parfois dupliquée dans les listes historiques, n’est pas un identifiant de joueur. Les slugs des listes d’effectifs ne deviennent jamais des UUID.

Pour les autres saisons, seuls les memberships de la saison et les affiliations observées dans ses données publiées sont proposés. L’effectif est marqué partiel ; `players.team_id` actuel n’est pas utilisé comme affiliation historique. Une saison sans affiliations vérifiées présente un état vide. Les effectifs ne sont jamais annoncés comme une composition confirmée sans action Admin.

La rencontre est liée à l’ID stable du calendrier local. La saison doit être certifiée par le registre des saisons/source URL ou un champ de saison explicite. Les UUID structurés, les noms canoniques et les alias explicites déjà employés par le calendrier sont acceptés. Les titres `J2 PDC A vs PDC B` sont résolus en utilisant ces mêmes alias dans `resolve_team`, sans recherche approximative. Les occurrences sont présentées séparément ; une rencontre sans équipes identifiées reste indisponible pour le rattachement automatique. La création manuelle ne modifie jamais le calendrier.

Une signature du calendrier brut est conservée séparément des UUID dérivés. L’inversion déplace chaque côté complet et conserve domicile/extérieur. Le bouton de reprise du calendrier relit la source, indique les informations remplacées et invalide l’approbation ; la légende doit être relue. Actualiser les statistiques ne remplace pas silencieusement un calendrier modifié.

## Période statistique

À l’étape **4 — Texte**, **Générer une publication avec les stats** crée une légende éditable à partir du match et du même adaptateur/KPI que l’affiche. Elle reprend la date absolue, l’heure de Réunion, les équipes, le lieu, la période et la référence statistique. Jusqu’à deux joueurs disposant de KPI par équipe sont cités : les joueurs marqués « Mise en avant » sont prioritaires, puis ceux disposant du plus de KPI choisis et de la moyenne la plus élevée si ce KPI est sélectionné. Le texte conserve la distinction effectif/composition confirmée, les zéros et les données manquantes, ainsi que le masquage historique. Il ne déduit ni report, ni premier match, ni favori. Cette génération locale remplace la légende actuelle uniquement sur clic ; une modification invalide l’approbation comme toute autre édition. Aucun service IA externe ni publication automatique supplémentaire.

Affiliation et statistiques ont deux sélecteurs. La V1 expose les saisons du catalogue, avec le périmètre des profils championnat, incluant les simples/doubles selon les sources existantes. Ni BDC ni autres tournois ne sont fusionnés. Les zéros et les absences restent distincts grâce à l’adaptateur partagé. La période et l’heure de référence sont présentes dans l’Admin et sur le visuel.

Le moteur n’a pas d’API de reconstruction historique exacte à un instant passé. Si la référence est postérieure au début indiqué du match, le rendu masque tous les chiffres et explique cette limite. Pour une heure inconnue, le début conservateur est minuit local. Aucune reprise automatique de la saison précédente. Pas de moyenne d’équipe ou de probabilité de victoire ajoutée.

Le backend conserve un manifeste de source privé et compare noms, équipes, joueurs et dashboards au manifeste au moment de sauvegarder. Les KPI ne sont pas des champs librement modifiables. La visibilité canonique est revérifiée à la validation, à la programmation et immédiatement avant l’envoi.

## File, versions et fiabilité

SQLite est situé par défaut à `/app/data/match_day.sqlite3`, sur le volume backend existant. L’initialisation locale version 1 crée `sources`, `drafts`, `versions`, `jobs` et `audit` ; aucune migration Supabase n’est nécessaire. La configuration WAL et la création du schéma sont verrouillées par fichier entre processus. Les transactions d’écriture utilisent `BEGIN IMMEDIATE`, les médias restent en BLOB privés et les fichiers DB/WAL/SHM sont en 0600.

Brouillon → version approuvée → tâche programmée → envoi → publié / échec / suspendu / à vérifier. Les révisions ont un contrôle de concurrence. Sauvegarder une modification suspend les tâches futures du brouillon ; la version PNG précédente reste intacte. Une nouvelle validation est obligatoire. Une modification pendant un envoi ou un résultat incertain est refusée.

L’identité anti-doublon est `(rencontre ou brouillon manuel, Page, créneau éditorial)`. Modifier un thème ou une légende ne contourne pas cette identité. Un rappel utilise explicitement un autre créneau ; aucune séquence de rappels automatique. Pour reprogrammer une annonce suspendue, annuler sa tâche avant de valider/programmer la nouvelle version. Un post publié est conservé et ne peut pas être annulé par cet écran.

Un worker dédié, commandé par `python -m app.services.match_day_worker`, lit la file toutes les 15 secondes. Il fonctionne navigateur fermé et reprend après redémarrage. Il contrôle les changements de calendrier avant l’échéance et juste avant l’envoi, la visibilité, le SHA du PNG et la date de début. Une source manquante, corrompue ou modifiée suspend la tâche. L’historique signale aussi les changements pour les posts déjà publiés sans les supprimer.

La V1 limite volontairement chaque tâche à une tentative d’envoi. Un timeout, une réponse ambiguë ou un worker interrompu pendant l’envoi produit Publication à vérifier, sans nouvel envoi aveugle. Un post retrouvé peut être confirmé par son ID, vérifié par Meta sur la Page attendue. Si aucun post n’est retrouvé, l’identité anti-doublon reste réservée ; cette absence seule ne prouve pas qu’un envoi n’a jamais eu lieu. Les tâches en retard de plus de 15 minutes et celles dépassant le début du match sont suspendues.

Saisie/affichage : `fr-FR`, `Indian/Reunion`. Stockage des instants : UTC. Sans heure de match, H-2 est indisponible et la diffusion doit précéder le jour du match. Le jour même peut rester une règle proposée, mais le backend la refuse si l’heure du match est inconnue. Aujourd’hui/Ce soir sont recontrôlés à la programmation et à l’envoi.

SQLite convient au volume local de ce déploiement. Ne pas placer la file sur NFS ni lancer des réplicas backend/worker utilisant des volumes distincts. Pour un déploiement sur plusieurs hôtes, migrer la même machine à états vers une file/base partagée avant activation. Sauvegarder la DB avec l’API backup SQLite, pas par copie isolée du fichier pendant des écritures WAL. Restreindre les sauvegardes comme la DB et appliquer la politique de conservation du service ; aucune suppression automatique des historiques approuvés n’est introduite.

## Facebook et contrat vérifié

Les services existants de publication interclubs écrivent des résultats et préparent des textes ; ils ne publient pas sur Facebook. `match_day_meta.py` constitue donc un adaptateur de Page spécifique, avec transport injectable pour les tests.

Documentation officielle récupérée le 13 octobre 2026 :

- [Graph API Changelog](https://developers.facebook.com/docs/graph-api/changelog/) : v26.0, introduite le 29 juillet 2026.
- [Page Photos v26.0](https://developers.facebook.com/docs/graph-api/reference/page/photos/) : `POST /{page-id}/photos`, fichier multipart `source`, `caption`, `published=true` ; Page access token, CREATE_CONTENT, pages_read_engagement, pages_manage_posts et pages_show_list. PNG accepté, limite 10 MB ; Meta recommande moins de 1 MB pour les PNG et peut redimensionner l’image après réception.
- [Pages Posts](https://developers.facebook.com/docs/pages-api/posts/) : IDs de photo/post, URL de post, contraintes des posts planifiés, mises à jour et suppression. Ces opérations distantes de programmation ne sont pas utilisées en V1.

L’autorité de programmation est uniquement interne. À l’échéance, une requête multipart envoie le PNG durable et sa légende. Aucun `scheduled_publish_time` Meta, aucune double programmation, aucun téléchargement de média par URL publique. Le token est envoyé en Authorization, jamais dans les URL. Un succès exige un `post_id` correspondant à la Page attendue. Le statut Programmé n’affirme pas un succès Meta ; seul le worker peut marquer Publié après la réponse confirmée. Les redimensionnements propres à Facebook ne changent pas le PNG original validé et envoyé.

L’état de connexion vérifie l’identité `/me` du token de Page. Il ne prétend pas prouver les droits CREATE_CONTENT par ce seul GET : les droits de publication doivent être accordés à l’application/personne et le POST Meta reste l’autorité finale. Les erreurs ne reprennent pas les réponses brutes ou secrets de Meta. Les profils personnels, groupes, Stories automatiques et lots d’images ne sont pas pris en charge.

## Configuration et activation après autorisation de déploiement

Le studio et la diffusion sont indépendants et désactivés par défaut. Mettre les variables dans la configuration serveur habituelle, jamais dans un nom NEXT_PUBLIC pour un secret.

```dotenv
# Frontend ET backend/worker
MATCH_DAY_ENABLED=true
# Doit correspondre au seul Admin déjà autorisé dans profiles.role
ADMIN_USER_ID=<UUID_ADMIN_EXISTANT>
INTERNAL_API_TOKEN=<SECRET_INTERNE_EXISTANT>

# Backend ET worker seulement ; garder false jusqu’à validation de la configuration Meta
MATCH_DAY_FACEBOOK_ENABLED=false
MATCH_DAY_DB_PATH=/app/data/match_day.sqlite3
MATCH_DAY_META_PAGES=[{"id":"<ID_PAGE_AUTORISEE>","name":"<NOM_PAGE_VERIFIE>","token_env":"MATCH_DAY_PAGE_TOKEN"}]
MATCH_DAY_PAGE_TOKEN=<PAGE_ACCESS_TOKEN>
```

Le nom d’environnement indiqué dans `token_env` doit contenir un vrai token de cette Page. Le nom de la Page ne sert jamais d’autorisation. Ne pas supposer que 974Darts et NDX Performance Lab désignent la même Page. Les `id` doivent être numériques réels ; les placeholders de cette documentation ne forment pas une configuration utilisable.

Après la revue et une autorisation distincte :

1. Sauvegarder le volume backend ; vérifier les droits d’écriture du compte darts UID 10001 et la présence des identités/licences/équipes de la saison.
2. Configurer MATCH_DAY_ENABLED sur frontend/backend/worker, garder MATCH_DAY_FACEBOOK_ENABLED=false. Rebuild frontend/backend et le worker avec les procédures du dépôt. Le service worker de Compose est sous le profil `match-day` ; utiliser ce profil lors de son démarrage. Pas de migration distante ni nouvelle clé Supabase.
3. Vérifier l’accès Admin et le refus d’un compte joueur, les effectifs des saisons, le rattachement calendrier, l’export et une restauration réelle de brouillon dans l’environnement de validation.
4. Configurer explicitement une Page, son token de Page, les permissions Meta et les tâches CREATE_CONTENT. Terminer les démarches Meta App Review/Business Verification nécessaires à l’application et à son mode d’accès. Contrôler la Page affichée dans l’écran d’état.
5. Autoriser séparément une publication de test réelle sur la Page choisie, puis seulement activer MATCH_DAY_FACEBOOK_ENABLED sur le backend et le worker. Vérifier la confirmation Publié et le lien distant avant une campagne.

Les étapes de production ci-dessus n’ont pas été exécutées pendant cette livraison. Une configuration Meta réelle et la vérification de permissions ne peuvent pas être certifiées sans les accès correspondants.

## Script de mise en production

`deploy/deploy-match-day.sh` s’exécute avec sudo depuis le checkout de production propre, après sa mise à jour vers le commit fusionné vérifié. Il reçoit ce commit et le commit précédent, sauvegarde les fichiers privés, sauvegarde SQLite avec son API dédiée, conserve les images frontend/backend précédentes, construit puis recrée uniquement frontend/backend et le nouveau worker. Il active le studio et force la diffusion Facebook à false ; il ne remplace aucun token.

Les API Admin sont contrôlées avec les identifiants serveur sans les afficher, les effectifs 2027 sont vérifiés et un appel anonyme doit recevoir 401. En cas d’erreur après activation, le script restaure l’environnement et les deux anciennes images, arrête le nouveau worker et conserve les données. Le répertoire de sauvegarde contient `rollback.yaml`. Ce script a passé `bash -n` mais son exécution sur le VPS reste nécessaire pour confirmer le déploiement.

Le timeout de la longue suite navigateur CI passe de 10 à 20 minutes : le premier run de la PR avait atteint la limite de 10 minutes après ses derniers tests réussis, sans assertion en échec. Aucun test n’est retiré.

## Retour arrière

Désactiver MATCH_DAY_FACEBOOK_ENABLED côté backend/worker et arrêter le service match-day-worker avant toute restauration. Annuler/suspendre les tâches futures depuis l’Admin si nécessaire ; ne jamais effacer une tâche à vérifier pour la réessayer. Désactiver MATCH_DAY_ENABLED côté frontend/backend. Restaurer les images précédentes par le workflow de release existant en conservant le volume privé. Les cartes publiques, profils, calendrier et résultats restent utilisables. Il n’y a ni migration Supabase à annuler ni post distant à supprimer. Réactiver la file uniquement après revue des échéances et des versions approuvées.

## Validation exécutée

- `npm test` : suite frontend complète passée, avec warnings de lint préexistants, incluant Jeux, Vision, Player Card, affiliations, guide KPI, MVP, filtres statistiques, BDC et les tests Match Day.
- `npm run build` : build de production passé. Un essai lancé simultanément au serveur dev avait échoué sur ses types temporaires ; le build séquentiel a passé.
- `test_match_day.py` : 28 cas sur SQLite, premiers accès concurrents, versions, anti-doublons, reprise, échéances, calendrier, manifeste, identité/visibilité/saison, sécurité et adaptateur Meta avec MockTransport.
- 33 tests backend existants + 18 subtests sur les saisons et interclubs passés (sélection de non-régression documentée ; la suite unittest existante (123 tests) a également passé).
- `test-match-day-browser.mjs` : sept parcours Chromium passés, sans erreur JavaScript. Source synthétique locale mais routes et persistance Match Day réelles. PNG Publication/Story, huit variantes, mêmes thèmes, inversion, réouverture, validation et comparaison binaire au PNG stocké, photo, KPI, calendrier répété, mobile 390 px sans débordement, masque historique et huit joueurs par côté en Story. Publication trop dense bloquée.
- PNG et captures inspectés visuellement, contenus uniquement synthétiques : [Publication](match-day-qa/duel-publication.webp), [Story avec huit joueurs](match-day-qa/dense-story.webp), [Studio desktop](match-day-qa/studio-desktop.webp), [Studio mobile](match-day-qa/studio-mobile.webp). Ces visuels ne sont pas des affiches de rencontres réelles.

Restent manuels : Safari/iPhone/Android physiques, lecture sur les applications sociales réelles, droits/token Meta d’une vraie Page, premier envoi réel autorisé, accès aux données de production et exploitation du worker sous Docker. Aucun post Meta réel, aucune fusion, aucun déploiement ou modification de secrets effectués.

### Reproduire les contrôles

```bash
cd app/backend
python -m pytest -q tests/test_match_day.py
cd ../frontend
npm test
npm run build
PLAYWRIGHT_MODULE_PATH=/chemin/playwright \
CHROMIUM_EXECUTABLE_PATH=/chemin/chromium \
node scripts/test-match-day-browser.mjs
```

Le test navigateur démarre et ferme ses propres serveurs locaux sur 8123 et 3123, avec l’auth de démonstration existante et une source synthétique privée. Il nécessite uvicorn/Pillow/les dépendances backend dans le runtime de validation et Playwright/Chromium hors des dépendances de production. Les captures sont écrites dans MATCH_DAY_QA_OUTPUT, `/tmp/match-day-qa` par défaut. Ne pas lancer build et dev simultanément dans la même copie du frontend.
