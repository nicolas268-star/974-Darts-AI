# Simple 16 C–F : données de Christophe

La seconde confirmation de l’organisateur, le 15 octobre 2026, identifie les séries réelles de Christophe : **40 en une fléchette au premier leg, 6 en une fléchette au second**. Le premier correctif ne changeait que le résultat ; ces séries étaient encore attribuées à Benoit dans le brut Nakka. Leur réattribution locale est désormais explicitement confirmée.

Source : https://n01darts.com/n01/league/n01_view.html?tmid=t_uAfU_5679_lg_0_86xc_uwbj_z1ps . Le détail API frais confirme le simple `8jsiG9Na_1791996900443`, son libellé « Simple 16 C-F* », les deux restants 40/6 et les deux checkouts `score=-1, left=0`. Il s’agit de la position 18 dans la feuille intercalant les doubles.

| Donnée de Christophe sur ce simple | Avant | Après |
|---|---:|---:|
| Leg 1 : score marqué | 465 | 501 |
| Leg 1 : fléchettes totales | 39 | 40 |
| Leg 1 : finish | absent | 40, en 1 fléchette |
| Leg 2 : score marqué | 494 | 501 |
| Leg 2 : fléchettes totales | 42 | 40 |
| Leg 2 : finish | absent | 6, en 1 fléchette |
| Moyenne du simple, pondérée | 35,52 | 37,58 |
| Score du simple | 2–0 | 2–0 |
| Fournaise–Ambrée | 15–5 | 15–5 |

Le nombre **40** dans la colonne des fléchettes est le total du leg : 13 volées de trois fléchettes puis une fléchette au checkout. Il ne désigne pas le nombre de fléchettes utilisées pour le finish.

Les séries adverses de 465/39 et 494/42 sont réattribuées à Benoit sur les mêmes legs. Les identifiants de joueurs, équipes représentées, lignes statistiques, matchs et legs ne changent pas. Benoit reste affilié à Brune et joue exceptionnellement pour Ambrée sur cette rencontre. Aucun profil n’est échangé, aucune volée n’est inventée, aucune autre partie n’est corrigée.

## Mise en œuvre

- `interclub_adjustments.py` conserve séparément le correctif de résultat et celui de statistiques. La signature 40/1 puis 6/1 est obligatoire, les données brutes restent archivées dans `raw_nakka` et `source_snapshot`, et `statistics_corrections` porte la seconde confirmation.
- La nouvelle migration `20261015052702_interclub_j2_statistics_attribution.sql` réutilise la garde de la première correction, normalise les anciens et nouveaux payloads vers la même attribution effective, et ajoute une opération ciblée `correct_interclub_j2_statistics()`.
- Cette opération reprend le verrou de saison, valide la publication originale, met à jour exactement quatre lignes sans modifier leurs identités ou marqueurs de résultat, recalcule les deux profils cumulatifs et relance toute la validation du publisher existant. Un échec annule la transaction entière.
- L’import original reste conservé. `imports.analysis_json.local_statistics_corrections` ajoute les quatre lignes et les deux profils avant correction, les empreintes avant/après, le motif, la date et l’auteur SQL. La publication conserve son UUID et sa date initiale ; son payload et son empreinte décrivent les statistiques effectives.
- Une seconde application retourne `UNCHANGED`. Un ancien worker limité à la correction du score est normalisé côté SQL et ne peut pas rétablir les anciennes statistiques. Une modification différente de la source reste bloquée pour examen.
- Le classement en parties/legs reste identique. Les moyennes et First 9 individuels et collectifs sont recalculés depuis les lignes corrigées. Le MVP réutilise sa formule existante : sa composante scoring suit les nouvelles valeurs ; victoires, volume et finishes maximaux restent inchangés sur ce cas.
- Les notes de feuille expliquent les deux confirmations, sans conserver la mention obsolète selon laquelle toutes les séries restent sous les attributions Nakka.

## Vérification et application

Validation locale : **130 tests unitaires backend**, **30 tests Match Day**, compilation Python, suite transactionnelle `tests/workflow/npm test` et `git diff --check` réussis. Les tests exécutent les vrais chemins de lecture de la feuille, du classement, des profils et la vraie formule MVP. Ils vérifient aussi les permissions privées, le rejeu de migration, les imports avec les deux versions du worker, une panne tardive annulant lignes et profils, l’absence de doublons, les autres rencontres/saisons inchangées, et le retour arrière suivi d’une réapplication.

Après installation de la migration sur le projet de production `vkvdyrsrvbyugbjlmknb`, exécuter :

```sql
select public.correct_interclub_j2_statistics();
```

Le premier passage retourne `CORRECTED` et `statistics_updated: 4`, les suivants `UNCHANGED`. La feuille conserve l’URL https://974darts.re/matches/b0cdeed6-0c3d-4941-9c09-5c0837ab7205 . Vérifier Christophe comme finisseur avec 40 puis 6, et 40 fléchettes totales pour chaque leg. Aucun effacement global de cache ou de stockage du worker n’est requis.

L’opération SQL suffit à corriger les données et les lectures existantes de la feuille. Le backend et `interclub-analysis` doivent ensuite charger le code fusionné pour actualiser les notes et les nouveaux imports Python. Le frontend n’a pas été modifié. Aucun envoi Facebook/WhatsApp n’est effectué.

## Retour arrière limité aux statistiques

Conserver l’audit de l’import, arrêter `interclub-analysis`, puis exécuter `supabase/operations/rollback_j2_statistics_attribution.sql` avec le rôle d’administration SQL. Le script vérifie que la publication correspond exactement à la correction attendue, restaure les quatre anciennes lignes, recalcule les deux profils à partir des données actuelles et marque la réversion dans l’historique. **Le résultat 15–5 et les victoires de Christophe restent corrigés.** Il ne supprime aucune rencontre et ne touche pas aux identités ou affiliations.

La transaction refuse une réversion après une modification différente ou si les quatre lignes ne sont pas retrouvées. Garder le worker arrêté tant que cet état doit être conservé ; une réapplication explicite de l’opération ciblée rétablit l’attribution confirmée et ajoute une nouvelle entrée d’audit. Ce cycle a été testé localement.
