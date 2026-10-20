# Captain Nico — analyse avant match

Captain Nico prépare une composition avant la rencontre à partir des statistiques disponibles. L’accès reste réservé à l’administration. Cette page ne saisit ni ne publie de résultats sportifs.

## Parcours

1. Choisir quatre titulaires dans chaque camp, puis jusqu’à deux remplaçants facultatifs. Le filtre par équipe facilite la sélection sans restreindre les joueurs disponibles. Un joueur ne peut pas occuper plusieurs places ni appartenir aux deux camps.
2. Régler l’ordre des titulaires et choisir une des trois répartitions possibles en deux doubles, dans chaque camp.
3. Cliquer sur **Simulation** pour comparer les choix de quatre titulaires et leurs doubles parmi les quatre à six joueurs sélectionnés dans son équipe. Les titulaires et doubles adverses restent fixes. Trois options au maximum sont proposées ; **Appliquer cette composition** conserve le choix sous contrôle du capitaine.
4. Cliquer sur **Prévision** pour analyser la composition actuellement retenue : score moyen du modèle, issues estimées, distribution des scores et détail des vingt parties regroupées en six séquences.

Les analyses sont lancées explicitement. Modifier un joueur, l’ordre, une paire ou une hypothèse retire les analyses précédentes et impose un nouveau calcul. Enregistrer conserve la composition et les hypothèses dans ce navigateur, pour la saison affichée ; les analyses et les résultats de l’ancienne page ne sont jamais restaurés. Les anciennes sélections `captain-nico-v1` sont reprises avec nettoyage des identités et conservation des doubles compatibles. Une préparation d’une autre saison n’est pas réutilisée comme préparation courante.

## Format et ordre des séquences

Le calendrier comprend seize simples et quatre doubles. Il reprend la chronologie enregistrée dans la fixture réelle J2 `interclub_j2_fournaise_ambree.json`, dont chaque partie est au premier à deux manches :

| Séquence | Parties | Format |
| --- | --- | --- |
| 1 | 1 à 4 | Simples |
| 2 | 5 à 8 | Simples |
| 3 | 9 et 10 | Doubles |
| 4 | 11 à 14 | Simples |
| 5 | 15 à 18 | Simples |
| 6 | 19 et 20 | Doubles |

Les seize simples couvrent toutes les confrontations entre quatre titulaires et quatre adversaires. Dans un modèle fondé uniquement sur les statistiques des joueurs, permuter leur ordre change la chronologie mais pas le nombre total de simples attendu. La simulation compare donc le choix des titulaires et les paires ; elle ne revendique pas un gain artificiel obtenu par permutation. Les égalités conservent l’ordre de sélection. Le premier lancer est affiché selon la feuille, sans bonus estimé faute de données sur son effet.

Les remplaçants sont des candidats supplémentaires pour comparer des compositions de départ. Aucun remplacement automatique en cours de rencontre ni règle de substitution n’est déduit de cette page.

## Modèle indicatif

Le calcul est une aide à la comparaison, sans calibration sur des prévisions antérieures.

- **Indice individuel** : `0,8 × moyenne 3 fléchettes + 0,2 × First 9`. Si First 9 est absent, utiliser la moyenne seule. Une observation exige une moyenne positive finie, au plus 180, et un volume de legs entier positif. Le volume ne donne pas de bonus de niveau.
- **Indice de double** : moyenne des deux indices individuels. Si le duo possède une moyenne observée et un volume de legs positif, calculer son indice de la même façon, puis le mélanger à l’indice individuel avec le poids `legs du duo / (legs du duo + 20)`. Sans historique commun, l’approximation individuelle est explicitement indiquée. Aucun taux de précision aux doubles n’est dérivé des finishes.
- **Probabilité de manche** : pour un écart d’indices `d`, `p = 1 / (1 + exp(-d / 8))`. L’échelle 8 est un paramètre heuristique, pas un coefficient ajusté sur les résultats passés.
- **Probabilité de partie** : le format au premier à deux manches et l’hypothèse de manches indépendantes donnent `p² × (3 - 2p)`.
- **Prévision collective** : les espérances sont les sommes des probabilités de partie. Une convolution déterministe de vingt variables de Bernoulli donne la distribution des scores, sous l’hypothèse supplémentaire de parties indépendantes. Les issues victoire, nul et défaite correspondent respectivement à plus de dix, exactement dix et moins de dix parties gagnées. Le score entier le plus probable reste un scénario possible.

Fatigue, pression, corrélation des performances et avantage du premier lancer ne sont pas quantifiés. Les probabilités affichées sont des estimations du modèle, pas des garanties de résultat.

## Joueurs sans statistiques et hypothèses

Une licence complète n’est pas nécessaire pour sélectionner un joueur. Un joueur sans moyenne exploitable, notamment un nouvel inscrit, reste disponible. Une donnée absente ne devient jamais une moyenne de zéro.

Le capitaine peut saisir une **moyenne de travail entre 1 et 180** uniquement pour compléter une observation absente. Cette hypothèse est identifiée dans les prévisions, demeure locale à la préparation et ne remplace pas une statistique observée. Elle n’est envoyée à aucune table officielle.

Sans hypothèse, les confrontations concernées restent non estimables et la prévision globale n’est pas calculée ; les autres confrontations sont détaillées. La simulation ne classe pas les compositions lorsqu’un candidat de son équipe ou un titulaire adverse manque de données, afin de ne pas prétendre avoir trouvé un optimum en écartant silencieusement ce joueur. Un remplaçant adverse non utilisé n’empêche pas l’analyse des titulaires adverses fixés.

## Validation et déploiement

Le moteur pur, la restauration des préparations et le chargement par saison sont vérifiés par `npm run test:captain`. Le parcours interactif est vérifié par `npm run test:captain:browser`. Les tests comparent notamment la chronologie à la fixture réelle J2, la symétrie des prévisions, la conservation de la masse de probabilité, l’invariance de l’espérance des simples par permutation, les données manquantes, les hypothèses explicites, les identités obsolètes et la migration des préparations.

Le déploiement concerne **le frontend uniquement**, après fusion et contrôles habituels. Reconstruire et recréer le service `frontend` avec la configuration de production existante. Aucune migration, modification de base de données, republication de résultats, activation de worker ou reconstruction backend n’est nécessaire pour cette refonte. Les protections d’accès administrateur existantes sont conservées.
