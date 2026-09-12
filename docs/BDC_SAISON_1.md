# Blind Draw Championship — saison 1, manche 1 terminée

Bloc sur `/tournaments`, page `/tournaments/blind-draw-championship` et liens depuis les six événements déjà présents dans `/calendar`. Aucune duplication des événements.

Les dates et le barème proviennent de la page du Tampon Darts Club consultée le 11 septembre 2026 :
https://tampon-darts-club.assoconnect.com/collect/description/706462-n-blind-draw-championship-by-tdc-saison-1

Les points sont attribués intégralement à chaque membre de la doublette : 8 / 6 / 5 / 4 / 2 (places 5 à 8) / 1 (places 9 à 12, uniquement à 12 équipes), plus les victoires de poules, plafonnées à 3. Le total individuel additionne les six manches, sans sélection des trois meilleures. Trois participations ouvrent l’éligibilité ; elles ne garantissent pas une place parmi les huit finalistes. La Super Finale en simple est annoncée le 21 février 2027 à 9 h, lieu à confirmer.

## Manche 1 — 11 septembre 2026

Source publique : https://n01darts.com/n01/league/season.php?id=t_iIQi_5560

8 doublettes, 16 joueurs, 28 matchs de poule puis 2 demi-finales, finale et petite finale. Le tableau final a été corrigé manuellement après un incident Nakka (arrêt de matchs à 1–1). L’organisateur confirme l’absence de feuilles conservées pour les legs hors application. Les statistiques sont donc explicitement **partielles — incident Nakka**. Ne jamais extrapoler les legs manquants, transformer leurs valeurs en zéros ou annoncer des records de tournoi sur cette couverture incomplète.

Points par joueur : Super Mario / Pierre 11 ; Abrousse / Alexandre 9 ; Vincent / Guillaume 8 ; Kevin / Fabien 7 ; Gary / Yoann 5 ; Beverley / Fran 5 ; Benjamin / Julien 4 ; Nicolas / Jeff 4. Chaque joueur a une participation, aucun n’a encore atteint le seuil de trois manches.

`bdc-round-one.json` conserve une sélection non sensible du tableau corrigé et des statistiques publiques. `bdc-round-one-matches.json` conserve les 32 résumés enregistrés : leurs scores de poule peuvent être incomplets et ne doivent pas servir au classement. L’affichage utilise les scores de `pool`, corrigés, et sépare les moyennes partielles. Les scores de phase finale sont des sets, pas des legs.

`bdc-round-one-details.json` contient la vue normalisée de la manche : 28 matchs de poule, 4 matchs de phase finale, classement de poule et statistiques individuelles disponibles. Seules 16 feuilles sur 32 contiennent l’ordre nominatif nécessaire pour attribuer les volées aux joueurs. La répartition suit cet ordre enregistré ; son total de fléchettes et sa moyenne sont contrôlés contre les totaux de chaque duo. Les 16 autres fiches affichent « Donnée indisponible – incident Nakka ».

`BdcRoundTemplate.tsx` est le modèle de présentation réutilisable pour les manches suivantes : synthèse, Round Robin, tableau final, statistiques générales collectives, classements individuels disponibles, contributions au scoring et fiches dépliables. `BdcRoundOne.tsx` ne fait qu’injecter les données de la Manche 01 dans ce modèle.

Les performances personnelles ne sont jamais déduites des seuls totaux de la doublette. Elles sont publiées uniquement lorsqu’une feuille conserve à la fois l’ordre nominatif et les volées. Les points BDC individuels sont indépendants de cette limite. Aucun import dans le championnat/Supabase ni modification des statistiques historiques de duos.

## Manches suivantes

- Le lien de manche 1 est enregistré, mais aucun mot de passe ni résultat privé n’est inclus dans le code. Aucun import Nakka automatique n’est activé par cette préparation.
- `app/frontend/lib/bdc.ts` contient les six manches et les résultats de la manche 1. Ajouter seulement les prochains résultats validés, sous forme de doublettes de deux joueurs identifiés par des IDs stables. Les associations sont propres à chaque manche.
- Ne pas confondre points BDC et statistiques de lancer. Les statistiques d’une doublette ne permettent pas de reconstituer les moyennes, 180 ou finishes de ses deux membres. Ces statistiques demandent une source individuelle.
- Le classement de la doublette et les victoires de poules doivent être validés avant attribution des points ; `null` conserve l’état non validé. Ajouter une doublette aux résultats uniquement lorsque sa participation effective est confirmée, pas sur simple inscription.
- La version actuelle accepte les formats annoncés de 8 ou 12 doublettes. Un autre effectif nécessite une confirmation du barème par l’organisateur.
- Le classement conserve les égalités. Le règlement PDF et le départage officiel restent à vérifier avant d’annoncer les huit qualifiés. Le statut affiché vérifie uniquement le seuil des trois participations.
- Les futures modifications de dates doivent être répercutées dans `BDC_ROUNDS` ; les liens du calendrier s’appuient sur le titre BDC et la date pour retrouver la manche.

## Vérification

Depuis `app/frontend` : `node scripts/test-bdc.mjs` puis `npm run build`.

Le composant est autonome si le backend des tournois ne répond pas. Il n’écrit pas dans Supabase, ne modifie pas le championnat officiel et ne configure pas la surveillance Nakka.
