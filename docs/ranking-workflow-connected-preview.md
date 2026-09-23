# Préproduction connectée — classement individuel

État vérifié le **23 septembre 2026 après publication de la version 5**. Projet Supabase : **974 Darts Preview Licencies** (`yndxyiaclzcfyqrxdxdo`, eu-west-3). La recette est accessible sur **https://preview-ds.974darts.re**. Les migrations et l’application de production n’ont pas été déployées par cette étape ; le proxy Caddy commun a reçu un hôte supplémentaire pour la prévisualisation, avec sauvegarde, validation et rechargement.

## Base préparée

Le projet isolé possède maintenant les profils compatibles avec la connexion Next.js, le rôle `SPORTS_DIRECTOR`, les sept tables privées du workflow et ses fonctions transactionnelles. Le bootstrap de profils est conservé dans `supabase/preview_migrations`, séparément des migrations de production. Il refuse une base ayant déjà des profils, un rôle applicatif ou des utilisateurs Auth. Aucun utilisateur, invitation ou email n’est créé par ces migrations.

| Migration | Fichier du dépôt | Version enregistrée en préproduction |
|---|---|---|
| Profils de préproduction uniquement | `supabase/preview_migrations/20260923123248_ranking_preview_auth_bootstrap.sql` | `20260923123428` |
| Rôle DS | `supabase/migrations/20260923103732_sports_director_role.sql` | `20260923123446` |
| Circuit de validation | `supabase/migrations/20260923103743_ranking_workflow.sql` | `20260923123507` |

Les versions enregistrées par le connecteur diffèrent des horodatages générés localement. Les contenus correspondent aux fichiers cités. Ne pas rejouer ces migrations sur ce projet ni utiliser un `db push` global pour synchroniser ces historiques différents.

## Contrôles réalisés à la préparation de la base

- Les anciennes tables de classement sont inchangées : comparaison des événements complets et de l’empreinte de toutes les lignes de résultats avant/après (`3429a715302ebcc83d152d196dff5a7b`).
- La reprise historique comprend **T5 : 16 résultats / 50 points**. Aucune signature DS n’est inventée.
- Lecture publique par la fonction exécutée en rôle serveur : réussie. Lecture des brouillons et appels des fonctions refusés en rôles `anon` et `authenticated`.
- RLS active sur les sept tables privées ; aucun droit client de lecture/écriture. Un profil connecté peut modifier son nom, pas son rôle.
- Tests locaux : **51 contrôles transactionnels** et **11 contrôles du bootstrap/profils** réussis.
- Security Advisors : aucune erreur ni alerte WARN. Huit informations « RLS sans politique » correspondent aux tables intentionnellement fermées aux clients, dont sept nouvelles tables privées. [Explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Performance Advisors : une alerte WARN préexistante sur la politique de `players`, sans rapport avec ce changement. [Explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan). Les informations d’index inutilisés sont attendues sur une base de recette. Les trois informations de clés étrangères propres au workflow concernent une configuration limitée à une ligne et les pointeurs d’événement déjà recherchables par leur clé primaire `id` ; elles ne bloquent pas cette recette.

## Prévisualisation démarrée sur le VPS

Le worktree `/opt/974darts/ranking-ds-preview` a été démarré au commit **`3df24b7692ac0d00b1b63f94b3227d6639975621`**, dont les quatre jobs CI ont réussi. Le projet Compose `darts974-ranking-preview` utilise uniquement `127.0.0.1:3080` et son propre volume. Les anciennes prévisualisations restent sur 3100–3800. Les services `ranking-frontend` et `ranking-backend` ont des noms distincts de `frontend`/`backend` en production, pour éviter une collision DNS Docker.

Nicolas a créé l’entrée DNS **A** `preview-ds` vers **`137.74.163.25`**, TTL par défaut. Les contrôles locaux puis HTTPS de `/api/health` ont renvoyé `status: ok`, `demoMode: false`, `supabaseUrlConfigured: true` et `publicKeyConfigured: true`. Les connexions réelles aux comptes Auth de recette administrateur et DS ont ensuite réussi dans le navigateur.

Commande de référence utilisée pour démarrer cette instance ; il n’est pas nécessaire de la rejouer pour consulter la recette :

```sh
sudo env RANKING_PREVIEW_ORIGIN=https://preview-ds.974darts.re \
  docker compose --env-file /etc/974darts/ranking-preview.env \
  -f /opt/974darts/ranking-ds-preview/deploy/compose.ranking-preview.yaml \
  up -d --build --wait --wait-timeout 180

curl -fsS http://127.0.0.1:3080/api/health

sudo docker ps --filter name=darts974-ranking-preview \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

sudo docker inspect darts974-caddy-1 \
  --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}Caddyfile={{.Source}}{{end}}{{end}}'
```

Les contrôles de santé ont validé le backend puis le frontend. Le worker a réellement collecté et analysé la source Nakka du T5. L’origine est passée explicitement à Compose ; le fichier d’environnement n’est pas exécuté comme script shell.

Le conteneur `darts974-caddy-1` a rejoint le réseau `darts974-ranking-preview_default`. Un hôte `preview-ds.974darts.re` relaie vers `ranking-frontend:3000` avec l’en-tête `X-Robots-Tag: noindex, nofollow`. Le fichier monté est `/opt/974darts/releases/20260914T111500Z/deploy/Caddyfile` ; sa sauvegarde est `Caddyfile.before-preview.e5lNZy` dans le même répertoire. Le candidat a été validé avant écriture ; l’écriture a conservé l’inode du fichier monté, puis Caddy a été rechargé. Le contrôle HTTPS du site principal a réussi après rechargement.

Cette connexion réseau a été ajoutée au conteneur Caddy existant. Si un futur déploiement recrée ce conteneur ou remplace le fichier de configuration par celui d’une nouvelle release, il faudra conserver ou rétablir le raccordement de la prévisualisation. Aucun changement de la configuration de déploiement de production n’a été ajouté pour le rendre permanent.

`deploy/check-ranking-preview.py` produit un rapport en lecture seule : version installée, conteneurs, ports concernés et présence des paramètres de préproduction. Il n’affiche aucune valeur d’environnement. Le lancer avec Python 3 depuis la branche de revue, sans changer le checkout de production.

L’application utilise l’origine HTTPS de recette dans `RANKING_PREVIEW_ORIGIN` pour le parcours sécurisé de connexion et d’envoi.

## Configuration et comptes de recette

Nicolas a exécuté `deploy/setup-ranking-preview.py`. Les fichiers `/etc/974darts/ranking-preview.env` et `/etc/974darts/ranking-preview-access.json` sont présents en droits `600`. Le contrôle de configuration confirme le projet isolé, la présence des paramètres requis et les emails désactivés, sans afficher leurs valeurs.

Le script demande sur le terminal la clé publique (`publishable` ou `anon`) et la clé serveur (`secret` ou `service_role`) du seul projet `yndxyiaclzcfyqrxdxdo`. Les saisies sont masquées ; les clés sont contrôlées auprès de l’URL fixe du projet, sans redirection HTTP. Les valeurs ne doivent pas être collées dans la conversation.

Le script a créé deux comptes techniques de recette à des adresses réservées `.invalid`, puis leurs profils `ADMIN` et `SPORTS_DIRECTOR`. Il utilise l’API Auth administrateur avec confirmation de ces identités de test, **sans invitation ni email**, jamais les coordonnées de Corentin. Il vérifie chaque connexion par mot de passe et la lecture de son propre profil avant de fermer les sessions de contrôle. Les rôles sont affectés dans `profiles`, jamais depuis les métadonnées utilisateur. [Référence Supabase](https://supabase.com/docs/reference/python/auth-admin-createuser).

Les identifiants de recette sont conservés uniquement sur le serveur. Aucun fichier existant de configuration n’est écrasé ; une interruption après création d’un compte peut être reprise avec les identifiants déjà enregistrés. Le script de configuration ne démarre aucun service et laisse les emails désactivés. Ne pas partager le contenu du fichier d’identifiants. Ces comptes de test ne doivent pas être repris comme comptes personnels en production.

Neuf tests sans réseau couvrent la préparation, la reprise après interruption, la preuve de possession du mot de passe, les fichiers existants, les liens symboliques, les redirections et le refus d’une clé de production ou d’une clé privée à la place de la clé publique.

## Recette connectée du T5 : publication confirmée

Compétition : `club-open-kaz-2026-09-13`, source Nakka `t_aKyY_3246`. La collecte réelle a récupéré **35 participants et 90 rencontres**, dont 60 de poules et 30 de tableaux. La version 2 a demandé les classements et pièces de contrôle ; les versions 3 à 5 correspondent aux corrections enregistrées par Nicolas. Les classements ambigus et les identités non rapprochées n’ont pas été validés automatiquement.

La version 5 a franchi les quatre décisions sur les comptes Auth distincts de recette :

| Étape | Rôle | 23 septembre 2026, heure Réunion |
|---|---|---|
| Envoi au DS | ADMIN | 21:46:23 |
| Validation sportive | SPORTS_DIRECTOR | 21:58:26 |
| Contrôle final | ADMIN | 22:05:14 |
| Publication | ADMIN | 22:05:26 |

La vérification SQL après publication confirme :

- version courante et version publiée **5**, statut **PUBLISHED**, aucune anomalie bloquante ;
- les quatre décisions portent sur l’empreinte de cette même version ;
- projection publique `ranking_published_snapshot('2026-2027')` : **une compétition, 35 lignes, 50 points** ;
- **13 joueurs avec des points** ; aucune différence de points par identité avec le T5 historique, aucune addition de l’ancienne version ;
- cinq versions conservées et audit des étapes ;
- deux notifications (`SUBMIT`, `APPROVE_DS`) en état **QUEUED**, **zéro tentative**, aucune acceptation SMTP : l’envoi est volontairement désactivé.

La publication est celle du projet de prévisualisation. Elle ne constitue ni une validation personnelle de Corentin ni une publication sur la base de production.

## Étapes restantes

1. Préparer puis autoriser séparément la mise en production de la branche et de ses deux migrations. Ne pas copier les comptes, secrets, décisions ou fichiers de configuration de recette vers la production.
2. À réception de l’email de **Corentin Bouazin**, préparer son accès personnel vérifié et son rôle `SPORTS_DIRECTOR`, puis l’affecter aux dossiers. Les brouillons peuvent être préparés avant cette affectation.
3. Configurer et tester les notifications SMTP avec des destinataires autorisés avant activation. La recette actuelle ne démontre pas la délivrabilité des emails. Ne pas activer l’envoi de la file de recette aux adresses fictives `.invalid`.

Le parcours de demande de correction par le DS et de nouvelle validation a été vérifié dans les tests automatisés isolés ; ce compte rendu connecté atteste le parcours complet d’analyse, corrections administrateur, validation DS et publication du T5. La connexion personnelle de Corentin, un nouveau tournoi distinct et la charge multi-connexions restent hors de cette recette.
