# Univers Jeux — lots 1 et 2

## Objectif

Organiser le module autour de Match & compétition, Jeux fun et Entraînement, rendre les cinq jeux existants utilisables au clavier et sur téléphone à plusieurs, et ajouter trois jeux fun.

## Parcours livré

- /play : trois univers, huit jeux disponibles et reprise des sessions X01.
- X01 : un seul champ de saisie PC/mobile, vide après chaque enregistrement ; Entrée valide la volée. Mode par fléchette avec S/D/T, 25, Bull 50 et Raté.
- Volée X01 : total réalisable avec 1 à 3 fléchettes ; sortie sur double confirmée et contrôlée ; saisie explicite d’un bust. Une volée normale utilise trois fléchettes, une sortie ou un bust peut en utiliser moins.
- Cricket, Morpion, Bob’s 27 et Horloge : indicateur de chaque fléchette, conservation de 3/3 et passage explicite au joueur suivant. Un raté, un secteur sans effet, un double ou un triple consomment chacun une fléchette.
- Cricket Magic : changement des cibles au passage validé au joueur suivant. Les marques restent conservées.
- Annuler restaure l’action précédente, y compris le passage au joueur suivant.
- Les tableaux multijoueurs restent accessibles sur mobile ; le tableau Cricket défile horizontalement à petite largeur.

## Saisie par fléchette

Un nombre de 1 à 20 désigne le secteur, associé au bouton Simple/Double/Triple. Le clavier accepte également S20, D10, T20, 25, 50 et 0. Un total supérieur à 20, comme 60, est accepté en Simple s’il identifie un seul impact. Un total ambigu comme 36 demande une notation explicite (D18 ou T12). Le multiplicateur revient à la valeur par défaut du jeu après chaque saisie.

## Conservation des données

Aucune migration. Les appels et droits des sessions X01 restent ceux de l’application existante. Les sept autres jeux sont des parties locales en mémoire. La configuration des nouveaux jeux signale de conserver l’onglet ouvert ; Quitter demande une confirmation dans l’écran. Cette version n’ajoute pas de sauvegarde distante ni d’autoscoring à ces jeux.

Le workflow de publication des résultats officiels et de validation par le Directeur sportif est indépendant.

## Vérification

- app/frontend : npm test (lint, TypeScript, contrôles existants et tests des moteurs via test:play), puis npm run build.
- tests/workflow : npm run test:browser. Les scénarios Univers Jeux utilisent les comptes fictifs et une fixture X01 limitée au navigateur. Aucune donnée réelle n’est écrite.
- Formats : solo, duel, trois/quatre joueurs et doublettes dans les moteurs ; quatre joueurs dans les scénarios navigateur.
- Largeurs X01/Cricket/Puissance 4/Conquête/Bull 500 : 320, 390, 430, 820 et 1440 px. Morpion, Bob’s 27 et Horloge : 390 px.
- Les captures sont dans l’artefact GitHub Actions ranking-workflow-preview.

## Lots suivants

Organisation de tournois ; historique de progression ; sauvegarde/reprise des autres jeux ; intégration éventuelle d’un autoscoring. Ces fonctions ne sont pas présentées comme disponibles dans le catalogue de cette version.

## Lot 2 — variantes proposées

Aucune règle détaillée n’avait été validée pour les trois nouveaux jeux. Ces variantes sont donc expliquées intégralement avant la partie et disponibles dans un rappel pendant le jeu.

- Puissance 4 : grille 7 × 6, secteurs 14 à 20, gravité, quatre pions alignés dans l’un des quatre axes. Tous impacts ou doubles uniquement. Un impact valide ajoute un seul pion, y compris un triple, et termine la volée. Trois essais maximum ; une colonne pleine consomme un essai. Le passage de main reste explicite. Les fléchettes restantes sont affichées « Non jouée ». Grille pleine sans gagnant = nul.
- Conquête (variante 974Darts) : 20 territoires ; simple/double/triple = 1/2/3 marques, cumulées séparément par camp et conservées d’une volée à l’autre. Trois marques prennent un territoire libre ou adverse et effacent toutes les marques sur celui-ci. Toucher son propre territoire ou le Bull consomme une fléchette sans effet. Victoire immédiate à 5, 7 (défaut) ou 10 territoires possédés simultanément.
- Bull 500 : le Bull 50 (défaut), ou 25/50 selon option, débloque le score pour les fléchettes restantes de cette volée, sans rapporter de points. Seuls le 20 (défaut), le 19 ou les deux marquent ensuite. Le déblocage se réinitialise à chaque volée. Victoire immédiate à 500 ou plus.
- Les trois jeux acceptent solo, duel, trois/quatre joueurs et 2 vs 2 ; même ordre A1, B1, A2, B2 et progression partagée en équipe.
- Les changements de joueur et les victoires peuvent être annulés. L’état et les 50 dernières actions sont mis à jour ensemble ; aucun lancer supplémentaire n’est accepté après la fin d’une volée ou d’une partie.
- Références de règles pour Bull 500 et le passage de main au Puissance 4 : [GoDartsPro Fun Games](https://www.godartspro.com/gameon/fun-games/) et [Bull 500](https://www.godartspro.com/gameon/bull-500/), consultées le 30 septembre 2026. Le code, les interfaces et les variantes de cette implémentation sont propres au projet ; Conquête n’est pas présentée comme une règle universelle.

Les tests couvrent les quatre directions de victoire, la gravité, le nul, les colonnes pleines, les reprises de territoire, les variantes du Bull, les fins anticipées, l’immutabilité, tous les formats et l’annulation depuis l’interface.
