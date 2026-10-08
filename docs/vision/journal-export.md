# Journal local et téléchargement groupé

Le téléchargement unitaire obligeait à exporter chaque lancer immédiatement : le journal gardait les annotations, mais les images des anciens essais n'étaient plus disponibles. Le laboratoire conserve maintenant chaque analyse figée avec ses images natives disponibles, ses captures d'analyse, ses masques, sa calibration et ses identifiants.

## Utilisation

1. Après chaque lancer, attendre « Capture et images conservées dans le journal local », puis annoter normalement.
2. Dans « Journal d'essais local », cocher les essais souhaités ou utiliser « Tout sélectionner ».
3. Cocher « Inclure les images natives, les captures d'analyse et les diagnostics » pour transmettre un lot exploitable hors ligne.
4. Choisir « Télécharger la sélection » ou « Télécharger tout le journal ». Un seul ZIP est téléchargé ; il peut être joint depuis le téléphone, sans passer chaque fichier par Messenger.
5. Si le navigateur n'ouvre pas automatiquement le téléchargement, utiliser le lien « Récupérer le fichier ZIP préparé ».

Chaque ligne affiche le numéro, la date, l'annotation, l'état et la taille de l'essai. Les refus de recalage et captures non annotées sont également conservés. La surveillance sans changement ne remplit pas le journal d'images transitoires.

Les nouvelles captures restent disponibles après un rechargement dans le même navigateur. Cela ne restaure pas la caméra ni sa calibration en mémoire après un rechargement complet. Les anciennes images perdues avant cette mise à jour ne peuvent pas être récupérées depuis l'ancien journal ; les JSON déjà téléchargés restent utilisables.

## Fichiers et données

- ZIP standard sans compression supplémentaire, contenant un JSON `schemaVersion: 2` par essai et un `manifest.json` qui relie les fichiers aux identifiants, dates et annotations.
- Les JSON individuels conservent les conventions natives et recalées documentées dans [native-export.md](native-export.md). Chacun contient uniquement l'annotation de sa capture.
- Les données sont stockées localement comme Blobs JSON dans IndexedDB, avec un index de résumés séparé. React ne garde pas les images historiques en mémoire.
- Le ZIP lit les essais successivement et calcule leurs CRC par tranches ; il ne construit pas un grand tableau de pixels ou un ArrayBuffer complet de l'archive.
- Si l'option images est décochée, `nativePair` et `currentPair` sont nuls dans chaque fichier exporté. La préparation ne modifie pas les données originales conservées.
- Aucun envoi réseau, nouvelle dépendance, modification du moteur de détection, des parties ou de la base serveur.

## Limites et récupération

Le journal accepte 100 captures, 64 Mio par essai et 512 Mio au total, sous réserve de la place accordée par le navigateur. Aucune capture ancienne n'est supprimée automatiquement. Le journal n'est pas une sauvegarde distante : télécharger une copie avant d'effacer les données du navigateur.

Si le stockage est refusé ou plein, un message le signale et propose de réessayer. L'annotation peut rester en mémoire pour permettre l'export JSON individuel avec les images. Passer au lancer suivant dans ce cas demande de confirmer que l'essai a été téléchargé. La suppression du journal exige une confirmation et ne modifie pas l'état de validation de la capture actuellement affichée.

Le ZIP préserve la reprise caméra déjà livrée : un passage en arrière-plan suspend la caméra ; « Reprendre la caméra » retrouve les captures et réglages tant que la page n'a pas été rechargée.

## Vérification

`npm run test:vision` dans `app/frontend` inclut les contrôles de structure ZIP, CRC, noms, tailles et indisponibilité du stockage. Le scénario de production `node tests/workflow/run-vision-production.browser.mjs` couvre le journal réel IndexedDB, la sélection partielle, l'archive complète, les pixels natifs, le rechargement, la suppression et le format mobile, en plus des contrôles existants de caméra.

Le navigateur automatisé est Chromium. Un contrôle final sur le téléphone réel reste utile pour le comportement du téléchargement propre à Safari.
