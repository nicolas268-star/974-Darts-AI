# Inscription d’un joueur dans un club

Accès : **Administration → Inscrire un joueur** (`/admin/players`).

1. Choisir « Nouveau joueur » ou sélectionner la fiche d’un joueur déjà présent sur le site.
2. Renseigner l’identité, le pseudo Nakka éventuel, la saison, le club, l’équipe et la date réelle d’arrivée.
3. Renseigner la licence complète à huit chiffres si elle est connue, puis valider.
4. Consulter la fiche joueur et l’équipe depuis la confirmation. Le bouton « Compléter » permet de reprendre une inscription, notamment pour ajouter la licence plus tard.

Un joueur sans numéro de licence apparaît dans les effectifs, l’espace joueur, les filtres de saison, Captain Nico et le Studio Match Day. Une nouvelle entrée sans licence reste `INACTIVE` dans le registre des licenciés : l’inscription au club ne doit pas inventer l’éligibilité aux points comité. Les conditions de publication et d’attribution de points restent applicables.

L’inscription utilise une seule transaction : joueur canonique, identité, alias confirmés, appartenance de saison, registre comité et journal d’administration. Les nouvelles statistiques restent absentes jusqu’à l’import de rencontres réelles. Les statistiques et équipes des anciennes saisons sont conservées.

Un numéro déjà utilisé, une identité existante saisie comme nouveau joueur, un pseudo appartenant à un autre joueur, ou une autre équipe pour la même saison provoquent un message explicite. Pour une mutation dans la même saison, utiliser « Transferts ». Une nouvelle tentative après une erreur réseau réutilise la clé de validation et ne crée pas de deuxième joueur.

Les pages lisent les inscriptions validées depuis une source commune et les caches Next sont invalidés après validation. L’équipe reste accessible avant le premier résultat publié. Les fichiers d’effectifs 2027 servent de base aux joueurs déjà inscrits ; aucune modification manuelle de ces fichiers n’est nécessaire pour une nouvelle inscription.

## Installation

Appliquer la migration additive `supabase/migrations/20261021133209_admin_player_registration.sql` sur le projet Supabase cible avant d’activer le nouveau formulaire. Elle crée la table privée `player_registrations`, la fonction transactionnelle `register_club_player(jsonb,uuid)` et complète le code club des deux lignes canoniques Kaz A Darts. Aucun joueur réel n’est créé par la migration.

Après le passage au commit fusionné, exécuter depuis `/opt/974darts/current` : `sudo bash deploy/deploy-player-registration.sh RELEASE_SHA PREVIOUS_SHA`. Le script sauvegarde l’environnement, le proxy et les images, conserve les options effectives, vérifie les lectures de production avant activation, puis remplace backend/frontend et le worker interclubs s’il était actif. Il conserve les autres services et ne démarre aucun worker précédemment arrêté. En cas d’échec après activation, il restaure les images précédentes.

`ADMIN_USER_ID` doit correspondre entre frontend et backend ; le script reprend l’administrateur déjà configuré du frontend. Il vérifie l’API privée, l’effectif public, la santé HTTPS et la redirection anonyme de `/admin/players` sans créer de joueur de test en production.

L’interface d’administration indique une indisponibilité tant que la migration manque. Les lectures publiques conservent l’effectif 2027 d’origine pendant une installation progressive. Ne pas supprimer la table lors d’un retour à une ancienne version applicative : elle contient les inscriptions et leur historique.

## Vérification

- `cd tests/workflow && npm run test:registration` : permissions SQL, annulation atomique, contrôles de saisie, doublons, tentatives répétées, licence différée, réutilisation d’identité et lectures publiques réelles.
- `cd app/backend && python -m unittest discover -s tests -p 'test_*.py'` et tests pytest existants.
- `cd app/frontend && npm test && npm run build`.
- `cd app/frontend && node scripts/test-player-registration-browser.mjs` avec Playwright installé : formulaire réel, proxy administrateur, correction, affichages à 390/768/1440 pixels, fiche joueur et équipe avant le premier résultat.

Le test navigateur utilise uniquement des données jetables sur l’interface de bouclage locale. Il ne contacte pas le Supabase de production.
