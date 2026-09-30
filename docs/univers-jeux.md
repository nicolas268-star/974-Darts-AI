# Univers Jeux — lots 1 à 4

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

Lots 1 à 3 : aucune migration. Les droits des sessions X01 restent ceux de l’application existante. Les sept autres jeux sont automatiquement sauvegardés dans le navigateur, séparément pour chaque compte authentifié et chaque jeu. Ils se restaurent après rechargement et depuis le hub. Le lot 4 ajoute une synchronisation optionnelle entre appareils ; l’autoscoring reste hors périmètre.

Le workflow de publication des résultats officiels et de validation par le Directeur sportif est indépendant.

## Suppression d’une partie

- X01 : le créateur dispose de « Supprimer » dans « Mes sessions / Parties en cours », ainsi que de « Supprimer la partie » dans la session ouverte. Une confirmation nomme la session. Ses participants de session, manches, volées et fléchettes sont supprimés ensemble par les cascades existantes. Les autres sessions et les fiches joueurs sont conservées. Le droit DELETE existant reste réservé au créateur ; un marqueur ou un observateur invité ne peut pas supprimer la partie. Les écrans ouverts constatent sa disparition au prochain contrôle (toutes les deux secondes lorsqu’ils sont visibles).
- Sept autres jeux : « Supprimer la partie » est disponible dans le panneau de sauvegarde. La confirmation précise la portée : ce navigateur pour une partie locale, tous les appareils de la session pour une partie synchronisée. Elle retire la partie affichée et son éventuel résultat de l’historique ; les autres résultats et jeux restent conservés. Une copie locale indépendante reste disponible après suppression de sa version synchronisée.
- En synchronisation, la suppression se fait depuis l’appareil qui a la main. La ligne distante et sa révision sont conservées avec une partie courante vide : un ancien enregistrement retardé ne peut pas restaurer la partie supprimée. Les erreurs de stockage ou de réseau n’affichent pas de réussite tant que l’enregistrement n’est pas confirmé.
- Aucune nouvelle migration. Tests : propriété et cascades SQL, sept moteurs locaux, confirmation et annulation au clavier/mobile, conservation des autres sessions, suivi sur un deuxième écran, perte d’accusé de réception et rejet d’un enregistrement périmé.

## Vérification

- app/frontend : npm test (lint, TypeScript, contrôles existants et tests des moteurs via test:play), puis npm run build.
- tests/workflow : npm run test:browser. Les scénarios Univers Jeux utilisent les comptes fictifs et une fixture X01 limitée au navigateur. Aucune donnée réelle n’est écrite.
- Formats : solo, duel, trois/quatre joueurs et doublettes dans les moteurs ; quatre joueurs dans les scénarios navigateur.
- Largeurs X01/Cricket/Puissance 4/Conquête/Bull 500 : 320, 390, 430, 820 et 1440 px. Morpion, Bob’s 27 et Horloge : 390 px.
- Les captures sont dans l’artefact GitHub Actions ranking-workflow-preview.

## Lots suivants

Organisation de tournois ; historique de progression ; intégration éventuelle d’un autoscoring. Ces fonctions ne sont pas présentées comme disponibles dans le catalogue de cette version.

## Lot 2 — variantes proposées

Aucune règle détaillée n’avait été validée pour les trois nouveaux jeux. Ces variantes sont donc expliquées intégralement avant la partie et disponibles dans un rappel pendant le jeu.

- Puissance 4 : grille 7 × 6, secteurs 14 à 20, gravité, quatre pions alignés dans l’un des quatre axes. Tous impacts ou doubles uniquement. Un impact valide ajoute un seul pion, y compris un triple, et termine la volée. Trois essais maximum ; une colonne pleine consomme un essai. Le passage de main reste explicite. Les fléchettes restantes sont affichées « Non jouée ». Grille pleine sans gagnant = nul.
- Conquête (variante 974Darts) : 20 territoires ; simple/double/triple = 1/2/3 marques, cumulées séparément par camp et conservées d’une volée à l’autre. Trois marques prennent un territoire libre ou adverse et effacent toutes les marques sur celui-ci. Toucher son propre territoire ou le Bull consomme une fléchette sans effet. Victoire immédiate à 5, 7 (défaut) ou 10 territoires possédés simultanément.
- Bull 500 : le Bull 50 (défaut), ou 25/50 selon option, débloque le score pour les fléchettes restantes de cette volée, sans rapporter de points. Seuls le 20 (défaut), le 19 ou les deux marquent ensuite. Le déblocage se réinitialise à chaque volée. Victoire immédiate à 500 ou plus.
- Les trois jeux acceptent solo, duel, trois/quatre joueurs et 2 vs 2 ; même ordre A1, B1, A2, B2 et progression partagée en équipe.
- Les changements de joueur et les victoires peuvent être annulés. L’état et les 50 dernières actions sont mis à jour ensemble ; aucun lancer supplémentaire n’est accepté après la fin d’une volée ou d’une partie.
- Références de règles pour Bull 500 et le passage de main au Puissance 4 : [GoDartsPro Fun Games](https://www.godartspro.com/gameon/fun-games/) et [Bull 500](https://www.godartspro.com/gameon/bull-500/), consultées le 30 septembre 2026. Le code, les interfaces et les variantes de cette implémentation sont propres au projet ; Conquête n’est pas présentée comme une règle universelle.

Les tests couvrent les quatre directions de victoire, la gravité, le nul, les colonnes pleines, les reprises de territoire, les variantes du Bull, les fins anticipées, l’immutabilité, tous les formats et l’annulation depuis l’interface.

## Conquête — monde stratégique

Le mode proposé par défaut pour une nouvelle partie de Conquête affiche une carte schématique originale du monde découpée en vingt régions, associées aux secteurs 1 à 20. Les quatre camps disposent de couleurs vives et de symboles distincts. La carte peut être agrandie pour un écran éloigné ; sur mobile, une vue complète, un zoom avec défilement et vingt boutons tactiles donnent accès aux territoires. Sélectionner une région affiche son propriétaire, les marques par camp, les voisins et le gain possible sans enregistrer de lancer.

Les prises restent identiques : simple = une marque, double = deux, triple = trois ; trois marques prennent un territoire libre ou adverse et réinitialisent les marques de tous les camps. Les points valent **2 × territoires possédés + liaisons entre deux territoires du même camp**, chaque liaison comptant une seule fois. Les frontières terrestres et les sept routes maritimes dessinées définissent le voisinage. Une prise isolée apporte deux points, une prise avec un voisin allié trois points, avec deux voisins quatre points. Perdre un territoire retire ses points et ses liaisons ; reprendre plusieurs fois la même zone ne cumule aucun bonus permanent. Tous les territoires peuvent être attaqués, même sans voisin allié.

Victoire immédiate à 12, 18 (défaut) ou 24 points. Solo, deux à quatre camps, et doublettes avec possessions communes. Le graphe, les noms et le dessin sont dans `lib/play/conquest-map.ts` ; la règle sauvegardée `strategy.version = 1` conserve ce voisinage. Les scores sont recalculés à partir des possessions pour éviter toute divergence entre carte, annulation, sauvegarde et affichage synchronisé.

Les anciennes sauvegardes sans `strategy` restent classiques (5, 7 ou 10 territoires pour gagner), avec leur historique et leur condition de victoire. Le sélecteur de mode permet encore de lancer une partie classique. Rejouer conserve le mode et l’objectif de la partie précédente. Aucune migration de base : les données restent dans l’enregistrement versionné existant. Les tests couvrent le graphe connecté, les liaisons terrestres et maritimes, les reprises, la victoire dans les cinq formats, les règles anciennes/nouvelles, les vues 320/390/430/820/1440 px, le clavier, le zoom et l’actualisation de la carte agrandie sur PC depuis le téléphone.

## Lot 3 — sauvegarde et reprise locales

- Sept jeux : Cricket, Morpion, Horloge, Bob’s 27, Puissance 4, Conquête et Bull 500.
- Le serveur fournit l’identifiant du compte via l’authentification existante. Aucune nouvelle API Supabase, migration ou modification des droits.
- Une sauvegarde versionnée par compte, navigateur et jeu. État complet, participants, variantes, cibles aléatoires, volée partielle ou terminée et 50 dernières actions annulables.
- Les enregistrements sont validés avant lecture et écriture : version, structure de chaque moteur, indices des participants, tailles des tableaux et états précédents. Une donnée illisible est conservée jusqu’à une réinitialisation explicitement confirmée.
- Écriture après chaque action. Si le stockage est bloqué ou plein, la partie reste jouable en mémoire avec un avertissement et un bouton Réessayer. Le dernier enregistrement valide est conservé ; une fermeture d’onglet avec données non enregistrées déclenche la protection du navigateur.
- Web Locks sérialise les écritures entre onglets ; une révision différente bloque l’onglet obsolète jusqu’à relecture explicite. Sur les navigateurs sans Web Locks, la comparaison de révision reste active ; éviter les saisies simultanées dans plusieurs onglets.
- Mettre en pause retourne au hub. Nouvelle partie demande confirmation et garde les résultats déjà terminés.
- Le hub affiche les parties en cours, les derniers résultats encore consultables et un historique : dix résultats par jeu, vingt résultats récents affichés. Une victoire annulée retire son résultat de l’historique ; rejouer ne crée pas de doublon et conserve le format, les joueurs et les variantes.
- La séparation par compte est une séparation fonctionnelle dans le navigateur, pas un coffre chiffré : les données restent accessibles à la personne qui dispose de ce profil de navigateur. Aucun résultat local n’alimente le classement officiel.
- Les données ne suivent pas l’utilisateur sur un autre navigateur ou appareil et sont perdues si les données du site sont effacées. Les sessions X01 gardent leur mécanisme existant.

Validation : tests de sérialisation des sept moteurs, séparation des comptes/jeux, corruption/version incompatible, quota, révisions concurrentes et historique borné. Playwright couvre chaque reprise avec correction, le hub mobile, deux onglets, une victoire annulée, la revanche et les échecs de stockage.

## Lot 4 — PC et téléphone

### Utilisation
1. Connectez les deux appareils au même compte.
2. Dans Cricket, Morpion, Horloge, Bob’s 27, Puissance 4, Conquête ou Bull 500, cliquez « Synchroniser PC / téléphone ». La partie et son historique passent dans une sauvegarde privée distante.
3. Sur l’autre appareil, ouvrez la partie dans « Mes parties synchronisées » ou copiez son lien depuis le panneau. Le nouvel écran est toujours en lecture seule, même après rechargement.
4. « Saisir sur cet appareil » transfère la main. L’ancien appareil suit les scores. Une requête partie de l’ancien appareil est refusée si la version ou le détenteur a changé.
5. Chaque lancer, changement de joueur, correction et nouvelle partie est confirmé par le serveur. Le PC reçoit les mises à jour par interrogation toutes les deux secondes (réponse vide si la révision n’a pas changé), au retour au premier plan et après reconnexion.
6. Une coupure bloque la saisie synchronisée jusqu’à confirmation. Une commande dont l’accusé de réception est perdu peut être réessayée sans doubler le lancer. Elle est conservée dans le stockage de session pour un rechargement ; en cas de stockage bloqué, une protection de fermeture garde l’utilisateur informé.
7. Les sauvegardes locales précédentes restent intactes. Si une partie distante existe déjà, elle doit être ouverte explicitement ; aucune fusion ni écrasement automatique. Une copie distante récemment reçue est gardée sur l’appareil pour afficher le dernier score hors connexion, sans permettre des écritures hors ligne.

### X01
Le mécanisme de sessions X01 existant est conservé. Un hôte choisissant Observateur reste désormais en lecture seule dans ce navigateur, même si son rôle serveur est HOST. Le lien « écran de score » ouvre directement ce mode, suit les scores et affiche aussi la fin de match. Pour déplacer la saisie X01, l’utilisateur passe d’abord l’ancien appareil en écran de score puis reprend la session en Joueur sur l’autre. Le verrou exclusif et transactionnel du nouveau système concerne les sept autres jeux ; X01 conserve ses droits HOST/SCORER et son protocole existant.

### Stockage et mise en service
- Migration : supabase/migrations/20260930110920_play_cloud_sync.sql, créée avec `supabase migration new play_cloud_sync` par la CLI 2.118.0 dans le run 36706743610, puis complétée et testée dans la base PostgreSQL locale éphémère de CI.
- Table `play_cloud_sessions` : une ligne par compte et jeu, état complet, 50 actions annulables, dix résultats par jeu, révision et appareil de saisie. Suppression automatique à la suppression du compte. Aucun résultat ne rejoint le classement officiel.
- Lecture protégée par RLS sur `auth.uid()`. Aucune écriture directe autorisée aux rôles web. RPC publique invoker déléguant à une fonction privée avec identité issue du JWT, propriétaire implicite, verrou de ligne, comparaison de révision et commande idempotente. Aucun service_role dans le navigateur ou la route de synchronisation.
- Route Next authentifiée : origine identique obligatoire pour les mutations, JSON limité à 1 Mio, validation des sept états et de leur historique, réponses privées sans cache.
- Le module local continue à fonctionner si la migration n’est pas encore installée. Appliquer cette migration via le processus de publication existant avant de proposer la synchronisation aux utilisateurs. Aucune migration de production n’a été exécutée pendant ce développement.

### Vérification
Tests SQL des permissions, séparation entre comptes, création concurrente, transfert de saisie, révisions périmées, relecture idempotente, tailles et suppression d’un compte. Tests navigateur dans deux contextes distincts : sept jeux, trois fléchettes, passage de joueur, annulation, rechargement, hub depuis un nouvel appareil, affichages 320/390/1440 px, perte d’accusé de réception, reconnexion, refus des requêtes sans compte ou d’origine étrangère. X01 est vérifié avec sa fixture navigateur existante et un deuxième écran de même compte résolu HOST.


## Conquête — bonus défense, Full et Bull (règles v2)

Toutes les nouvelles parties utilisent les règles v2. Les vingt régions terrestres gardent leur géographie et leurs voisins mais reçoivent une permutation des numéros 1 à 20 à chaque nouvelle partie, y compris une revanche. La permutation est sauvegardée une seule fois dans la partie : une correction, un rechargement ou un changement d’appareil ne la modifie pas. Un vingt-et-unième territoire, le Bull, reste au carrefour des océans et possède quatre liaisons maritimes fixes : Amérique Est, Amazonie, Europe Ouest et Afrique Nord. Le 25 vaut une marque et le Bull 50 deux marques ; trois marques prennent le Bull comme tout autre territoire.

Dans les trois modes, toucher un territoire adverse sans le reprendre dans la même volée donne **un point de défense à son propriétaire par territoire**, indépendamment du nombre d’impacts. Ce point reste en attente jusqu’à la fin de la volée et disparaît si la prise est réussie. Plusieurs territoires défendus peuvent donner plusieurs points, éventuellement à plusieurs camps. Les marques incomplètes persistent entre les volées ; les bonus de défense gagnés restent acquis même après la perte du territoire. Toucher son propre territoire, un territoire libre ou rater ne donne aucun bonus de défense. Les doublettes partagent possessions, marques et bonus.

- **Classique v2** : un point par territoire + bonus défense, sans points de liaison. Objectif de 5, 7 ou 10 points.
- **Monde stratégique v2** : deux points par territoire + une fois chaque liaison alliée + bonus défense. Objectif de 12, 18 ou 24 points.
- **Full conquête** : mêmes points que Monde stratégique, sans seuil de victoire. La partie se termine immédiatement lorsque tous les vingt-et-un territoires ont un propriétaire, Bull compris. Le dernier territoire peut appartenir à n’importe quel camp. Les bonus en attente sont réglés, puis le meilleur total gagne.

En Classique et Monde stratégique v2, la victoire est vérifiée après les trois fléchettes et l’attribution des bonus. Le meilleur score gagne s’il atteint le seuil ; une égalité au meilleur score est un nul. Full applique la même comparaison de scores à la fermeture de la carte, même si la volée est écourtée. Annuler restaure ensemble la carte, les points, les bonus en attente et le résultat de la partie.

Les sauvegardes historiques sans `campaign` restent en version 1 (vingt numéros fixes, pas de Bull ni de bonus défense, victoire immédiate selon leurs anciennes règles). Aucune conversion silencieuse des parties en cours ni migration SQL. Une nouvelle partie ou une revanche active les règles v2 en conservant le mode et l’objectif choisis. Les enregistrements v2 valident notamment la permutation, le Bull fixe, les bonus, les attaques en attente et les conditions de victoire ; leurs états et historiques utilisent la synchronisation existante.

Tests : bonus dans chaque mode, reprise dans la volée, plusieurs propriétaires, aucun bonus sur ses propres territoires, Bull/25, adjacences géographiques malgré les numéros aléatoires, fin différée au troisième lancer, défenseur gagnant, égalité, Full encore ouvert malgré un score élevé, derniers bonus avant victoire, annulation et reprise avec bonus en attente, état corrompu et anciens formats. Le navigateur joue une partie Full complète, vérifie le nouveau tirage à la revanche et les cinq largeurs ; le test PC/téléphone contrôle le même tirage, les bonus en attente, leur attribution, leur annulation et la reprise adverse.
