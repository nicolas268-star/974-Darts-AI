# Proposition technique — interface Comités France

Valider le modèle et les décisions du premier inventaire avant d'ouvrir `/comites/france`. La présente phase ne modifie aucun écran, navigation, classement ou espace Comité La Réunion.

## Contrat public

La page d'annuaire lit `france_committees` sous RLS, avec tri sur le nom normalisé et filtres sur région administrative confirmée. Une région inconnue s'affiche « non renseignée » et reste distincte d'une ligue sportive. Les compteurs portent exclusivement sur les compétitions vérifiées dont la source est encore publique, pour la saison demandée. Les comités documentés sans compétition confirmée peuvent apparaître avec un compteur nul et un libellé clair.

La fiche `/comites/france/[id]` utilise un identifiant stable de l'organisme et une pagination chronologique des métadonnées `france_competitions`. Les champs disponibles sont nom, date UTC de source, saison, type, statut N01, effectif d'entrées enregistrées, formats confirmés et URL officielle retournée par l'API. Le contrat distingue explicitement absence de donnée, liste vide et erreur de source. Aucune reconstruction d'URL Nakka à partir du seul `tdid`.

Les tableaux et poules nécessiteront une projection publique dédiée depuis `france_sources`, après contrôle des données publiques et de la visibilité. Réutiliser les composants de présentation de `tournament_page_service` lorsque leurs contrats s'appliquent, sans appeler la publication de points ou l'identification des joueurs. Les brackets Winner/Loser restent disponibles dans les snapshots privés ; une projection ultérieure n'exigera pas de changer le registre d'organisateurs.

## Administration

Ajouter des routes FastAPI au périmètre privé existant avec les dépendances de vérification du token interne et du rôle administrateur réellement contrôlé. Prévoir listes paginées des organismes et ligues incertains, compétitions sans comité, associations proposées, preuves, historique et runs partiels.

L'écran de validation doit montrer le document N01, l'identifiant de compétition, la source externe et la justification avant confirmation. Une suggestion de nom, de ligue ou de score ne présélectionne jamais `VERIFIED`. Une décision saisit l'acteur serveur ; ne pas accepter une identité d'administrateur fournie librement par le navigateur. Le lancement d'un run va dans une file privée avec suivi de progression ; aucune collecte longue dans une requête web publique.

Avant mise en ligne : tester avec les rôles `anon`, utilisateur normal et administrateur ; vérifier zéro fuite des tables privées, les filtres de saison, les compteurs, les corrections manuelles et la disparition d'un tournoi devenu privé. La sélection d'une saison n'a aucune incidence sur MVP 2027, les points officiels ou Interclubs.

## Évolutions proposées

1. Confirmation humaine des liens entre les organismes documentés et leurs ligues N01 ; conserver la distinction entre organisme vérifié et rattachement vérifié.
2. Normalisation progressive des régions/départements avec sources territoriales explicites, puis indexation des filtres.
3. Annuaire et fiches publiques fondés sur RLS, avec cache invalidé après décision/import.
4. Projection des poules et brackets publics et file de synchronisation supervisée, après validation de la phase 1.

Le stockage JSONB conserve les champs d'origine et permet des colonnes typées supplémentaires par migrations additives lorsque les contrats de l'interface seront stabilisés. Aucun classement national n'est proposé dans cette phase.
