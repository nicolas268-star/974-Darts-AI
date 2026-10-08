# Images natives pour le diagnostic hors ligne

L’export JSON conserve `schemaVersion: 2` et les champs existants. Quand
« Inclure les images natives, les captures d’analyse et les diagnostics » est
coché, il ajoute `nativePair` (version 1), avec `before`, `after` et
`spatialAnchor`. Sans cette case, `nativePair` et `currentPair` sont nuls.

Chaque image native contient son identifiant, son horodatage, les dimensions
source et d’analyse, les facteurs `scaleX`/`scaleY`, son statut et un PNG brut
non recalé. `currentPair` reste à la résolution de l’analyse (grand côté 960).
Le flux vidéo est dessiné une seule fois à sa taille native ; l’image d’analyse
est dérivée de cette copie figée. Les deux résolutions correspondent ainsi au
même instant. La référence native du lancer suivant est l’APRÈS brut précédent,
jamais l’image recalée. La reprise caméra conserve ces captures et la calibration.

Les points annotés restent exprimés dans le repère de référence recalé. Pour
les comparer à l’APRÈS natif, inverser d’abord la transformation de stabilisation
sur le point de l’image d’analyse, puis appliquer la correspondance des centres
de pixels : `native = (analysis + 0.5) * scale - 0.5` sur chaque axe. Une simple
multiplication des points recalés ne suffit pas. Les images AVANT et l’ancre ont
leur propre identifiant et leurs propres dimensions.

Au plus quatre millions de pixels sont conservés par canvas natif afin de borner
la mémoire sur téléphone. Les snapshots transitoires de surveillance ne sont pas
ajoutés au journal. Seuls l’ancre et les captures actuellement retenues restent
référencées sous forme de pixels en mémoire ; chaque analyse figée est conservée
séparément en PNG dans un diagnostic JSON stocké comme Blob dans IndexedDB.
Les exports groupés sont décrits dans [journal-export.md](journal-export.md).
Les photos importées plus grandes restent analysables, mais leur
image native est signalée indisponible avec `source_too_large`. Un défaut de
canvas ou d’encodage produit `canvas_unavailable` ou `encoding_failed`, sans
présenter une image agrandie comme native.

Après déploiement, recharger le laboratoire, capturer une nouvelle référence
vide et vérifier la calibration. Réaliser un seul lancer clairement dans T16,
annoter son point réel, cocher l’inclusion des images, puis exporter le JSON.
Le fichier doit montrer, pour le flux observé précédemment, 720 × 1280 en natif
et 540 × 960 pour l’analyse. Les dimensions dépendent du flux réellement fourni
par le navigateur. Ne pas retirer la fléchette avant cet export.

Les tests vérifient les pixels natifs, les identifiants, l’unicité de la capture,
le consentement, la promotion de référence et la conservation après reprise.
L’algorithme de détection, ses seuils et les scores des parties restent inchangés.
