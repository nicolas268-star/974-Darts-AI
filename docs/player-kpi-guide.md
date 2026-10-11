# Guide des KPI joueur

La page `/players/kpi` explique les statistiques affichées sur la fiche joueur : KPI essentiels, tendances, scoring, indices du profil, ADN, réseau et Coach. Elle est accessible depuis une fiche et la liste des joueurs, avec conservation de la période sélectionnée.

## Exemples publics

Deux identités canoniques publiées sont utilisées : Nicolas DUPONT (Nico Fournaise), `1ebcd851-c20e-46b1-adb0-8642873a4adb`, et Alexandre SANZ VILLAR (Alex Neige), `cdee1b70-516a-4b23-85fc-4421d1da4da3`.

Le serveur lit leurs dashboards existants en parallèle, avec un délai maximal de cinq secondes par appel. Le guide accepte 2026, 2027, 2028, 2029 et toute la carrière ; par défaut, les cas portent explicitement sur 2026. Il vérifie l’identité, le caractère public et la période renvoyée avant d’afficher une valeur. Une absence de données, un profil privé ou une panne laisse les définitions disponibles sans valeur de démonstration ni repli vers une autre saison. Les noms de cas sont publics ; aucune valeur d’un dashboard privé n’est rendue.

## Méthodes

Les définitions suivent `player_statistics_engine.py`, le calcul du profil dans `app/players/[player_id]/page.tsx` et les composants de cette fiche. Les formules du profil et de l’ADN sont documentées séparément, avec leurs replis lorsque des données manquent. Le guide explique notamment le seuil inclusif de 50 % pour la forme récente, les fenêtres de progression qui peuvent se chevaucher, la moyenne non pondérée des joueurs utilisée comme référence championnat, les catégories de scoring et les limites des finishes Nakka.

La page ne modifie aucun calcul, import, schéma, droit d’accès ou statistique. En cas de changement des méthodes, mettre à jour `lib/player/kpi-guide.ts` avec le moteur correspondant.

## Vérification

`npm run test:kpi-guide` vérifie les périodes, l’identité et la confidentialité des exemples, y compris les données absentes. Ce test fait partie de `npm test`.

Les trois groupes « KPI guide » de `scripts/test-player-card-browser.mjs` vérifient le rendu, les calculs d’exemple sur une source synthétique, les liens, les ancres mobiles et les états source vide / privée / mauvaise saison / indisponible. Ils peuvent être exécutés avec `PLAYER_CARD_QA_GROUP="KPI guide"` dans le runtime de validation Playwright.
