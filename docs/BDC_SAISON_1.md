# Blind Draw Championship — saison 1, manches 1 et 2 terminées

Bloc sur `/tournaments`, page `/tournaments/blind-draw-championship` et liens depuis les six événements déjà présents dans `/calendar`. Aucune duplication des événements.

Les dates et le barème proviennent de la page du Tampon Darts Club consultée le 11 septembre 2026 :
https://tampon-darts-club.assoconnect.com/collect/description/706462-n-blind-draw-championship-by-tdc-saison-1

Les points sont attribués intégralement à chaque membre de la doublette : 8 / 6 / 5 / 4 / 2 (places 5 à 8) / 1 (places 9 à 12, uniquement à 12 équipes), plus les victoires de poules, plafonnées à 3. Le total individuel additionne les six manches, sans sélection des trois meilleures. Trois participations ouvrent l’éligibilité ; elles ne garantissent pas une place parmi les huit finalistes. La Super Finale en simple est annoncée le 21 février 2027 à 9 h, lieu à confirmer.

## Manche 1 — 11 septembre 2026

Source publique : https://n01darts.com/n01/league/season.php?id=t_iIQi_5560

8 doublettes, 16 joueurs, 28 matchs de poule puis 2 demi-finales, finale et petite finale. Le tableau final a été corrigé manuellement après un incident Nakka (arrêt de matchs à 1–1). L’organisateur confirme l’absence de feuilles conservées pour les legs hors application. Les statistiques sont donc explicitement **partielles — incident Nakka**. Ne jamais extrapoler les legs manquants, transformer leurs valeurs en zéros ou annoncer des records de tournoi sur cette couverture incomplète.

Points par joueur : Super Mario / Pierre 11 ; Abrousse / Alexandre 9 ; Vincent / Guillaume 8 ; Kevin / Fabien 7 ; Gary / Yoann 5 ; Beverley / Fran 5 ; Benjamin / Julien 4 ; Nicolas / Jeff 4. Chaque joueur a une participation, aucun n’a encore atteint le seuil de trois manches.

`bdc-round-one.json` conserve une sélection non sensible du tableau corrigé et des statistiques publiques. `bdc-round-one-matches.json` conserve les 32 résumés enregistrés : leurs scores de poule peuvent être incomplets et ne doivent pas servir au classement. L’affichage utilise les scores de `pool`, corrigés, et sépare les moyennes partielles. Les scores de phase finale sont des sets, pas des legs.

`bdc-round-one-details.json` contient la vue normalisée de la manche : 28 matchs de poule, 4 matchs de phase finale, classement de poule et statistiques individuelles disponibles. L’ordre officiel des joueurs correspond à l’ordre des noms dans chaque duo et a été confirmé par l’organisateur. Le deuxième audit a recalculé, volée par volée, les scores, fléchettes, moyennes 3 darts, First 9, contributions, tours sans score, catégories 100–139 / 140–169 / 170–179, 180 et finishes. Les 16 feuilles déjà détaillées ont été retrouvées sans écart et 15 feuilles supplémentaires sont exploitables, soit 31 matchs sur 32. Trois rencontres ne contiennent que les deux legs enregistrés avant l’incident ; une feuille ne contient plus aucune séquence. Les legs ajoutés manuellement après l’incident restent indisponibles et ne sont jamais reconstitués.

`BdcRoundTemplate.tsx` est le modèle de présentation réutilisable pour les manches suivantes : synthèse, Round Robin, tableau final, statistiques générales collectives, classements individuels disponibles, contributions au scoring et fiches dépliables. `BdcRoundOne.tsx` ne fait qu’injecter les données de la Manche 01 dans ce modèle.

Les performances personnelles ne sont jamais déduites des seuls totaux de la doublette. Elles sont recalculées uniquement à partir des volées conservées et de l’ordre fixe confirmé dans le duo. Les points BDC individuels sont indépendants de cette limite. Aucun import dans le championnat/Supabase ni modification des statistiques historiques de duos.

## Manches suivantes

### Manche 2 — 9 octobre 2026 : classement cumulé provisoire

Source publique : https://n01darts.com/n01/league/season.php?id=t_sEW0_8920

7 doublettes et 14 joueurs ont réellement participé, avec 21 matchs de poule et 4 matchs de phase finale. Kozu / Vincent gagnent 3–2 contre Kévin / Alexandre ; Benjamin / Stéphane prennent la troisième place, 3–0 contre Guillaume / Yoann. Nicolas / Laurent sont cinquièmes, Dominique / Mario sixièmes et Coralie / Maxime septièmes.

`bdc-round-two.json` est une sélection publique normalisée des résultats. `audit-bdc-round-two.py` vérifie les 25 rencontres, les 64 legs et les 14 joueurs contre les agrégats Nakka. Chaque attribution utilise les `oid` de l’ordre Nakka propre à chaque leg : l’ordre écrit dans le nom d’une doublette n’est pas une preuve. Les scores, fléchettes, grosses volées et hauts finishes concordent avec les agrégats individuels et collectifs. Les First 9 individuels utilisent les neuf premières fléchettes de chaque joueur dans chaque leg, comme en M1 ; le First 9 brut Nakka du duo reste un indicateur distinct.

La page de l’organisateur pour M2 publie les formats 8 ou 12 doublettes et le même barème : https://tampon-darts-club.assoconnect.com/collect/description/755112-n-blind-draw-championship-by-tdc-saison-1-manche-2. Nicolas a autorisé le 10 octobre 2026 l’application du **même barème aux 7 doublettes, sous réserve de validation du directeur sportif**, avec cette mention publique. Les points M2 sont donc provisoirement attribués : 11 / 9 / 8 / 7 / 4 / 3 / 3 par joueur, soit 90 points individuels. Le statut de la sélection est `provisional-ds-review` ; `BDC_RESULTS` marque M2 `provisional: true`. Cela ne constitue pas une validation du directeur sportif.

Nicolas a confirmé les correspondances : Stéphane ↔ Abrousse (M1), Mario ↔ Super Mario (M1), Vincent ↔ Vincent (TDC, partenaire de Guillaume en M1). Le classement cumulé réutilise leurs identifiants stables de M1. Kozu est un nouveau participant de passage : une participation M2, aucun alias ni résultat M1. Laurent, Dominique, Coralie et Maxime ont également des identifiants distincts sans club supposé. La règle commune des trois participations reste applicable ; le passage de Kozu ne justifie pas une exclusion ou une qualification inventée.

Les rapports publiés sont référencés dans `BDC_ROUND_REPORTS`, séparément des manches comptabilisées dans `BDC_RESULTS`. La page Tournois et le portail Compétitions annoncent deux rapports disponibles et le classement cumulé M1 + M2, avec la réserve du directeur sportif. Les cellules M2 et les totaux qui les incluent portent un renvoi explicite. Les 21 joueurs cumulent 196 points ; Vincent mène avec 19 points provisoires, Nicolas en compte 8. Aucun joueur n’a encore trois participations. Une validation ultérieure du directeur sportif devra mettre à jour le statut M2 et ses mentions publiques.

Audit : `python scripts/audit-bdc-round-two.py` (lecture seule) ; ajouter `--write` pour régénérer la sélection publique, après inspection de la source. Aucun import Supabase ni effet sur le championnat officiel.

- Le lien de manche 1 est enregistré, mais aucun mot de passe ni résultat privé n’est inclus dans le code. Aucun import Nakka automatique n’est activé par cette préparation.
- `app/frontend/lib/bdc.ts` contient les six manches et les résultats des manches 1 et 2. Ajouter seulement les prochains résultats validés, ou explicitement autorisés sous réserve avec un statut provisoire, sous forme de doublettes de deux joueurs identifiés par des IDs stables. Les associations sont propres à chaque manche.
- Ne pas confondre points BDC et statistiques de lancer. Les statistiques d’une doublette ne permettent pas de reconstituer les moyennes, 180 ou finishes de ses deux membres. Ces statistiques demandent une source individuelle.
- Le classement de la doublette et les victoires de poules doivent être validés avant attribution des points ; `null` conserve l’état non validé. Ajouter une doublette aux résultats uniquement lorsque sa participation effective est confirmée, pas sur simple inscription.
- La version actuelle accepte les formats annoncés de 8 ou 12 doublettes, ainsi que l’exception M2 à 7 doublettes expressément autorisée sous réserve du directeur sportif. Tout autre format ou nouvelle exception nécessite une confirmation du barème par l’organisateur.
- Le classement conserve les égalités. Le règlement PDF et le départage officiel restent à vérifier avant d’annoncer les huit qualifiés. Le statut affiché vérifie uniquement le seuil des trois participations.
- Les futures modifications de dates doivent être répercutées dans `BDC_ROUNDS` ; les liens du calendrier s’appuient sur le titre BDC et la date pour retrouver la manche.

## Vérification

Depuis `app/frontend` : `node scripts/test-bdc.mjs`, `node scripts/test-bdc-round-two.mjs`, puis `npm run build`.

Le composant est autonome si le backend des tournois ne répond pas. Il n’écrit pas dans Supabase, ne modifie pas le championnat officiel et ne configure pas la surveillance Nakka.
