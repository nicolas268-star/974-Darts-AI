# Interface Comités France — implémentation et évolutions

Après validation du visuel provisoire et demande de déploiement, les premiers écrans ont été intégrés dans l'application Next.js existante. Les paragraphes suivants décrivent le contrat cible ; les filtres territoriaux, les projections de résultats et la file supervisée restent des évolutions.

## Écrans implémentés

`/comites/france` et `/comites/france/[id]` utilisent le client Supabase du visiteur sous RLS. Une projection explicite ne conserve que les champs utiles et filtre à nouveau les identités et associations vérifiées avec source publique. Recherche insensible aux accents, filtre de ligue sportive, pagination de neuf organismes, filtre de saison dès qu'une compétition confirmée existe. Une panne n'est jamais présentée comme un registre vide.

`/admin/comites-france` réutilise `requireAdmin()` et l'administrateur unique autorisé. Les onglets présentent propositions, observations, organismes et imports. La validation commence en attente et exige justification et confirmation ; publier demande une preuve HTTPS visant la compétition.

`POST /api/admin/comites-france` contrôle session, rôle, origine, JSON limité à 12 Ko et champs autorisés. L'acteur provient de la session vérifiée. Le serveur fixe l'identifiant ciblé et la date de contrôle, puis appelle la RPC transactionnelle. La clé service reste dans un module `server-only`. Les erreurs SQL ne sont pas exposées au navigateur.

Les corrections avancées restent disponibles par CLI auditée. Les écrans ne lancent ni collecte longue ni publication sportive. Les poules et brackets restent dans les snapshots privés en attendant une projection contrôlée.

## Contrat public

La page d'annuaire lit `france_committees` sous RLS, avec tri sur le nom normalisé et filtres sur région administrative confirmée. Une région inconnue s'affiche « non renseignée » et reste distincte d'une ligue sportive. Les compteurs portent exclusivement sur les compétitions vérifiées dont la source est encore publique, pour la saison demandée. Les comités documentés sans compétition confirmée peuvent apparaître avec un compteur nul et un libellé clair.

La fiche `/comites/france/[id]` utilise un identifiant stable de l'organisme et une pagination chronologique des métadonnées `france_competitions`. Les champs disponibles sont nom, date UTC de source, saison, type, statut N01, effectif d'entrées enregistrées, formats confirmés et URL officielle retournée par l'API. Le contrat distingue explicitement absence de donnée, liste vide et erreur de source. Aucune reconstruction d'URL Nakka à partir du seul `tdid`.

Les tableaux et poules nécessiteront une projection publique dédiée depuis `france_sources`, après contrôle des données publiques et de la visibilité. Réutiliser les composants de présentation de `tournament_page_service` lorsque leurs contrats s'appliquent, sans appeler la publication de points ou l'identification des joueurs. Les brackets Winner/Loser restent disponibles dans les snapshots privés ; une projection ultérieure n'exigera pas de changer le registre d'organisateurs.

## Administration

Le premier écran utilise une route serveur Next.js privée plutôt qu'une nouvelle route FastAPI : elle réutilise directement la vérification de session existante. Prévoir ensuite des listes paginées des organismes et ligues incertains, preuves, historique détaillé et runs partiels.

L'écran de validation doit montrer le document N01, l'identifiant de compétition, la source externe et la justification avant confirmation. Une suggestion de nom, de ligue ou de score ne présélectionne jamais `VERIFIED`. Une décision saisit l'acteur serveur ; ne pas accepter une identité d'administrateur fournie librement par le navigateur. Le lancement d'un run va dans une file privée avec suivi de progression ; aucune collecte longue dans une requête web publique.

Avant mise en ligne : tester avec les rôles `anon`, utilisateur normal et administrateur ; vérifier zéro fuite des tables privées, les filtres de saison, les compteurs, les corrections manuelles et la disparition d'un tournoi devenu privé. La sélection d'une saison n'a aucune incidence sur MVP 2027, les points officiels ou Interclubs.

## Évolutions proposées

1. Confirmation humaine des liens entre les organismes documentés et leurs ligues N01 ; conserver la distinction entre organisme vérifié et rattachement vérifié.
2. Normalisation progressive des régions/départements avec sources territoriales explicites, puis indexation des filtres.
3. Annuaire et fiches publiques fondés sur RLS, avec cache invalidé après décision/import.
4. Projection des poules et brackets publics et file de synchronisation supervisée, après validation de la phase 1.

Le stockage JSONB conserve les champs d'origine et permet des colonnes typées supplémentaires par migrations additives lorsque les contrats de l'interface seront stabilisés. Aucun classement national n'est proposé dans cette phase.
