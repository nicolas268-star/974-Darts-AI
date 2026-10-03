# Dart Chess V2 — Classic, Battle, Chaos, IA et synchronisation

Base : `597f336` (Battle V1). Cette évolution réutilise la route `/play/dart-chess`, le moteur chess.js 1.4.0, la saisie `DartEntry`, le stockage local et le protocole de synchronisation existant.

## Modes jouables

| Mode | Déplacements et captures | Victoire |
| --- | --- | --- |
| Classic | Déclarer un coup légal, puis toucher le numéro demandé en S/D/T, en trois darts maximum. | Mat classique, sans checkout supplémentaire. |
| Battle | Déplacements libres. Pion : secteur S/D/T ; cavalier : S ; fou/tour : D ; dame : T. | Mat puis King Checkout sur D20. |
| Chaos | Battle + énergie, Précision, Renfort et Bull joker. | Mat puis D20 ; aucun pouvoir ne remplace le checkout. |

Un défi raté annule le déplacement et fait perdre le tour. Le plateau reste intact ; la prise en passant expire et les droits de roque sont conservés. **Pendant un échec, tous les coups légaux de défense sont automatiques**, y compris en Classic : aucun joueur ne passe en laissant son roi exposé. Roques et promotions Classic sont appliqués seulement après réussite du défi. Toutes les règles de déplacement restent gérées par chess.js.

### Chaos

Chaque camp commence avec 2 énergies, plafond à 6. Pendant un défi de capture : double = +1, triple = +2, 25 = +1, Bull 50 = +3. Les gains concernent les impacts saisis, réussis ou ratés. Le Bull 50 valide toute capture, sauf le King Checkout qui reste D20.

Avant le premier dart d’un défi, chaque pouvoir peut être acheté une fois :

- **Précision**, coût 1 : S/D/T du numéro demandé sont acceptés. Indisponible si le secteur complet est déjà accepté.
- **Renfort**, coût 2 : quatre darts maximum au lieu de trois.

Les pouvoirs ne déplacent pas de pièce et ne créent aucun tour supplémentaire. Les boucliers, doubles mouvements et captures non légales ne font pas partie de cette définition de Chaos. L’équilibrage reste à éprouver sur cible réelle.

## IA de loisir

Choix du camp humain blanc/noir et de trois niveaux. Minimax déterministe avec élagage alpha-bêta, matériel et placement, profondeur et nombre de nœuds bornés. Le calcul s’exécute dans un Web Worker pour ne pas bloquer la saisie ou le défilement.

| Niveau | Profondeur maximale | Budget de nœuds | Probabilité secteur/simple | Double | Triple |
| --- | ---: | ---: | ---: | ---: | ---: |
| Découverte | 1 | 150 | 65 % | 18 % | 12 % |
| Intermédiaire | 2 | 1 000 | 82 % | 35 % | 25 % |
| Avancé | 3 | 3 500 | 94 % | 55 % | 42 % |

L’IA n’est pas présentée comme Stockfish ou comme un classement Elo. Sa recherche évalue les coups selon les échecs classiques ; elle ne résout pas l’arbre probabiliste complet de Battle/Chaos. Ses lancers simulés suivent les mêmes transitions et sont étiquetés « IA » dans l’historique. Le générateur pseudo-aléatoire fait partie de la sauvegarde : annuler et rejouer ne retire pas un nouveau résultat aléatoire.

Pause/reprise du tour IA ; l’annulation met l’IA en pause pour corriger la saisie. Le bouton Abandonner fait abandonner le camp humain, même pendant le tour ordinateur. Une ancienne réponse du Worker ne peut pas écraser un état ayant changé. Un écran en lecture seule ne lance pas l’IA.

## PC / téléphone

Réutilisation de `useSyncedGame` et de la transaction `play_cloud_command`. Même compte sur les deux appareils, un seul appareil écrivain. Rafraîchissement des écrans toutes les deux secondes lorsqu’ils sont visibles. Transfert explicite de la saisie, révisions optimistes, commandes idempotentes, confirmation des sauvegardes et propagation des suppressions.

Les trois modes et l’IA se synchronisent, ainsi que la position, le défi, les darts restants, les pouvoirs, l’énergie et les graines aléatoires. La pause de l’IA est propre à l’écran qui commande ; après rechargement ou transfert explicite de commande, l’IA reprend depuis l’état sauvegardé.

Le lien de connexion conserve `?sync=1`. La liste API accepte désormais huit types de jeu. La migration `20261003213938_dart_chess_cloud_modes.sql` ajoute seulement `dartchess` à la contrainte et à la liste des types autorisés dans la fonction privée. Les verrous, droits, contrôles `auth.uid()` et politiques RLS restent identiques. Aucune clé serveur n’est ajoutée au client.

Cette synchronisation est une sauvegarde privée de jeu de loisir, pas un service de compétition entre comptes distincts. Les états sont validés structurellement côté API ; le serveur ne rejoue pas tous les coups et darts. Les autres joueurs ne peuvent pas lire les sauvegardes d’un compte différent.

## Compatibilité

- Nouvelles parties : format de jeu version 2, options de mode/IA explicites, énergie et générateur IA sauvegardés.
- Anciennes parties V1 : toujours acceptées, interprétées comme Battle à deux humains ; défis partiels et historique d’annulation conservés.
- L’enveloppe de sauvegarde locale/cloud reste version 1 ; aucune suppression ni conversion massive des anciennes parties.
- Pour changer de mode ou d’adversaire, créer une nouvelle partie. Les nouvelles options ne modifient jamais silencieusement une partie en cours.

## Fichiers et validation

Créations : moteur IA `lib/play/dart-chess-ai.ts`, contrôleur et Worker dans `app/play/dart-chess`, migration SQL et scénario navigateur `tests/workflow/dart-chess-v2.browser.mjs`.

Modifications : moteur Battle, interface/route/style Dart Chess, carte du hub, validateurs locaux/cloud, limite de liste dans l’API de synchronisation, tests moteurs/SQL et runner navigateur. Aucun changement des autres moteurs de jeux.

Validation locale : `npm --prefix app/frontend test` (141 tests jeux, 26 vérifications vision, TypeScript et lint sans erreur), `npm test` dans `tests/workflow` (permissions, transactions, isolation et huit types de jeux), compilation de production et scénarios navigateur V1/V2. Les 43 avertissements lint préexistants restent présents. Le scénario V2 passe aussi sur la compilation de production derrière un proxy HTTPS local. Un contrôle distinct fait jouer l’IA Avancé avec la CSP réellement appliquée, sans `unsafe-eval`. Le scénario V2 vérifie également une IA synchronisée : un seul appareil produit les coups et les lancers, sans nouvelle révision pendant le tour humain.

Le serveur de développement autorise `unsafe-eval` pour les Workers générés par Webpack. La CSP de production reste inchangée et n’autorise pas `unsafe-eval`. L’endpoint `/api/health` lit désormais la version du package au lieu d’afficher l’ancienne constante `21.0.16`.

Le statut des contrôles GitHub et de livraison est consigné dans la PR associée. Les scénarios couvrent Classic, Chaos, IA réelle en Worker, compatibilité V1, restauration partielle, annulation, synchronisation entre deux contextes navigateur, transfert de saisie, liste des huit jeux, suppression, authentification et isolation des comptes.

Pas d’autoscoring vidéo ajouté dans cette évolution ; l’interface d’impact conserve les sources `manual` et `autoscoring`, et ajoute `computer` pour distinguer les simulations.
