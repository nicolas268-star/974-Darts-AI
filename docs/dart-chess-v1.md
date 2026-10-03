# Dart Chess Battle V1

> Rapport historique de la V1. L’évolution des modes et de la synchronisation est documentée dans [dart-chess-v2.md](dart-chess-v2.md).

## Résultat

Nouveau jeu `/play/dart-chess`, accessible depuis Univers Jeux, pour deux humains sur le même écran et une cible traditionnelle. Partie locale liée au compte, avec saisie manuelle, sauvegarde automatique, reprise, annulation confirmée, abandon et suppression via les composants existants. Aucune mise en production ni migration de données.

## Audit et choix d’intégration

Audit initial sur `d57d0fe`, puis branche remise à jour sur `075c244` (laboratoire de vision inclus), sans conflit.

- Frontend Next.js 16.3.8 / React 19 / TypeScript : pages App Router, composants client et moteurs purs dans `lib/play`.
- Backend FastAPI : APIs métier/statistiques et moteur X01. Les jeux fun déjà en place utilisent des moteurs TypeScript côté client ; Dart Chess suit cette organisation, sans ajouter un second service.
- Authentification Supabase : route protégée par `requireUser` comme les autres jeux. Aucun changement des rôles, politiques RLS ou secrets.
- `DartEntry` : saisie existante S/D/T, 25, Bull et raté, clavier ou tactile. Réutilisée sans changer les comportements des autres jeux.
- `useLocalGame`, `LocalSessionBar`, `SavedGames`, `DeleteSavedGameButton` : stockage, historique de snapshots, conflits entre onglets, reprise et suppression réutilisés.
- Synchronisation existante : `useSyncedGame`, API Next `/api/play/sync`, commandes Supabase avec révisions et appareil écrivain. Le périmètre V1 demande le même écran : Dart Chess reste local et son nouveau type est explicitement refusé par l’API cloud, dont les types SQL n’ont pas été modifiés.
- Risques prioritaires : perdre un tour pendant un échec, reprendre un échiquier maté, conserver en passant/roque lors d’un tour perdu, restaurer un défi partiellement saisi, régressions des validateurs partagés.

## Architecture

`chess-adapter.ts` encapsule la bibliothèque MIT `chess.js`, verrouillée à 1.4.0 : coups légaux, FEN, échec, mat, pat, roques, promotions et prise en passant. Documentation : https://jhlywa.github.io/chess.js/v1.4.0/.

`dart-chess-engine.ts` gère les défis indépendamment de React. Transitions immuables et états discriminés : `SELECT_MOVE`, `CAPTURE_CHALLENGE`, `KING_CHECKOUT`, `GAME_OVER`. La sélection visuelle et le choix de promotion restent dans l’interface ; le FEN, le coup demandé, l’objectif et les darts sont stockés dans le moteur. L’échiquier ne change qu’après réussite d’une capture, sauf captures défensives automatiques.

La frontière `DartEvent` accepte une provenance `manual` ou `autoscoring` et valide un impact normalisé avant son application. Aucun accès caméra ni reconnaissance vidéo. `BATTLE_RULES` centralise les difficultés ; la version de sauvegarde permet de faire évoluer les règles sans interpréter silencieusement les anciennes parties.

## Règles définitives

| Action / pièce visée | Résolution |
| --- | --- |
| Déplacement sans capture | Coup légal automatique |
| Pion | Numéro demandé ; simple, double ou triple de ce numéro accepté |
| Cavalier | Simple exact du numéro demandé |
| Fou | Double exact |
| Tour | Double exact |
| Dame | Triple exact |
| Capture pour sortir d’un échec | Automatique, si le moteur valide le coup |
| Roi | Jamais capturé ; règles d’échec et de mat classiques |

Chaque défi de capture dispose de trois fléchettes maximum. Réussite immédiate au premier impact valide. Trois ratés : aucun déplacement ni retrait, tour perdu. Le passage est un coup nul explicite fourni par chess.js ; il expire la prise en passant, incrémente les compteurs et conserve les droits de roque. Il est interdit pendant un échec.

Les numéros sont produits par un générateur déterministe initialisé aléatoirement au début de partie, de 1 à 20, sans répétition immédiate. Annuler et refaire le même coup retrouve le même objectif. Il ne s’agit pas d’un mécanisme antifraude pour compétition distante.

**Pourquoi l’exception en échec ?** Passer après une capture défensive ratée laisserait le roi exposé pendant le tour adverse. La défense automatique conserve les règles fondamentales et évite une pénalité incompréhensible pour le MVP.

**King Checkout** : après un mat légal, l’échiquier est figé et le joueur qui a maté reste au lancer. Il doit toucher D20 en trois darts. Après trois ratés, il retire ses fléchettes puis relance une volée grâce au bouton dédié. Le mat n’est pas annulé et le joueur maté ne reçoit jamais un tour sans coup légal. Un simple 20, triple 20 ou Bull ne termine pas. Le résultat de victoire est enregistré à la réussite ; l’abandon reste possible.

**Équilibrage retenu** : le pion est accessible et le cavalier exige un simple précis ; fou et tour partagent le double pour éviter de rendre trop de captures aussi difficiles que celle de la dame. Ces réglages restent à tester sur cible réelle avec débutants et joueurs confirmés. Le King Checkout sert de finition ludique et ne renverse pas le vainqueur du mat.

Pat, matériel insuffisant, troisième répétition et règle des 50 coups terminent en match nul. La répétition tient compte du trait, du roque et de la prise en passant. Les positions récentes sont conservées séparément du FEN, car recharger un FEN seul perd l’historique du moteur.

## Interface

Échiquier 8 × 8, contraste blanc/noir, coordonnées, cases légales, dernière action, état d’échec, captures, orientation automatique désactivable. Promotion explicite parmi dame, tour, fou et cavalier. Sur desktop, panneau de défi à côté ; sur mobile, échiquier puis objectif et saisie. Boutons de saisie d’au moins 44 px, animations discrètes et respect de `prefers-reduced-motion`.

La confirmation d’annulation restaure le snapshot précédent, y compris l’objectif, le générateur, les captures et les darts. Historique récent de 30 événements et 50 snapshots d’annulation, conformément au mécanisme existant. Une nouvelle partie conserve les noms, y compris après rechargement.

## Fichiers créés

- `app/frontend/lib/play/chess-adapter.ts`
- `app/frontend/lib/play/dart-chess-engine.ts`
- `app/frontend/app/play/dart-chess/page.tsx`
- `app/frontend/app/play/dart-chess/DartChessGame.tsx`
- `app/frontend/app/play/dart-chess/dart-chess.css`
- `tests/workflow/dart-chess.browser.mjs`
- Ce rapport et les captures `docs/dart-chess-preview/390.webp`, `1440.webp`.

## Fichiers modifiés

- `app/frontend/app/play/page.tsx` : nouvelle carte dans Jeux fun.
- `app/frontend/lib/play/local-sessions.ts` : type, validation et description du nouveau jeu.
- `app/frontend/lib/play/cloud-sessions.ts` : exclusion explicite de Dart Chess du cloud pour la V1 locale.
- `app/frontend/package.json`, `package-lock.json` : chess.js 1.4.0.
- `app/frontend/scripts/test-play.mjs` : tests Battle et résolution des imports npm dans le chargeur TypeScript de tests.
- `app/frontend/scripts/control-check.mjs` : contrôle de présence de la route.
- `tests/workflow/browser.test.mjs` : ajout du scénario navigateur Dart Chess à la suite existante.
- `tests/workflow/play-universe.browser.mjs` : neuf cartes attendues au lieu de huit.

## Vérification

- `npm test` : lint, TypeScript, contrôles de routes/sécurité et cohérence de version réussis ; **128 tests de moteurs réussis**, incluant les jeux existants.
- Cas Battle : mouvement légal/illégal, immutabilité, réussite Dart 1/2/3, trois ratés, trait, défense en échec, pièce clouée, roques, roque interdit à travers une attaque, prise en passant réussie/ratée, quatre promotions, promotion avec capture, mat, D20, nouvelle volée, pat, répétition, règle des 50 coups, provenance d’impact, états corrompus, sérialisation, isolation par compte, annulation et suppression.
- Chromium : création, sélection des coups, rotation, capture, restauration d’un défi après un dart, réussite, annulation, trois ratés, nouvelle partie, mat, trois ratés de checkout, nouvelle volée, victoire, reprise via le hub, suppression puis rechargement. Aucun `pageerror`.
- Formats contrôlés sans débordement horizontal : **320 × 740**, **390 × 844**, **844 × 390**, **820 × 1180**, **1440 × 1000**. Échiquier carré et contenu dans l’écran ; saisie accessible au défilement ; boutons tactiles >= 44 px. Captures inspectées en mobile et desktop.
- Le scénario navigateur a été exécuté avec le mode démo de développement existant et des données jetables, sans base de production. Il est intégré au runner complet authentifié du dépôt, mais l’intégralité de ce runner métier n’a pas été relancée.
- `npm run build` : succès, route dynamique `/play/dart-chess` présente. Premier essai restreint bloqué sur le sous-processus TypeScript ; succès avec les permissions d’exécution nécessaires. Avertissement existant `/duos` sur le rendu dynamique, non bloquant.

## Limites et dette technique

### Vérification complémentaire du 3 octobre 2026

- Après remise à jour sur `075c244`, `npm test` réussit : **128 tests des jeux et 26 contrôles du laboratoire de vision**, TypeScript, contrôles de routes et de version. ESLint ne signale aucune erreur ; 43 avertissements subsistent dans le projet.
- Build de production réussi dans un checkout isolé, avec `/play/dart-chess` et `/admin/vision`. Un premier essai dans le répertoire partagé a échoué en présence d’un serveur de développement ; le checkout isolé a aussi nécessité des dépendances locales plutôt qu’un lien symbolique externe, refusé par Turbopack. Aucune modification du code applicatif n’a été nécessaire.
- Scénario navigateur Dart Chess relancé avec succès sur la base actualisée : captures, trois ratés, restauration partielle, annulation, mat, King Checkout, reprise depuis le hub et suppression. Les cinq formats ci-dessus ont été revérifiés ; aperçu mobile inspecté visuellement.
- Aucune fusion vers `main`, mise en production ou modification de base de données.

### Limites fonctionnelles

- Pas de synchronisation inter-appareils pour Dart Chess, IA, joueurs distants, équipes, spectateurs, modes Classic/Chaos ou autoscoring réel dans cette V1.
- Sauvegarde locale : reste liée au navigateur, ne survit pas à l’effacement de ses données. Le composant existant affiche les erreurs de stockage et conflits.
- Pas de validation des transitions côté serveur : approprié au jeu local, insuffisant pour une compétition distante. Avant activation cloud, ajouter le type autorisé en base et concevoir une autorité serveur et une déduplication des impacts.
- Historique récent borné ; pas d’export PGN orthodoxe, car les tours perdus sont une règle de variante.
- La validation de sauvegarde contrôle la structure et la cohérence de la position et du défi, sans rejouer l’historique complet : ce n’est pas une protection antifraude contre un utilisateur modifiant son stockage.
- Vérification Chromium par tailles d’écran ; pas de session physique Safari/iOS ou Android avec clavier réel. L’équilibrage et l’ergonomie sur cible restent à valider en jouant.
- L’ajout du validateur introduit la dépendance chess.js dans le graphe partagé des sauvegardes locales. À surveiller si de nombreux moteurs supplémentaires sont ajoutés ; aucune refonte globale anticipée.

## Prochaine étape recommandée

Revue de la branche puis test réel de quelques parties à deux, particulièrement les captures de dame et l’exception de défense en échec. Ajuster les règles sur ces retours avant une mise en production explicitement demandée. Ne pas déployer ni fusionner automatiquement.
