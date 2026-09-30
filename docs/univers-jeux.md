# Univers Jeux — première version

## Objectif

Organiser le module autour de Match & compétition, Jeux fun et Entraînement, puis rendre les cinq jeux existants utilisables au clavier et sur téléphone à plusieurs.

## Parcours livré

- /play : trois univers, cinq jeux disponibles et reprise des sessions X01.
- X01 : un seul champ de saisie PC/mobile, vide après chaque enregistrement ; Entrée valide la volée. Mode par fléchette avec S/D/T, 25, Bull 50 et Raté.
- Volée X01 : total réalisable avec 1 à 3 fléchettes ; sortie sur double confirmée et contrôlée ; saisie explicite d’un bust. Une volée normale utilise trois fléchettes, une sortie ou un bust peut en utiliser moins.
- Cricket, Morpion, Bob’s 27 et Horloge : indicateur de chaque fléchette, conservation de 3/3 et passage explicite au joueur suivant. Un raté, un secteur sans effet, un double ou un triple consomment chacun une fléchette.
- Cricket Magic : changement des cibles au passage validé au joueur suivant. Les marques restent conservées.
- Annuler restaure l’action précédente, y compris le passage au joueur suivant.
- Les tableaux multijoueurs restent accessibles sur mobile ; le tableau Cricket défile horizontalement à petite largeur.

## Saisie par fléchette

Un nombre de 1 à 20 désigne le secteur, associé au bouton Simple/Double/Triple. Le clavier accepte également S20, D10, T20, 25, 50 et 0. Un total supérieur à 20, comme 60, est accepté en Simple s’il identifie un seul impact. Un total ambigu comme 36 demande une notation explicite (D18 ou T12). Le multiplicateur revient à la valeur par défaut du jeu après chaque saisie.

## Conservation des données

Aucune migration. Les appels et droits des sessions X01 restent ceux de l’application existante. Les quatre autres jeux restent des parties locales en mémoire, comme avant cette modification. Cette version n’ajoute pas de sauvegarde distante ni d’autoscoring à ces jeux.

Le workflow de publication des résultats officiels et de validation par le Directeur sportif est indépendant.

## Vérification

- app/frontend : npm test (lint, TypeScript, contrôles existants et tests des moteurs via test:play), puis npm run build.
- tests/workflow : npm run test:browser. Les scénarios Univers Jeux utilisent les comptes fictifs et une fixture X01 limitée au navigateur. Aucune donnée réelle n’est écrite.
- Formats : solo, duel, trois/quatre joueurs et doublettes dans les moteurs ; quatre joueurs dans les scénarios navigateur.
- Largeurs X01/Cricket : 320, 390, 430, 820 et 1440 px. Morpion, Bob’s 27 et Horloge : 390 px.
- Les captures sont dans l’artefact GitHub Actions ranking-workflow-preview.

## Lots suivants

Puissance 4, Conquête et Bull 500 ; organisation de tournois ; historique de progression ; sauvegarde/reprise des autres jeux ; intégration éventuelle d’un autoscoring. Ces fonctions ne sont pas présentées comme disponibles dans le catalogue de cette version.
