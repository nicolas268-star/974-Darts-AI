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

## Application VPS : exécution et vérification encore attendues

Cette session ne dispose pas d'un accès SSH au VPS. Le script `deploy/activate-ranking-production.sh` est préparé pour être exécuté par Nicolas avec `sudo bash`. Sa présence ne signifie pas que les conteneurs ont déjà été déployés.

Le script vise uniquement le commit applicatif fusionné ci-dessus. Il vérifie l'ascendance Git et refuse les modifications de fichiers suivis autres que l'ajout local déjà connu dans `deploy/Caddyfile`, ainsi que des fichiers source non suivis. Il sauvegarde la configuration, le Caddyfile réellement monté, le commit précédent et les anciennes images frontend/backend avant toute bascule. Les valeurs secrètes ne sont pas affichées.

La configuration Compose doit désigner le projet de production et le compte administrateur vérifié. Le script active le workflow et laisse les emails désactivés, reconstruit puis démarre seulement `backend`, `frontend` et `ranking-worker` avec le profil `ranking-workflow`. Il préserve le Caddyfile monté et ne recrée pas Caddy, les collecteurs ni les prévisualisations.

Les vérifications prévues après démarrage portent sur la santé des services, la projection publique (13 joueurs avec points, total 50), l'accès du worker à la base, les emails désactivés, HTTPS et le refus d'accès anonyme à l'API privée. La prévisualisation HTTPS est également contrôlée. Un échec interrompt le script ; conserver la sortie et les sauvegardes pour le diagnostic. Il n'exécute aucune suppression ni retour arrière automatique.

Après une première publication via le nouveau circuit, conserver le nouveau lecteur public lors d'une suspension des actions ; les anciennes tables n'intègrent pas les nouvelles publications. Voir `ranking-workflow.md` pour le retour arrière.

L'accès personnel de Corentin Bouazin attend son email. Les brouillons peuvent être préparés avant son affectation ; les nouvelles publications exigent toujours sa validation. L'envoi SMTP reste désactivé jusqu'au test avec des destinataires autorisés.
