# Validation sportive du classement individuel

Cette branche intègre le circuit **Nakka → contrôle administrateur → Directeur sportif nominatif → contrôle final administrateur → publication**. Aucun déploiement ni migration de production n’a été exécuté. Le barème du double est **10 / 8 / 6 / 4 / 2 par joueur**, conformément à la clarification du 23 septembre 2026.

## Comportement

- `/admin/classement-individuel` gère les épreuves Club simple/double, Open Comité et Coupe Comité de 2026–2027. Catégories et points proviennent du serveur ; aucun champ de points n’est accepté du navigateur.
- `/directeur-sportif` est réservé à `SPORTS_DIRECTOR`. Le DS voit uniquement les versions qui lui ont été soumises. Il peut approuver ou demander une correction motivée ; il ne peut pas publier.
- Chaque analyse et correction crée un instantané immuable. Les confirmations portent sur son identifiant et son empreinte. Une version modifiée repasse par le DS.
- Une seule révision publiée contribue au classement par compétition. L’ancienne reste visible pendant les corrections ; la bascule, la décision et l’audit sont transactionnels.
- Les appels anciens `/committee-ranking/validate` et `/publish` répondent **410**. Ils ne constituent plus un moyen de contourner le nouveau circuit.
- La lecture publique `/api/v1/committee-ranking?season=2026-2027` filtre la saison et expose uniquement les résultats publiés. Les colonnes de la page publique sont dynamiques.
- Aucun joueur ni alias n’est créé automatiquement. Les alias confirmés servent au rapprochement ; une identité ambiguë doit être choisie dans le référentiel, ou le participant explicitement exclu des points avec un motif.
- En double, chaque participant Nakka représente un duo de deux lignes. Le classement et l’éligibilité sont contrôlés pour chaque joueur.
- Les classements ambigus, notamment en double élimination, exigent une référence officielle et un contrôle humain. Le Winner Bracket seul n’est pas considéré comme un classement final. Un résultat source incomplet reste bloquant.

## Stockage et sécurité

Les anciennes tables publiques sont conservées pour l’historique et le retour à la version applicative précédente. Les nouvelles tables `ranking_workflow_*` sont privées, avec RLS et retrait des droits client. Les instantanés contiennent résultats, identités, source, reconnaissance, barème et anomalies. Ce choix évite d’exposer des commentaires privés par l’ancien schéma public. L’API publique devient le point de lecture du classement actif.

La migration reprend T5 sans réimport : 16 lignes / 50 points, identifiants, dates, noms canoniques déjà affichés et noms Nakka d’origine. L’attestation historique est distinguée d’une signature DS ; aucune décision DS n’est inventée.

Le proxy Next.js vérifie l’utilisateur et le rôle, refuse le mode démo, limite les routes, le JSON et la taille des requêtes, contrôle l’origine des POST et transmet le token utilisateur côté serveur. FastAPI vérifie à nouveau ce token auprès de Supabase Auth et relit `profiles`. L’administrateur doit correspondre à `ADMIN_USER_ID` et à la configuration en base. Le rôle ne dépend jamais de `user_metadata` ou d’un `X-User-Id` du navigateur.

Les RPC sont `SECURITY INVOKER`, accessibles uniquement à `service_role`. Les commandes vérifient rôle, affectation du DS, version courante, état, confirmation et idempotence. Un verrou de ligne sérialise les décisions d’une compétition ; un verrou par club/saison protège le quota de reconnaissance. Audit et décisions sont append-only. Les acteurs historiques restent identifiables après suppression de leur compte.

Le collecteur privé réutilise les parseurs existants sans écrire `lastPreview` ou le cache public. Il accepte seulement les URL N01 reconnues et contacte deux chemins précis sur l’hôte Nakka de données. La connexion HTTPS est épinglée à une IP publique vérifiée, sans redirection ni compression ; taille, durée, participants et rencontres sont bornés. Cinq demandes d’analyse maximum par administrateur sur dix minutes ; une analyse active par compétition.

## Notifications

Les transitions créent leur email dans la même transaction que la décision. Le worker traite ensuite la file : lease, reprise, délais croissants, cinq essais maximum et erreur expurgée. Les adresses viennent des comptes Auth, jamais du navigateur. Les liens passent par la connexion et n’exécutent aucune décision par GET.

`SMTP_ACCEPTED` signifie que le serveur SMTP a accepté le message, pas qu’il a été remis ou lu. Une panne entre acceptation SMTP et enregistrement peut causer un doublon malgré le Message-ID stable. Les emails sont désactivés par défaut (`RANKING_EMAIL_ENABLED=false`). Aucun email réel n’a été envoyé pendant les tests.

## Prévisualisation testée

Le scénario navigateur utilise le vrai frontend, les vrais endpoints FastAPI et les vraies fonctions SQL PostgreSQL exécutées dans PGlite. Le service Auth/PostgREST de test et les comptes sont fictifs, sur loopback ; ce serveur ne doit jamais être déployé. Les captures sont issues du composant intégré, pas d’une maquette indépendante.

- [Administration](ranking-workflow-preview/01-administration.webp)
- [Directeur sportif](ranking-workflow-preview/02-directeur-sportif.webp)
- [Contrôle final](ranking-workflow-preview/03-controle-final.webp)
- [Classement public](ranking-workflow-preview/04-classement-public.webp)
- [Mobile](ranking-workflow-preview/05-mobile.webp)

Le 23 septembre 2026, une recette supplémentaire sur le VPS et le projet Supabase isolé a confirmé les connexions Auth administrateur/DS de test, la collecte Nakka réelle du T5 et la publication de sa version 5 après validation sportive et contrôle final. Sa projection publique comporte 35 lignes et 50 points, identiques par identité aux points historiques. Voir le [compte rendu connecté](ranking-workflow-connected-preview.md). La connexion personnelle de Corentin, la délivrabilité SMTP et un nouveau tournoi distinct restent à vérifier. PGlite ne remplace pas un test de charge multi-connexions sur le projet cible.

Vérifications locales réalisées : **86 tests backend**, **51 contrôles SQL**, parcours navigateur complet sur écran large et mobile (390 px), lint/typecheck et build Next.js. Le lint ne comporte aucune erreur ; les avertissements existants du dépôt restent hors de ce chantier. Docker Compose a été vérifié syntaxiquement ; Docker n’est pas disponible dans cet environnement.

## Rejouer les vérifications

```sh
cd app/backend
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py'
cd ../../tests/workflow
npm ci
npm test
npx playwright install chromium
npm run test:browser
cd ../../app/frontend
npm test
npm run build
```

Le scénario navigateur démarre et arrête ses propres services de test : ports loopback 55321, 8008 et 3008. Il ne contacte aucun projet Supabase existant ni un SMTP. Les mots de passe `preview-only` concernent exclusivement cette fixture jetable. Les requêtes Nakka ne sont pas déclenchées par ce scénario. Les captures ne contiennent que des noms fictifs.

## Préparer un environnement connecté isolé

**Avancement du 23 septembre 2026 :** la base du projet « Preview Licenciés », le démarrage isolé sur VPS et le raccordement HTTPS sont réalisés. Le T5 a été analysé, contrôlé, validé par le compte DS de recette puis publié en version 5. Voir le [compte rendu de préproduction connectée](ranking-workflow-connected-preview.md) avant toute exécution : les étapes SQL ci-dessous sont déjà réalisées sur ce projet.

1. Utiliser un projet Supabase de préproduction avec le schéma Auth/profiles et le référentiel existants. Le projet « Preview Licenciés » possède désormais les profils grâce au bootstrap spécifique de préproduction ; ne pas appliquer ce bootstrap en production.
2. Vérifier les prérequis : migrations historiques du classement et registre appliquées, `profiles.user_id`, enum `app_role`, référentiel canonique et comptes de test.
3. Sauvegarder le schéma et le contenu historique. Exécuter puis **committer séparément** `20260923103732_sports_director_role.sql`, avant `20260923103743_ranking_workflow.sql`. Le rôle enum doit être disponible dans la transaction suivante.
4. La configuration sélectionne l’ADMIN unique si présent. Sinon, renseigner explicitement `ranking_workflow_config.administrator_id` avec l’administrateur autorisé. Il doit également être `ADMIN_USER_ID` dans le backend et le frontend.
5. Vérifier les 16 lignes / 50 points de T5, ainsi que les noms publics ; exécuter les tests de droits avec des comptes Auth de test. Lancer les Security Advisors du projet cible après migration. Les tables privées sans politique client sont intentionnellement fermées.
6. Utiliser `deploy/compose.ranking-preview.yaml`, un fichier d’environnement **isolé**, les variables `RANKING_PREVIEW_*` et une origine HTTPS de préproduction. L’exemple `deploy/ranking-workflow.env.example` ne contient aucun secret réel. Le volume et le nom Compose sont distincts de la production ; le port HTTP interne reste lié à loopback et nécessite un reverse proxy HTTPS de préproduction.
7. Vérifier les identités, la reconnaissance et la portée du tableau d’une vraie compétition avant l’envoi au DS. L’horodatage d’import ne vaut pas preuve de réception des résultats.
8. Tester les emails seulement avec des destinataires de test explicitement autorisés, puis contrôler la réception. La file peut être consultée dans l’interface ; une erreur définitive nécessite un diagnostic de compte/SMTP avant remise en file par l’exploitant.

## Compte DS et activation future

Le Directeur sportif désigné par Nicolas est **Corentin Bouazin** ; son adresse email reste à recevoir. Cette attente ne bloque pas la préparation technique ni celle des compétitions : laisser le champ Directeur sportif sur **À désigner** pour créer, analyser et enregistrer les résultats. L’envoi au DS attend l’affectation d’un compte actif ; les nouvelles publications exigent toujours ses validations et le contrôle final de l’administrateur. Aucun compte provisoire ni adresse fictive ne sont nécessaires.

Quand Nicolas transmettra l’adresse : vérifier le compte correspondant, utiliser Supabase Auth pour l’accès personnel, puis attribuer explicitement `SPORTS_DIRECTOR` au profil vérifié. Affecter ensuite Corentin aux compétitions préparées et enregistrer une nouvelle version avant l’envoi. Les résultats préparés sont conservés ; il n’est pas nécessaire de recréer les compétitions. Ne pas déduire le rôle de son email ou de métadonnées modifiables par l’utilisateur. Les mises à jour personnelles de `profiles` sont limitées à `display_name` ; les associations sportives et rôles restent administrés côté serveur.

Le test SQL couvre la création et l’enregistrement sans DS, le refus d’envoi sans compte affecté, l’absence d’email et de publication à ce stade, puis l’affectation ultérieure sans perte des résultats et le parcours complet de validation.

Après recette et autorisation de mise en production : appliquer les deux migrations, configurer le même administrateur dans les deux services, activer `RANKING_WORKFLOW_ENABLED=true` dans frontend/backend/worker, puis lancer le service Compose optionnel `ranking-worker` avec le profil `ranking-workflow`. Le frontend doit être reconstruit avec les bonnes valeurs publiques Supabase. L’activation des emails nécessite séparément `RANKING_EMAIL_ENABLED=true`, `RANKING_SITE_ORIGIN` HTTPS et SMTP TLS valide.

Le barème n’est activé que pour 2026–2027. Une saison ultérieure nécessite son barème approuvé ; le serveur refuse d’appliquer silencieusement celui de 2026–2027.

## Retour arrière

Avant toute nouvelle publication, le retour à l’ancienne version applicative retrouve les anciennes tables intactes. Après une publication via le nouveau workflow, **ne pas désactiver son lecteur public ni revenir à l’ancien lecteur** : les anciennes tables n’intègrent pas les nouveaux points. Suspendre les actions (`RANKING_WORKFLOW_ENABLED=false`) et le worker : le nouveau lecteur continue à lire les révisions publiées dès que la RPC existe. Préparer un correctif contrôlé. Ne jamais supprimer les instantanés, décisions ou traces pour annuler une publication.
