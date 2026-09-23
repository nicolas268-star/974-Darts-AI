# Préproduction connectée — classement individuel

État vérifié le **23 septembre 2026**. Projet Supabase : **974 Darts Preview Licencies** (`yndxyiaclzcfyqrxdxdo`, eu-west-3). Le projet de production et le VPS de production n’ont pas été modifiés par cette étape.

## Base préparée

Le projet isolé possède maintenant les profils compatibles avec la connexion Next.js, le rôle `SPORTS_DIRECTOR`, les sept tables privées du workflow et ses fonctions transactionnelles. Le bootstrap de profils est conservé dans `supabase/preview_migrations`, séparément des migrations de production. Il refuse une base ayant déjà des profils, un rôle applicatif ou des utilisateurs Auth. Aucun utilisateur, invitation ou email n’est créé par ces migrations.

| Migration | Fichier du dépôt | Version enregistrée en préproduction |
|---|---|---|
| Profils de préproduction uniquement | `supabase/preview_migrations/20260923123248_ranking_preview_auth_bootstrap.sql` | `20260923123428` |
| Rôle DS | `supabase/migrations/20260923103732_sports_director_role.sql` | `20260923123446` |
| Circuit de validation | `supabase/migrations/20260923103743_ranking_workflow.sql` | `20260923123507` |

Les versions enregistrées par le connecteur diffèrent des horodatages générés localement. Les contenus correspondent aux fichiers cités. Ne pas rejouer ces migrations sur ce projet ni utiliser un `db push` global pour synchroniser ces historiques différents.

## Vérifications réalisées

- Les anciennes tables de classement sont inchangées : comparaison des événements complets et de l’empreinte de toutes les lignes de résultats avant/après (`3429a715302ebcc83d152d196dff5a7b`).
- La reprise historique comprend **T5 : 16 résultats / 50 points**. Aucune signature DS n’est inventée.
- Lecture publique par la fonction exécutée en rôle serveur : réussie. Lecture des brouillons et appels des fonctions refusés en rôles `anon` et `authenticated`.
- RLS active sur les sept tables privées ; aucun droit client de lecture/écriture. Un profil connecté peut modifier son nom, pas son rôle.
- Tests locaux : **51 contrôles transactionnels** et **11 contrôles du bootstrap/profils** réussis.
- Security Advisors : aucune erreur ni alerte WARN. Huit informations « RLS sans politique » correspondent aux tables intentionnellement fermées aux clients, dont sept nouvelles tables privées. [Explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Performance Advisors : une alerte WARN préexistante sur la politique de `players`, sans rapport avec ce changement. [Explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan). Les informations d’index inutilisés sont attendues sur une base de recette. Les trois informations de clés étrangères propres au workflow concernent une configuration limitée à une ligne et les pointeurs d’événement déjà recherchables par leur clé primaire `id` ; elles ne bloquent pas cette recette.

## Prochaine action sur le VPS

Le retour VPS confirme que **3080 est libre** ; les anciennes prévisualisations restent sur 3100–3800. Le projet Compose `darts974-ranking-preview` utilise uniquement `127.0.0.1:3080` et son propre volume. Les services s’appellent `ranking-frontend` et `ranking-backend` : ces noms distincts évitent une collision avec les noms Docker `frontend`/`backend` de production si Caddy rejoint ensuite le réseau de recette.

Origine choisie : **https://preview-ds.974darts.re**. Au contrôle DNS du 23 septembre, le domaine principal pointe vers `137.74.163.25` et le sous-domaine n’existe pas encore. Ajouter dans la zone `974darts.re` une entrée **A**, sous-domaine **preview-ds**, cible **137.74.163.25**, TTL par défaut. Laisser les entrées du domaine principal inchangées.

La construction/démarrage local peut commencer avant la propagation DNS. Depuis le VPS, après récupération du commit validé, créer un worktree dédié `/opt/974darts/ranking-ds-preview` à ce commit, puis :

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

Les contrôles de santé attendent le backend puis le frontend. L’origine est passée explicitement à Compose ; aucune lecture/exécution du fichier d’environnement comme script shell n’est nécessaire. À ce stade, Caddy n’est pas rechargé, aucun port public n’est ajouté et l’URL HTTPS de recette n’est pas encore accessible. Le raccordement au proxy et son certificat suivront après confirmation du DNS, du chemin Caddyfile et du démarrage local.

`deploy/check-ranking-preview.py` produit un rapport en lecture seule : version installée, conteneurs, ports concernés et présence des paramètres de préproduction. Il n’affiche aucune valeur d’environnement. Le lancer avec Python 3 depuis la branche de revue, sans changer le checkout de production.

Ce rapport permettra de choisir l’origine HTTPS et de raccorder le conteneur isolé au proxy existant. L’application attend une origine HTTPS réelle dans `RANKING_PREVIEW_ORIGIN` : une simple visite de `http://IP:3080` ne suffit pas pour le parcours sécurisé de connexion et d’envoi.

## Ce qui reste à raccorder

### Configuration guidée sur le VPS

Le retour VPS de Nicolas confirme l’absence de `/etc/974darts/ranking-preview.env` et de `/etc/974darts/preview.env`. Le script `deploy/setup-ranking-preview.py` est préparé pour la prochaine action, **pas encore exécuté sur le VPS**.

Lancer ce script avec `sudo python3`. Il demande sur le terminal la clé publique (`publishable` ou `anon`) et la clé serveur (`secret` ou `service_role`) du seul projet `yndxyiaclzcfyqrxdxdo`. Les saisies sont masquées ; les clés sont contrôlées auprès de l’URL fixe du projet, sans redirection HTTP. Les valeurs ne doivent pas être collées dans la conversation.

Le script crée deux comptes techniques de recette à des adresses réservées `.invalid`, puis leurs profils `ADMIN` et `SPORTS_DIRECTOR`. Il utilise l’API Auth administrateur avec confirmation de ces identités de test, **sans invitation ni email**, jamais les coordonnées de Corentin. Il vérifie chaque connexion par mot de passe et la lecture de son propre profil avant de fermer les sessions de contrôle. Les rôles sont affectés dans `profiles`, jamais depuis les métadonnées utilisateur. [Référence Supabase](https://supabase.com/docs/reference/python/auth-admin-createuser).

Le fichier `ranking-preview.env` et les identifiants de recette `ranking-preview-access.json` sont conservés uniquement sur le serveur en droits `600`. Aucun fichier existant de configuration n’est écrasé ; une interruption après création d’un compte peut être reprise avec les identifiants déjà enregistrés. Le script ne démarre aucun service et laisse les emails désactivés. L’origine HTTPS sera définie à l’étape suivante, après lecture du rapport de ports/conteneurs complet. Ne pas partager le contenu du fichier d’identifiants.

Neuf tests sans réseau couvrent la préparation, la reprise après interruption, la preuve de possession du mot de passe, les fichiers existants, les liens symboliques, les redirections et le refus d’une clé de production ou d’une clé privée à la place de la clé publique.

### Raccordements restants

1. Fichier serveur isolé `/etc/974darts/ranking-preview.env` avec les clés du projet de préproduction et des droits `600`. Ne jamais recopier le fichier de production ni transmettre de clé privée dans la conversation.
2. Accès administrateur de recette via Supabase Auth, puis profil `ADMIN` et ligne `ranking_workflow_config.administrator_id` avec le même UUID que `ADMIN_USER_ID` dans frontend/backend/worker. Il n’existe actuellement aucun compte Auth dans ce projet : l’administrateur de production n’y est pas automatiquement reconnu.
3. Démarrage de `deploy/compose.ranking-preview.yaml` dans un checkout isolé avec l’origine HTTPS vérifiée ; les emails restent forcés à `false`.
4. Recette par vraie connexion administrateur : historique, création sans DS, analyse Nakka, enregistrement et refus d’envoi tant que le DS manque. Puis recette avec un compte DS de test explicitement créé pour ce projet.
5. Lorsque son email sera disponible : préparation de l’accès personnel de **Corentin Bouazin**, indépendamment des comptes de test. La mise en production reste une étape distincte après recette.

Aucun test de connexion réelle, SMTP ou tournoi Nakka en conditions réelles n’est encore attesté par cette préparation de base.
