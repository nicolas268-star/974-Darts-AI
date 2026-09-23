# Mise en production du classement — 23 septembre 2026

Nicolas a explicitement autorisé la mise en production après la recette connectée. La PR #30 est fusionnée sur `main` au commit `13a560516bbb4cb0444d8c4e4599a4996b70a488`. Son arbre `0c6330f70c523b57c508b3e4d2b6a33c304d667d` est identique à celui du dernier commit de la branche validée. Les quatre jobs de la CI 35901022404 ont réussi sur ce contenu.

## Base de production : réalisé

Projet `vkvdyrsrvbyugbjlmknb`, « 974 Darts AI », état sain. Les deux migrations ont été appliquées séparément :

| Fichier versionné | Version enregistrée en production |
|---|---|
| `20260923103732_sports_director_role.sql` | `20260923182837` |
| `20260923103743_ranking_workflow.sql` | `20260923182900` |

Ne pas rejouer ces migrations et ne pas lancer un `db push` global pour aligner les horodatages. Aucun bootstrap de préproduction, compte de recette ou décision de recette n'a été copié.

Contrôles après migration :

- Administrateur unique Nicolas, actif et confirmé, correctement sélectionné dans la configuration.
- T5 repris comme attestation historique en version 1 : 16 résultats, 50 points. Aucune signature DS inventée ; zéro décision et zéro notification.
- Aucune différence entre la projection publique nouvelle et les résultats historiques, y compris identités, noms canoniques, clubs, genres et points.
- Anciennes lignes inchangées : empreinte `3429a715302ebcc83d152d196dff5a7b` avant et après.
- Sept tables privées sous RLS, sans lecture client ; les trois RPC ne sont exécutables que côté serveur. Un utilisateur peut modifier son nom de profil, pas son rôle.
- Security Advisors : aucune nouvelle alerte WARN/ERROR. Les sept informations supplémentaires concernent les tables volontairement sans politique client. Les avertissements existants (extension unaccent, fonctions de jeu SECURITY DEFINER, protection des mots de passe compromis) restent inchangés et hors de ce déploiement.

## Application VPS : déploiement confirmé

Nicolas a exécuté le script `deploy/activate-ranking-production.sh` et transmis sa ligne de succès : déploiement terminé au commit `13a560516bbb4cb0444d8c4e4599a4996b70a488`. Le script utilise `set -euo pipefail` ; ce message final n'est produit qu'après réussite des commandes et contrôles ci-dessous. La session d'assistance ne dispose pas d'un accès SSH direct : la confirmation d'exécution provient de la sortie du VPS fournie par Nicolas.

Sauvegarde sur le VPS : `/etc/974darts/before-ranking-production.PsZA4Q`. Elle contient la configuration précédente, le Caddyfile, le commit précédent et les références des anciennes images conservées. Ne pas partager son contenu : le fichier d'environnement contient des secrets.

Le script vise uniquement le commit applicatif fusionné ci-dessus. Il vérifie l'ascendance Git et refuse les modifications de fichiers suivis autres que l'ajout local déjà connu dans `deploy/Caddyfile`, ainsi que des fichiers source non suivis. Il sauvegarde la configuration, le Caddyfile réellement monté, le commit précédent et les anciennes images frontend/backend avant toute bascule. Les valeurs secrètes ne sont pas affichées.

La configuration Compose doit désigner le projet de production et le compte administrateur vérifié. Le script active le workflow et laisse les emails désactivés, reconstruit puis démarre seulement `backend`, `frontend` et `ranking-worker` avec le profil `ranking-workflow`. Il préserve le Caddyfile monté et ne recrée pas Caddy, les collecteurs ni les prévisualisations.

Les contrôles après démarrage ont réussi : attente de santé backend/frontend, démarrage du worker, projection publique (13 joueurs avec points, total 50), accès du worker à la base, emails désactivés, réponses de santé HTTPS production et prévisualisation, refus HTTP 401 d'accès anonyme à l'API privée et Caddyfile inchangé. Le worker n'a pas de healthcheck Docker : son accès à la base a été vérifié par une commande exécutée dans son conteneur. Le script n'exécute aucune suppression ni retour arrière automatique.

Un contrôle SQL indépendant après cette confirmation retrouve une compétition publiée en version historique 1, 16 résultats et 50 points, 13 joueurs avec points, l'administrateur attendu et l'empreinte historique inchangée. Aucune décision, tâche d'analyse ou notification n'est présente ; aucun email accepté. La version 5 de recette reste propre au projet de prévisualisation.

La connexion interactive de Nicolas au nouvel écran de production reste un contrôle d'usage à effectuer. Le parcours complet administrateur/DS a été validé en préproduction avec les comptes distincts de recette ; il n'a pas été rejoué avec un compte DS réel en production.

Après une première publication via le nouveau circuit, conserver le nouveau lecteur public lors d'une suspension des actions ; les anciennes tables n'intègrent pas les nouvelles publications. Voir `ranking-workflow.md` pour le retour arrière.

L'accès personnel de Corentin Bouazin attend son email. Les brouillons peuvent être préparés avant son affectation ; les nouvelles publications exigent toujours sa validation. L'envoi SMTP reste désactivé jusqu'au test avec des destinataires autorisés.
