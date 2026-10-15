# KPI Scoring 120–139

Compte les volées réelles de 120 à 139 points inclus. 119 et 140 sont exclus.
Il s'agit d'un sous-ensemble du compteur Nakka `scores_100` (100–139), qui
reste inchangé. Le total cumulatif 100+ des analyses BDC reste lui aussi
inchangé. Ne jamais additionner le nouveau sous-compteur au volume existant.
Aucune formule MVP, DNA ou indice de duo n'est modifiée.

## Chemin des données

| Source / composant | Comportement |
| --- | --- |
| Interclubs N01/Nakka, `interclub_analysis_source.py` | Calcule chaque score par différence de restants successifs, après le restant initial 501. Attribue les volées des doubles par alternance des joueurs. Compte également les sorties de 120–139. Un bust dont le restant ne change pas ne compte pas. |
| `interclub_publication_service.py` | Résout les identités officielles et applique les corrections J2 avant de publier. Le sous-compteur suit les séries effectivement attribuées à Christophe. |
| RPC `publish_interclub_scoring` | Appelle le publieur existant avec sa forme historique de payload, puis enregistre le nouveau champ dans la même transaction et sous le même verrou de saison. Les empreintes d'audit existantes restent identiques. Le compteur est remplacé, jamais incrémenté. |
| Import Excel / statistiques agrégées Nakka de tournoi | N'expose pas les volées individuelles : aucune estimation à partir de `100+`, du score total d'un leg ou du nombre de fléchettes. Valeur inconnue. |
| Moteurs joueur et duo existants | Somment le champ pour leur périmètre habituel (saison, joueur, identités canoniques, équipe représentée, matchs/legs admissibles). Aucun moteur parallèle. |
| Frontend | Barres joueur et duo, historique des matchs, tableau joueurs, tableaux de tournois et guide KPI. Ordre croissant des catégories, couleurs des anciens compteurs conservées, cartes mobiles issues des mêmes cellules. Les tableaux de tournois restent à « — » lorsque leurs imports ne fournissent pas le détail. |

## Valeurs inconnues et couverture

La migration ajoute uniquement `player_leg_stats.scores_120_139`, entier
nullable, sans valeur par défaut. Une valeur connue doit être positive ou nulle
et ne peut dépasser `scores_100`. Les anciennes lignes restent à NULL.

L'API expose :

- `scores_120_139` : total uniquement si toutes les lignes du périmètre sont renseignées ; sinon NULL.
- `scores_120_139_observed` : somme des seules lignes connues, ou NULL sans couverture.
- `scores_120_139_coverage` : statut `complete` / `partial` / `unavailable`, nombre de participations joueur-leg couvertes et nombre total.

Le graphique explique une couverture partielle ; les cellules affichent « — »
avec le détail en infobulle. Un zéro observé reste un zéro. Une période vide
reste inconnue. La lecture des anciens champs fonctionne aussi avant la migration.
Les requêtes frontend restent `no-store` : le prochain chargement reflète la
synchronisation terminée.

## Mise en service, après revue

Aucune opération de production n'est incluse dans la préparation de cette PR.

1. Appliquer `supabase/migrations/20261015103031_scoring_120_139.sql` après les migrations interclubs/J2 existantes.
2. Déployer le backend et le frontend de cette branche. Le nouveau backend requiert la nouvelle RPC pour les publications interclubs.
3. Depuis le dossier `app/backend`, avec la configuration serveur habituelle, examiner le recalcul sans écrire :

   ```bash
   python -m app.scripts.backfill_scoring_120_139
   ```

4. Après vérification des rencontres et volumes, enregistrer les valeurs exactes :

   ```bash
   python -m app.scripts.backfill_scoring_120_139 --apply
   ```

   Option ciblée : `--event-id t_uAfU_5679`.

Le script reprend les résultats détaillés vérifiés avec un lien Nakka conservé.
Il relit les volées, contrôle les identités, puis repasse les contrôles complets
du publieur. Un changement des statistiques existantes provoque un refus et un
rollback. Le dry-run contrôle la source et les identités ; les contrôles de
cohérence avec les lignes stockées s'effectuent lors de l'application atomique.
Il ne publie aucun message Facebook ni autre contenu éditorial.

La réexécution est idempotente. Les imports historiques ou de tournois qui ne
conservent que des agrégats restent inconnus. Le publieur actuel ne prend en
charge que les effectifs interclubs 2026–2027 : le script signale les autres
saisons comme indisponibles et ne modifie pas cette limite. Leur lecture et les
filtres 2026/2027/2028 restent disponibles.

## Vérifications

- `cd app/backend && python -m pytest tests -q`
- `cd app/backend && python -m unittest discover -s tests -p 'test_*.py'`
- `cd app/frontend && npm test`
- `cd app/frontend && npm run build`
- `cd tests/workflow && npm test`

Les nouveaux tests couvrent les bornes, les vraies volées Nakka (dont les
doubles), la correction J2, plusieurs matchs, les saisons/équipes, l'absence de
détail, le zéro, la couverture partielle, le dry-run, la migration, les droits
RPC, les audits et les compteurs historiques inchangés, le rollback, les
réimports et les nouveaux imports. Le test frontend vérifie les cellules des
cartes mobiles, la documentation de couverture et l'invariance des composantes
MVP quel que soit le nouveau compteur.
