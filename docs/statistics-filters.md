# Filtres des statistiques publiques

Les pages `/records/180` et `/records/finishes` proposent 2026, 2027 et 2028 via `?season=YYYY`. Par défaut, elles utilisent le championnat actif du catalogue. La page joueurs conserve ses années existantes et adopte ce même choix par défaut.

Le championnat est lu avec l’UUID de la saison choisie. Une saison sans UUID reste vide ; une réponse portant un autre UUID est rejetée. La lecture sans filtre sert uniquement à résoudre les identités des participants aux tournois et ne fournit pas de statistiques au championnat sélectionné.

Les tournois sont rattachés à leur saison annoncée (année de fin, comme le championnat). À défaut, leur date publiée détermine l’année. Une source sans saison ni date reste hors des classements annuels. La manche 1 du BDC du 11 septembre 2026 appartient à sa saison publiée 2026–2027, donc 2027. Les noms courts sont résolus uniquement par les alias exacts de l’effectif officiel ; les correspondances ambiguës restent exclues.

Le Club 180 conserve le filtre Toutes compétitions / Championnat / Tournois lorsque l’année change. Ses totaux, podium et détails suivent le périmètre et l’année. Les liens de profils et les libellés de records conservent également l’année.

Dans `/players`, `?team=<nom officiel>` filtre les membres de l’équipe du championnat actuel. Pour 2027, la liste complète vient du même effectif officiel que `/teams`, avec huit équipes, même lorsque des rencontres ne sont pas encore publiées. Les affectations actuelles publiées permettent de distinguer les changements d’équipe et les anciens groupes TDC/3BDC. Sur une année historique, les statistiques et l’équipe affichée dans la ligne restent historiques ; la notice précise que le filtre porte sur l’effectif actuel. Le changement de saison conserve l’équipe, et Toutes les équipes conserve la saison. Une équipe sans statistiques a un état vide explicite.

## Vérification

- `npm test` inclut dix groupes pour les paramètres, le rattachement annuel des tournois, les UUID, les réponses d’une autre saison, les alias et les équipes actuelles.
- `PLAYER_CARD_ENABLED=true npm run build` vérifie la compilation de production.
- `scripts/test-statistics-filters-browser.mjs` vérifie les totaux et les records 2026/2027, la conservation des filtres et des liens, les changements d’équipe, les saisons futures et les rendus à 320/390/430 pixels.
- Le test responsive du workflow complet continue à exercer les pages records et joueurs avec l’API FastAPI et les sources isolées du projet.

Aucun import, schéma ou calcul statistique du backend n’est modifié.
