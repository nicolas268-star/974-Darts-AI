# Blind Draw Championship — préparation de la saison 1

Bloc sur `/tournaments`, page `/tournaments/blind-draw-championship` et liens depuis les six événements déjà présents dans `/calendar`. Aucune duplication des événements.

Les dates et le barème proviennent de la page du Tampon Darts Club consultée le 11 septembre 2026 :
https://tampon-darts-club.assoconnect.com/collect/description/706462-n-blind-draw-championship-by-tdc-saison-1

Les points sont attribués intégralement à chaque membre de la doublette : 8 / 6 / 5 / 4 / 2 (places 5 à 8) / 1 (places 9 à 12, uniquement à 12 équipes), plus les victoires de poules, plafonnées à 3. Le total individuel additionne les six manches, sans sélection des trois meilleures. Trois participations ouvrent l’éligibilité ; elles ne garantissent pas une place parmi les huit finalistes. La Super Finale en simple est annoncée le 21 février 2027 à 9 h, lieu à confirmer.

## Après le tirage et la publication des résultats

- Le lien de manche 1 est enregistré, mais aucun mot de passe ni résultat privé n’est inclus dans le code. Aucun import Nakka automatique n’est activé par cette préparation.
- `app/frontend/lib/bdc.ts` contient les six manches et une liste `BDC_RESULTS` volontairement vide. Ajouter seulement les résultats validés, sous forme de doublettes de deux joueurs identifiés par des IDs stables. Les associations sont propres à chaque manche.
- Ne pas confondre points BDC et statistiques de lancer. Les statistiques d’une doublette ne permettent pas de reconstituer les moyennes, 180 ou finishes de ses deux membres. Ces statistiques demandent une source individuelle.
- Le classement de la doublette et les victoires de poules doivent être validés avant attribution des points ; `null` conserve l’état non validé. Ajouter une doublette aux résultats uniquement lorsque sa participation effective est confirmée, pas sur simple inscription.
- La version actuelle accepte les formats annoncés de 8 ou 12 doublettes. Un autre effectif nécessite une confirmation du barème par l’organisateur.
- Le classement conserve les égalités. Le règlement PDF et le départage officiel restent à vérifier avant d’annoncer les huit qualifiés. Le statut affiché vérifie uniquement le seuil des trois participations.
- Les futures modifications de dates doivent être répercutées dans `BDC_ROUNDS` ; les liens du calendrier s’appuient sur le titre BDC et la date pour retrouver la manche.

## Vérification

Depuis `app/frontend` : `node scripts/test-bdc.mjs` puis `npm run build`.

Le composant est autonome si le backend des tournois ne répond pas. Il n’écrit pas dans Supabase, ne modifie pas le championnat officiel et ne configure pas la surveillance Nakka.
