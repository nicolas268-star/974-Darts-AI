# MVP par saison

Les pages `/records/mvp/2026`, `/records/mvp/2027`, `/records/mvp/2028` et l’ancienne adresse `/records/mvp-2026` utilisent le même composant serveur. Chaque page résout l’UUID de sa saison via le catalogue des compétitions puis demande `/api/v1/players?season_id=<UUID>`. Toutes les lignes doivent porter cet UUID ; une réponse d’une autre saison est rejetée. Les liens vers les joueurs conservent l’année.

La page d’accueil MVP lit les statuts du catalogue. Elle ne marque plus 2027 et 2028 comme des saisons futures dans le code. Une saison avec un portail programmé mais sans statistiques individuelles affiche un état d’attente ; une panne de source affiche un état indisponible et une action de réessai.

## Début de saison

La page 2027 était auparavant un écran fixe « Saison à venir ». Le 11 octobre 2026, la liste publique 2027 présentait déjà 28 joueurs avec 6 à 15 legs chacun : même en raccordant les données, le seuil de 20 legs aurait laissé le classement vide.

Le classement principal conserve le minimum de 20 legs, une moyenne disponible et les calculs existants : scoring 40 %, résultats Wilson 35 %, impact 15 %, meilleur finish 10 %, avec les mêmes critères de départage. Tant qu’aucun joueur ne dispose de 20 legs et des données exploitables, un classement provisoire affiche les profils avec au moins un leg et une moyenne. Leader, podium, titre et notice sont explicitement marqués provisoires. Dès qu’un profil se qualifie, la page affiche le classement principal ; les profils sous 20 legs restent comptés comme « à confirmer ».

Le repère des gros scores est calculé dans le groupe du classement affiché, comme auparavant pour les éligibles. Les valeurs manquantes et les cas invalides ne produisent pas de leader. Les finishes restent des totaux de volée Nakka ; aucune précision aux doubles ou route de checkout n’est déduite.

## Vérification

`npm run test:mvp` couvre les pondérations existantes, le classement provisoire, le seuil exact de 20 legs, les valeurs invalides, le départage, l’isolation des saisons et les états de chargement. Il fait partie de `npm test`.

Les groupes navigateur « MVP » de `scripts/test-player-card-browser.mjs` couvrent les pages 2026–2028, l’ancienne adresse 2026, le hub, les premières statistiques, le passage au seuil, les données absentes / d’une autre saison / indisponibles, les liens et l’affichage mobile avec une source de validation.

## Détail du calcul et trophée 2027

Chaque joueur du classement possède un volet natif `details` sous sa ligne, intégré à sa carte sur téléphone. Il affiche les données de la saison, les étapes du Scoring et de Wilson, l’Impact, les Finishs, les contributions pondérées et l’arrondi final. `StatsTable.rowDetails` associe ces volets aux mêmes lignes sur ordinateur et mobile ; les autres tableaux conservent leur comportement.

`buildMvpPlayers` retourne `calculation`, contenant les valeurs non arrondies effectivement utilisées pour le score. Les pondérations générales 40/35/15/10, plafonds et départages sont conservés. Le détail n’effectue pas un second calcul à partir des indices arrondis. Les taux de référence ont toujours un plancher de 1. Le compteur 120–139 est déjà inclus dans 100–139 et n’est pas ajouté séparément.

Le lien immédiatement sous la bannière 2027 ouvre `/records/mvp/2027/explications`, page publique autonome disponible même si les statistiques ne chargent pas. Elle expose la proposition de trophée et de dotation de 200 € financée par NDX Performance Lab, la validation du Comité, les données, les règles et le cas hors concours du financeur décrits dans le document de présentation au Comité du 16 octobre 2026. Un profil explicitement fictif illustre les calculs à partir de la même fonction que le classement, sans reprendre les KPI arrondis d’un joueur réel.

Les tests numériques vérifient les contributions exactes, le cas d’arrondi 48 contre 49, les plafonds, les valeurs absentes et la référence commune du groupe. Le groupe navigateur MVP vérifie l’ouverture et la fermeture au clavier, l’indépendance des joueurs, l’association des cartes mobiles, la position du lien sous la bannière et la navigation aller-retour vers le guide.

## Barème des gros scores du 16 octobre 2026

À la demande de Nicolas, le poids des gros scores inclut désormais les quatre tranches : **100–139 ×1 + 140–169 ×2 + 170–179 ×3 + 180 ×4**. `MVP_HIGH_SCORE_WEIGHTS` centralise les coefficients ; la même fonction calcule le poids de chaque joueur et la référence commune du classement. Les quatre compteurs doivent être des entiers non négatifs et renseignés, y compris 170–179. Un compteur manquant ou invalide écarte le profil du classement et de sa référence.

Les MVP 2026, 2027 et 2028 ainsi que l’ancienne adresse 2026 utilisent ce barème commun. Le calcul est effectué à chaque chargement à partir des statistiques de la saison : tous les profils, podiums et détails sont recalculés automatiquement, sans migration ni écriture des résultats sportifs. La référence peut augmenter et faire évoluer l’indice de joueurs ayant zéro volée de 170–179. Un joueur seul dont le taux atteint au moins 1 reste normalisé à 100 pour son indice gros scores.

La page explicative et son exemple fictif (qui contient une volée 170–179) décrivent cette version du barème. Les tests vérifient l’échelle 1/2/3/4 avec quatre joueurs identiques, l’effet d’une volée 170–179 sur la référence et le reste du groupe, le classement provisoire, les compteurs invalides et l’absence de double comptage des 120–139.
