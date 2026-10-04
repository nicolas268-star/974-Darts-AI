# Stabilisation locale V1 — laboratoire privé 974Darts Vision

## Statut et limites

Développement basé sur `main` vérifié au commit `22e27e2b5840abe9dbd7a301b7cce49f7a454beb` (application 21.0.17). Aucune évolution des jeux, des statistiques, de l'authentification ou de la publication. Aucune migration, API payante ou transmission d'image. La PR doit rester distincte des étapes fusion, déploiement et essai terrain.

La paire brute de l'incident à **28,83 %** n'est pas disponible. Ni sa cause ni sa résolution ne sont établies. Les fixtures procédurales et Chromium ne mesurent pas la précision d'une cible réelle ou d'un iPhone. Une scène rejetée ne vaut jamais zéro point.

## Architecture et choix

- `stabilization.ts` : luminance, recherche grossière bornée, raffinement, validation, rééchantillonnage.
- `analysis-pipeline.ts` : unique fonction commune aux imports, à « Comparer maintenant » et à la surveillance.
- `vision-analysis.worker.ts` : calcul local hors du thread d'interface.
- `analysis-client.ts` : un travail en cours, pas de file, annulation par terminaison, délai 15 s, gestion des erreurs et des réponses obsolètes.
- `VisionLab.tsx` : références, affichage commun photo/grille, annotation humaine et export.

Pas de bibliothèque supplémentaire. La recherche utilise 576 échantillons répartis dans 36 régions (12 directions × 3 bandes radiales) de la cible calibrée, hors du mur et du Bull central. Elle emploie une pyramide par moyenne de blocs, de grand côté ≤ 240, puis ≤ 480, puis la capture originale. La recherche grossière sur ce petit raster est suivie de descentes coordonnées à pas décroissants. Aucune recherche exhaustive à pleine résolution, homographie de mouvement ou déformation élastique.

La similitude est estimée par erreur photométrique tronquée. Depuis `similarity-v1.1`, le raffinement final exclut les points isolés dont le résidu dépasse 18 niveaux (ou est invalide). Une région entière n'est exclue qu'à partir de trois points aberrants sur ses seize échantillons : cela préserve l'exclusion des changements groupés, notamment des fléchettes. L'ensemble est ensuite figé et ne peut retirer plus de 20 % des points. La validation utilise de nouveau **toutes** les régions texturées initiales. Le masque d'estimation n'est **jamais** transmis au détecteur : un changement local reste analysé.

Cette correction évite qu'un seul point bruité invalide seize points. Sur l'export terrain du 4 octobre 2026 à 15:15 UTC (deux captures de cible vide), 11 points aberrants sur 576 faisaient auparavant exclure neuf régions, soit 25 % des points. Le refus est reproduit avec la V1. Avec la V1.1, 565 points sont conservés : recalage accepté, 36 régions concordantes, couverture 100 %, différences brutes 6,04 % puis résiduelles 1,02 %, aucun candidat. Cela valide ce cas vide uniquement, pas la détection de vraies fléchettes ni l'ancien incident à 28,83 %. Les images personnelles ne sont pas ajoutées au dépôt.

Cette méthode privilégie le refus lorsque la texture ou la couverture est insuffisante. Les reflets, fortes ombres, déformations de cible, longues occultations et mouvements hors modèle exigent une nouvelle prise ou une calibration. Les symétries visuellement indiscernables ne permettent pas de prouver le mouvement physique ; la calibration et le contrôle humain restent indispensables.

## Convention des coordonnées

`T_current_to_reference` transforme les pixels de la capture courante brute en pixels du repère fixe de calibration. Le centre est `((width-1)/2, (height-1)/2)` :

```
p_reference = centre + scale × R(rotation) × (p_current - centre) + (dx, dy)
aligned(p_reference) = current(T_inverse(p_reference))
```

Rotation en radians dans les exports, degrés dans l'interface. X et Y sont des pixels isotropes de capture, jamais des coordonnées normalisées utilisées comme espace euclidien. Les points d'annotation sont ensuite normalisés par la largeur et la hauteur de la référence, pour conserver le contrat de calibration existant.

Les captures sont limitées à 960 pixels sur leur grand côté. L'export précise aussi les dimensions du fichier/capteur avant réduction et la translation équivalente dans cette source. Les pixels d'affichage CSS ne participent jamais au calcul. Les limites sont `±8 × max(width,height)/960` pixels par axe, ±2° et une échelle entre 0,98 et 1,02, avec seulement une tolérance numérique de 0,05 pixel à 960, 0,0002 rad et 0,0002 en échelle. L'enveloppe de recherche est volontairement plus grande pour détecter les mouvements hors limites, puis les refuser.

L'image recalée conserve exactement les dimensions de référence. Le rééchantillonnage bilinéaire part toujours de la nouvelle capture **brute**, une seule fois. Les pixels sans correspondance sont exclus grâce au masque valide. Une vue brute ou de différences n'affiche ni grille ni marqueurs et n'accepte aucun point. La vue recalée réutilise le même composant Canvas que la calibration.

## Critères d'acceptation

- Au moins 24 régions texturées sur 36 (variance de luminance ≥ 100).
- Au moins 24 régions concordantes et 78 % des régions texturées ; une région exige 80 % de ses résidus sous 18 niveaux.
- Au moins 9 directions sur 12 avec deux bandes concordantes.
- Erreur quadratique tronquée finale ≤ 14 niveaux de luminance.
- Amélioration ≥ 12 % pour un mouvement significatif.
- Cas identité explicite : déplacement équivalent < 0,25 pixel à 960 et erreur identité < 14 ; aucune amélioration minimale imposée.
- Rapport de gradients ≥ 0,55 ; saturation ≤ 18 % ; décalage de luminosité ≤ 24 niveaux.
- Couverture valide ≥ 98 % de la zone de détection.
- Conservation du refus **`changedFraction > 0.16`** sur les différences résiduelles.

Le dénominateur des fractions reste le nombre de points de la grille de détection dans le rayon calibré ≤ 1,12, **y compris** les points invalides. Leur contribution au numérateur est nulle, et une couverture < 98 % bloque le résultat. Lorsqu'un recalage existe, les fractions brute et recalée utilisent la même intersection des masques de référence/capture. En cas de refus préalable, seul le diagnostic brut est disponible ; aucun « après » artificiel n'est annoncé.

La comparaison applique **une seule** compensation additive robuste, estimée par médiane dans la cible valide. Le détecteur accepte ce paramètre et ne le soustrait qu'une fois. Le contrôle de recalage estime séparément un décalage pour mesurer sa qualité, sans modifier l'image. Aucun gain ni redressement de contraste n'est appliqué en V1. Le flou conduit à un refus, jamais à une prétendue reconstruction de netteté.

Ces seuils sont des paramètres V1 conservateurs validés sur les fixtures, pas des garanties universelles. La qualité du recalage, le taux de pixels modifiés et les extrémités candidates sont trois informations distinctes ; aucune n'est une probabilité de score exact.

## Faux déclenchement sur un fil de la cible

L'export terrain du 4 octobre 2026 à 16:20 UTC contient une capture de 16:11:32 UTC annotée `S18`, mais les images AVANT, APRÈS et recalée montrent toutes une cible vide. Le résultat `S11` provient d'une composante de treize échantillons sur un fil déjà présent, dans une boîte de 20 × 2 pixels de capture. Il ne localise donc pas la fléchette physique annoncée : l'image analysée ne contient pas ce lancer. Le recalage est accepté et reste inchangé. Ce cas ne démontre aucune précision de détection dans le 18.

Depuis `classical-difference-v1.1`, une composante doit contenir au moins trois échantillons apportant une différence qui dépasse le seuil par rapport à toute la plage de luminance d'un voisinage 3 × 3 de la référence originale. Le rayon est **un pixel de capture**, pas un pas de la grille de détection ni un pixel CSS. Une variation entièrement compatible avec ce petit voisinage ne suffit plus à proposer une silhouette. Les treize échantillons du fil de ce cas sont tous explicables ainsi.

Ce contrôle décide seulement de conserver ou non une composante : il ne déplace ni ne raccourcit ses extrémités. La fraction de pixels modifiés, le seuil de refus de scène à 16 %, la compensation lumineuse unique et les critères de recalage restent inchangés. Le contrôle ne prétend pas reconnaître une fléchette ; un objet fin ou peu contrasté confondu avec une texture existante peut rester indétectable. `NO_CHANGE` signifie toujours absence de changement exploitable, jamais absence certaine de lancer ou score nul.

Le rejeu de cette paire produit maintenant `ALIGNED → NO_CHANGE`, zéro boîte et zéro candidat, avec la même fraction résiduelle de 1,3937 %. L'autre paire vide de 15:15 UTC reste sans candidat. Quatorze régressions procédurales couvrent des fils déplacés ou élargis en portrait/paysage, des tiges nouvelles de 2 et 4 pixels traversant un bord existant, la conservation des extrémités, plusieurs résidus dispersés, le refus des occultations larges et les voisins invalides. Le premier cas de fil déplacé échoue sur le moteur précédent. Aucun de ces contrôles ne remplace un essai avec une vraie fléchette visible.

Limite préexistante reproduite séparément : si une vraie tige se raccorde à un long résidu de fil dans la même composante, les extrémités proposées peuvent encore suivre le fil. L'admission d'une composante ne garantit donc ni la séparation des objets ni la localisation de la pointe. Cette correction ciblée ne modifie pas cette estimation ; la saisie du secteur réel et le contrôle de l'image restent indispensables.

L'interface indique désormais près des commandes si la surveillance est active ou arrêtée, ainsi que l'heure de la capture figée avec les secondes. Avant d'annoter, il faut vérifier que la fléchette est visible dans cette capture. Si elle n'y est pas, « Réessayer la capture », puis « Comparer maintenant » conserve la référence AVANT et analyse une nouvelle image. `capturedAt` figure aussi dans `currentAnalysis` et `currentPair`, y compris avant annotation. Les images privées de cet incident restent hors du dépôt et de la CI.

## Référence et cycle de vie

L'image ayant servi à la calibration est immuable pour la session. La référence de comparaison peut contenir les fléchettes confirmées ; sa capture brute, sa version recalée et son masque sont conservés séparément. Chaque capture se recale contre l'ancre initiale : des petits mouvements successifs ne réinitialisent pas les limites de mouvement.

« Préparer le lancer suivant » n'est possible qu'après une annotation `LABELLED`, sur une image acceptée et un détecteur hors `SCENE_CHANGED`. Une réponse « Impossible à déterminer », un faux positif ou le mode brut diagnostique ne promeuvent pas de référence. « Réessayer la capture » conserve la référence AVANT et ne crée aucune annotation. Les identifiants de capture empêchent une double confirmation.

Les identifiants session/calibration, référence et capture sont vérifiés côté client. Pause, arrêt caméra, recalibration, nouvelle référence, fermeture et arrière-plan invalident les résultats en vol. Un worker terminé ne peut pas publier tardivement. Aucun calcul ne continue sur le thread principal en cas d'indisponibilité du worker : un message permet de réessayer.

Les données d'entrée sont copiées par structured clone, jamais transférées/détachées. Seuls les buffers de sortie appartenant au worker sont transférés. La référence et les images brutes restent exportables. La surveillance et la comparaison manuelle attendent trois captures stables espacées d'au moins 250 ms. Pendant un calcul, aucun nouveau travail n'est ajouté ; trois nouvelles observations stables sont requises après chaque réponse sans changement. La référence initiale ne bouge pas pendant cette attente.

Le worker est limité à `'self'` dans la CSP de `/admin/vision`. Aucun ajout de `blob:` pour les workers, aucun changement COOP/COEP, aucune désactivation globale de CSP. Le test dédié lance **`next build` puis `next start`** avec `bypassCSP: false`, et vérifie aussi l'absence de `unsafe-eval`.

## Export JSON v2

Sans consentement : versions moteur/stabilisation, convention, calibration, dimensions capture/source, IDs, transformation, état/motif, mesures avant/après, durées et annotations, sans aucune image ni tableau de pixels.

Depuis `similarity-v1.1`, une mesure de qualité non atteinte à cause d'un refus ou d'une annulation vaut `null`, jamais un faux zéro. L'interface affiche « non calculé » et n'affiche les paramètres du mouvement que si le recalage est accepté. Un vrai zéro calculé reste zéro. La transformation candidate demeure dans l'export avec son état de refus pour le diagnostic.

Avec la case explicite : paire brute de captures PNG (après réduction initiale à 960, sans grille ni recompression JPEG), ancre spatiale, référence de comparaison, image recalée si acceptée et masque sous forme de plages linéaires `[indexDébut, longueur]` de pixels valides. La paire brute et la transformation de l'analyse courante restent disponibles après refus, sans confirmer de faux lancer. Ce sont des téléchargements locaux. Les images personnelles ne vont ni au dépôt, ni aux logs, ni aux artefacts CI.

## Tests et mesures

Commandes :

```sh
npm run test --prefix app/frontend
npm run build --prefix app/frontend
npm audit --prefix app/frontend --omit=dev --audit-level=high
npm run test:browser --prefix tests/workflow
npm run test:vision:browser --prefix tests/workflow
```

Le dernier parcours est ajouté à « Qualité obligatoire », après les parcours navigateur existants. Il s'appuie uniquement sur la fixture locale du dépôt, avec des utilisateurs fictifs et aucune base distante.

Les fixtures de `vision-fixtures.mjs` sont analytiques et déterministes. Leur rendu inverse est indépendant des fonctions de transformation testées. Carré 960×960, portrait 540×960, paysage 960×540 ; identités, 2/5 px dans les deux axes, sous-pixel, rotations des deux signes, échelles et combinaisons. La limite de reprojection testée est **0,65 pixel maximum sur cinq points**. Le test exige aussi zéro candidat pour mouvement seul, conservation du changement ajouté, anciennes fléchettes non redétectées et absence de dérive cumulative.

Huit cas additionnels perturbent indépendamment les pixels de toute l'image : bruit faible ±2 niveaux, plus 1,5 % de bruit impulsionnel ±65, en portrait/paysage, avec/sans translation de 2 px et avec/sans fléchette. Ils exigent zéro faux candidat à vide, exactement une silhouette ajoutée, une extrémité à moins de 2 px de l'entrée synthétique et un écart géométrique inférieur à 2 px sur 64 points du bord de la ROI. Cette tolérance propre au bruit fort ne remplace pas le contrôle à 0,65 px des images propres. Un test vérifie également la distinction entre zéro calculé et mesure non calculée.

Un neuvième cas de bruit réparti (3 %, graine 12345, portrait vide) reproduit le défaut indépendamment des données privées et des sites d'échantillonnage : la V1 exclut quatorze régions pour seulement dix-neuf points aberrants et refuse la scène. La V1.1 conserve 557 points et produit `NO_CHANGE`, sans candidat. Cette régression est exécutée en CI.

Sont également testés : main, scène différente, flou, uniformité/manque de texture, saturation, miroir, saut de secteur, mouvement hors limites, dimensions, variation lumineuse, masque insuffisant, invalidité des bords, réduction des limites à petite résolution, buffers non modifiés, annulation, travail unique, erreur/délai/indisponibilité du worker et réponse obsolète. Les extrémités d'une silhouette ne sont jamais assimilées à une pointe certaine.

Le parcours Chromium vérifie import/caméra manuelle/surveillance automatique, les vues et leurs coordonnées, l'export avec/sans images, le refus sans annotation, la référence fixe, l'absence de doublon, Pause, erreurs worker, nouvelle session, mobile/desktop et l'absence d'écritures API.

Mesures locales initiales sur 33 paires géométriques : erreur de reprojection maximale **0,034 px**, traitement **96–331 ms**. Le script imprime les résultats de chaque paire et les mesures mémoire Node avant/après. Le sous-total des buffers typés directement suivis par le recalage atteint **12,44 Mo** à 960×960 ; ce n'est pas le pic mémoire du navigateur (copies d'entrée, rasters temporaires, objets JS, Canvas et affichage s'y ajoutent). Les durées fluctuent avec la machine et sa charge. Aucun chiffre iPhone n'est déduit de ces mesures.

## Protocole terrain pour Nicolas

1. Immobiliser le téléphone, cadrer la cible vide en entier et éviter reflets/ombres. Ouvrir `/admin/vision` dans Safari ou Chrome en HTTPS.
2. Figer la référence vide. Utiliser la calibration existante ; vérifier les doubles/triples, le Bull et le vrai 20, puis confirmer.
3. Laisser « Stabilisation automatique » activée. Comparer une scène vide stable : aucun impact ne doit être proposé. Si elle est refusée, exporter la paire utile avant de reprendre le cadrage.
4. Armer, lancer **une seule** fléchette puis sortir la main et attendre. Ne pas toucher au téléphone. La première fléchette ne doit jamais devenir silencieusement une référence.
5. Comparer « Référence », « Après brut », « Après recalé » et « Différences ». Contrôler les fils dans la vue recalée. Consulter séparément pixels modifiés et mesures de recalage.
6. Vérifier physiquement le point d'entrée et inscrire le secteur réel (`S20`, `D20`, `T20`, etc.). Les deux extrémités proposées sont des alternatives. Confirmer seulement après contrôle humain.
7. Garder la fléchette en place, préparer le lancer suivant puis refaire un lancer isolé. Une ancienne fléchette ne doit pas réapparaître comme nouvel impact.
8. En cas de refus : ne pas confirmer un faux lancer. Cocher l'export d'images si tu acceptes de conserver les alentours visibles, puis exporter le JSON. « Réessayer la capture » conserve AVANT. Recalibrer seulement si le cadrage a réellement changé ou si le mouvement dépasse les limites.
9. Transmettre volontairement le fichier de diagnostic pour analyse, en indiquant téléphone/navigateur, secteur réel et circonstances. L'application ne l'envoie jamais automatiquement.

## Livraison et déploiement

La branche et la PR livrent le code et les preuves de tests. Les statuts « développé », « testé localement », « CI validée », « fusionné », « déployé » et « testé sur téléphone réel » doivent être annoncés séparément. Pas de fusion avec un contrôle obligatoire en échec.

Aucun déploiement VPS n'est effectué par cette PR. Après validation et autorisation explicite, une commande frontend seule sera préparée sur un **SHA réel vérifié de main**, avec sauvegarde du commit et de l'image frontend précédents, vérification de l'ascendance Git, refus d'un arbre sale ou de différences backend/migrations, puis build frontend et contrôle de santé. Aucun SHA futur ou de fusion n'est inventé ici.

Références d'intégration : documentation embarquée Next 16.3.8 (`dist/docs`, CSP, Turbopack/webpack), [webpack Workers](https://webpack.js.org/guides/web-workers/), [MDN structured clone et terminaison](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).
