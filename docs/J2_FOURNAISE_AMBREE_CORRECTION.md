# J2 Fournaise–Ambrée : correction et procédure d’application

**Complément du 15 octobre :** l’organisateur confirme que les séries terminées par 40 puis 6, chaque fois en une fléchette, appartiennent à Christophe. La nouvelle correction réattribue les quatre lignes statistiques du Simple 16 uniquement, avec recalcul des moyennes et du First 9. Voir [le compte rendu de cette seconde confirmation](J2_SIMPLE16_STATISTICS.md). Les sections ci-dessous décrivent la première intervention, qui concernait uniquement le résultat et conservait alors les statistiques sous leurs attributions Nakka.

Le correctif produit **Fournaise 15–5 Ambrée** à partir des 20 parties. La modification est préparée sur une branche ; aucune migration ni correction de données n’a été exécutée en production, aucun déploiement ni envoi Facebook/WhatsApp n’a été effectué.

## Identification vérifiée

Sources examinées : dépôt `main` au commit `002d3f29ef4d4e013fa6947b8c2bde4aafb82f08`, calendrier public de 974darts.re, API Nakka et lectures SQL de la base `vkvdyrsrvbyugbjlmknb`.

| Élément | Valeur |
|---|---|
| Saison | 2026–2027, affichée comme saison 2027 |
| ID saison Supabase | `512e8a6e-5ee6-421c-8bb4-94e4ba79023c` |
| Journée et date | J2, 14 octobre 2026 |
| ID calendrier, observé dans le rendu public | `34a05e59-3f10-4d97-8a81-80d183ef8077` |
| Référence Nakka | `t_uAfU_5679` |
| URL | https://n01darts.com/n01/league/season.php?id=t_uAfU_5679 |
| Clé interne de rencontre | `2026-2027\|J2\|nakka:t_uAfU_5679` |
| Ordre Nakka | Ambrée domicile (`z1ps`), Fournaise extérieur (`uwbj`) |
| Simple concerné | Simple 16, position 18 dans les 20 parties intercalant les doubles |
| ID simple Nakka | `8jsiG9Na_1791996900443` |
| Benoit BRUNET | Joueur `a9fded26-6e5a-489e-b15c-fb5568ee553d`, identité `45f23d50-2f77-4ef4-983c-2cca7f5a425f`, participant Nakka `5ggq` |
| Christophe FERNANDEZ | Joueur `78c05fc0-340e-43fa-93d6-7aadd225fe36`, identité `3d02bc37-d8e4-436e-88f5-da4f73091984`, participant Nakka `a0zp` |

À la lecture de production, cette rencontre n’a ni ligne dans `encounters`, ni résultat dans `championship_results`, ni publication automatique. Ses UUID de rencontre/résultat/simple seront créés par le mécanisme existant au moment de la publication, puis affichés par la commande. Les trois autres rencontres J2 de 2026–2027 existent. Aucun UUID de publication n’est inventé.

**Renfort confirmé : Benoit BRUNET.** L’effectif officiel 2027 le place dans Brune, une affiliation Supabase saisonnière existe déjà pour Brune, et la feuille Nakka le fait jouer pour Ambrée. Les trois autres participants Ambrée sont Laurent PARET, Caroline PARET et Jacky VERDIER. Fournaise aligne Christophe FERNANDEZ, Fabien GUINOBERT, Nicolas DUPONT et Adrien LICHTENHAHN. L’identification utilise les noms complets officiels, les identités canoniques, la composition du simple et les identifiants de participants ; les `opid` Nakka ne sont pas utilisés seuls.

## Avant et après, sur cette rencontre

| Mesure | Source Nakka validée | Résultat effectif |
|---|---:|---:|
| Benoit vs Christophe | 2–0 | **0–2** |
| Vainqueur du simple | Benoit / Ambrée | **Christophe / Fournaise** |
| Fournaise vs Ambrée, parties gagnées | 14–6 | **15–5** |
| Fournaise vs Ambrée, legs gagnés | 30–17 | **32–15** |
| Fournaise vs Ambrée, simples gagnés | 11–5 | **12–4** |
| Fournaise vs Ambrée, doubles gagnés | 3–1 | 3–1 |
| Benoit, legs gagnés / joués | 7 / 14 | **5 / 14** |
| Christophe, legs gagnés / joués | 7 / 16 | **9 / 16** |
| Benoit, parties gagnées / jouées | 3 / 6 | **2 / 6** |
| Christophe, parties gagnées / jouées | 3 / 6 | **4 / 6** |
| Points championnat Fournaise / Ambrée | 4 / 1 | 4 / 1 |
| Différentiel de parties Fournaise / Ambrée | +8 / −8 | **+10 / −10** |
| Total parties / legs / lignes individuelles | 20 / 47 / 118 | 20 / 47 / 118 |

Le 15–5 résulte d’une seule correction. Les autres simples, les doubles et toutes les données de lancer restent identiques. Les moyennes, First 9, finishes, 100/140/180 et volées conservent leur identité d’origine. Une éventuelle incohérence sportive entre un finish brut et le vainqueur corrigé reste explicitement documentée ; aucune volée n’est inventée ou déplacée.

## Mécanismes réutilisés et fichiers

- `app/backend/app/services/interclub_analysis_source.py` conserve l’instantané brut complet Nakka pour cet événement. Ses contrôles existants réconcilient d’abord les 20 parties, les 47 legs, les 118 lignes et les agrégats Nakka.
- `interclub_adjustments.py` porte la dérogation précise et la correction de résultat. La portée exige événement, saison, journée, date, deux équipes, deux identités, ID du simple et composition des deux legs. Les deux marqueurs de victoire sont corrigés, puis les totaux sont recalculés. Un total différent de 5–15 provoque un arrêt explicite.
- `interclub_publication_service.py` réutilise la résolution officielle des identités, avec Brune comme effectif de référence pour ce seul participant de cette seule rencontre. Les statistiques continuent à représenter Ambrée. Les faits utilisés par le worker sont reconstruits après publication depuis le résultat effectif.
- `player_statistics_engine.py` distingue cette participation de l’affiliation du profil : Benoit reste affiché à Brune. Les relations de partenaires/adversaires et les contributions collectives utilisent toujours l’équipe effectivement représentée, Ambrée.
- `supabase/migrations/20261014201802_interclub_j2_result_correction.sql` étend la fonction installée `publish_interclub_match`, sans copier son moteur. Une garde privée compare le payload effectif à sa source retenue et n’autorise que les différences de résultat attendues. Le publisher ne crée aucune appartenance Ambrée pour le renfort.
- `match_hub_service.py` alimente les notes déjà affichées sur la feuille : « Renfort exceptionnel pour Ambrée — équipe habituelle : Brune » et motif de correction.
- `interclub_correction_command.py` propose un aperçu en lecture seule, puis une publication ciblée uniquement avec `--apply`, exigeant un fichier d’audit local.
- Les tests Python, la fixture réelle J2 et `tests/workflow/interclub-j2.test.mjs` couvrent le correctif. Les listes des migrations du schéma de classement individuel dans `database.test.mjs` et `preview-server.mjs` excluent cette migration interclubs, testée dans son propre schéma. `tests/workflow/package.json` ajoute ce test au contrôle CI existant.
- `supabase/operations/verify_j2_fournaise_ambree.sql` et `rollback_j2_fournaise_ambree.sql` fournissent les contrôles et le retour arrière ciblés.

La source canonisée avant correction est conservée dans `payload.source_snapshot`, le brut upstream dans `raw_nakka`, et la correction dans `result_corrections` avec événement, simple, identités, score initial, score corrigé et motif exact : « Inversion de score confirmée par l’organisateur ». Les clés naturelles des lignes stockées relient ces références aux UUID internes. `interclub_auto_publications.published_at`, `payload_hash` et le statut de l’import donnent la trace d’application selon les conventions existantes.

Le verrou de saison, les insertions et la mise à jour des profils restent dans la transaction existante. Une nouvelle collecte de la même source erronée produit le même payload corrigé et retourne `UNCHANGED`, sans doublon. Un import direct du score brut sur cet événement est refusé. Si la source change au-delà des différences validées, le publisher conserve la publication existante et signale le conflit ; il n’écrase pas la correction.

Classement, statistiques détaillées et composante résultats du MVP sont recalculés par les chemins existants en lecture. Les profils cumulatifs sont recalculés dans la transaction. La formule MVP réelle a été testée : seul son indice de résultats évolue ; les composantes scoring, impact et finish sont conservées. Les endpoints concernés utilisent `no-store`, les faits éditoriaux corrigés produisent leur propre fingerprint de cache, et la base de production ne contient aucune vue matérialisée publique à rafraîchir. Le stockage du worker ne doit pas être effacé globalement.

## Validation exécutée

- `python3 -m compileall -q app` : réussi.
- `python3 -m unittest discover -s tests -p 'test_*.py' -q` : 128 tests réussis, dont cinq nouveaux tests J2.
- `python3 -m pytest -q tests/test_match_day.py` : 30 tests réussis.
- `npm test` depuis `tests/workflow` : réussi, incluant les tests existants et le test J2 transactionnel.
- Test J2 : permissions privées, rejet du brut sans audit, rejet d’un échange d’identité ou d’une modification de scoring, exactitude 0–2 / 5–15, conservation de l’affiliation Brune, contribution Ambrée, réimport, absence de doublon, conservation de J1 et des profils historiques, lectures publiques, notes de feuille, formule MVP réelle, rollback ciblé et réapplication idempotente.
- `git diff --check` : réussi.

## Application en production, séparée de la PR

Cette procédure est destinée à l’opérateur **après autorisation de fusion et de déploiement**. Elle n’a pas été exécutée ici. Ne lancer aucun import global ni notification dans le cadre de cette opération.

1. Depuis le checkout de production, arrêter temporairement `interclub-analysis` avec la configuration habituelle :

   ```bash
   docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml stop interclub-analysis
   ```

2. Installer le code via la procédure de déploiement habituelle, après autorisation. Exécuter **uniquement** la nouvelle migration SQL dans le projet Supabase `vkvdyrsrvbyugbjlmknb`. Elle modifie des fonctions privées, sans publier ni changer les données sportives. Elle est réexécutable ; si la définition installée a changé, elle refuse de remplacer un point de patch inconnu.

3. Exécuter l’aperçu depuis le backend mis à jour :

   ```bash
   docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml exec -T backend python -m app.services.interclub_correction_command
   ```

   Vérifier le bon ID calendrier, `t_uAfU_5679`, Simple 16 / position 18, Benoit et Christophe, source Ambrée 6–14 Fournaise et effectif 5–15. Une lecture Nakka déjà corrigée 5–15 est également admise sans inversion supplémentaire, si ses détails restent cohérents. Au moment de cette préparation, `existing_result` doit être vide. Si un résultat différent a été publié entre-temps, la commande s’arrête sans l’écraser et il faut examiner cette nouvelle situation.

4. Appliquer uniquement cette rencontre et conserver un instantané sous un nom neuf :

   ```bash
   docker compose --env-file /etc/974darts/production.env -f deploy/compose.yaml exec -T backend python -m app.services.interclub_correction_command --apply --snapshot /app/data/j2-fournaise-ambree-audit-01.json
   ```

   La commande vérifie la présence de la garde SQL, appelle le publisher existant, puis relit le résultat et affiche les UUID de rencontre, résultat et simple. Elle n’appelle ni compositeur de publication, ni worker social, ni envoi de message. Un second passage avec un autre nom d’instantané doit retourner `UNCHANGED`.

5. Exécuter le fichier SQL de vérification en lecture seule. Confirmer 20 parties, 47 legs, 118 lignes, Benoit 0/2, Christophe 2/2, total Ambrée 5–15 Fournaise, affiliation habituelle Brune et un seul audit. Consulter la feuille `/matches/<result_id>`, le classement et les profils. Refaire une synchronisation ciblée : le résultat doit rester corrigé.

6. Redémarrer `interclub-analysis` avec la configuration habituelle. La correction reste prioritaire. Aucune publication automatique Facebook ou WhatsApp n’est déclenchée par cette commande.

## Retour arrière ciblé

Avant toute annulation, garder l’instantané local et vérifier que son `existing_result` était vide : le rollback fourni annule **la nouvelle publication**, revenant à l’absence de résultat observée pendant cette préparation. Il ne rétablit pas un faux score 14–6.

Arrêter `interclub-analysis`, puis exécuter `supabase/operations/rollback_j2_fournaise_ambree.sql` avec le rôle d’administration SQL. Le script reprend le verrou de saison, valide l’audit et chaque ligne stockée via le publisher existant, puis supprime uniquement cet import, cette rencontre et ses détails. Il recalcule les profils concernés à partir des autres rencontres publiées ; les autres saisons et rencontres restent conservées. Les affiliations saisonnières officielles restent conservées, notamment la ligne Brune de Benoit ; aucune ligne Ambrée n’a été créée pour lui. Les fonctions de protection restent installées.

La transaction s’annule entièrement si une vérification échoue. Garder le worker arrêté tant que l’annulation doit rester effective : le redémarrer autorise la réimportation correcte. Une nouvelle application par la commande rétablit 15–5 ; ce cycle a été testé dans le schéma local isolé.

## Points restant à vérifier

Les UUID de publication, les profils et le classement de production seront vérifiables après l’application autorisée. La migration et la commande n’ont été exercées que dans les tests locaux et sur la fixture Nakka ; la base de production a été utilisée exclusivement en lecture. Si la source ou les identités ont changé entre-temps, les garde-fous demandent une nouvelle vérification au lieu de modifier d’autres parties.
