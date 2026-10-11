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
