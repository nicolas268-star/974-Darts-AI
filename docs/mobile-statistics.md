# Statistiques sur téléphone

Les pages publiques du domaine Stats portent la classe `stats-responsive`. Les ajustements de largeur, marges, taille minimale des textes et commandes tactiles sont regroupés dans `app/frontend/app/stats-mobile.css`. Ils s'appliquent jusqu'à 700 px, sans désactiver le zoom du navigateur. Le minimum typographique `--stats-text-floor` reste limité à ce domaine et à cette largeur.

`StatsTable` conserve le tableau sémantique sur ordinateur et présente ses mêmes cellules dans des fiches sur téléphone. La présentation inactive utilise `display: none` : elle n'est ni annoncée par les lecteurs d'écran ni accessible au clavier. Les points et moyennes sont prioritaires, les autres indicateurs sont accessibles par un élément natif `details`. Les colonnes peuvent être précisées avec `mobileTitleColumn` et `mobileSummaryColumns`, sans modifier les données. Les matrices de poule utilisent les noms complets des adversaires, issus des titres des colonnes.

Les commandes de tri des duos partagent l'état du tableau de bureau. Les filtres de saison, recherche et historique restent actifs. Aucun moteur statistique, résultat, identité ou paramètre de publication n'est modifié.

La CI `Qualité obligatoire` exécute `tests/workflow/mobile-statistics.browser.mjs` dans le serveur de démonstration existant. `stats_preview.py` fournit uniquement dans cet environnement des données fictives, produites avec les moteurs statistiques réels. Les tests contrôlent les débordements à 320, 390 et 430 px, la conservation des cellules, les champs à 16 px, le tri, les filtres, les détails tactiles et le retour au tableau à 1440 px. Les captures sont dans l'artefact `ranking-workflow-preview` sous les noms `mobile-stats-*` et `desktop-stats-*`.
