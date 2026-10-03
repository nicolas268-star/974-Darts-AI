# Calibration assistée — amélioration d’ergonomie du laboratoire

Suite au retour de Nicolas : les cinq clics sur une petite image ne sont pas assez faciles au téléphone.

## Nouveau parcours

Depuis une référence figée, ouvrir **Calibrer en grand · zoom et loupe**. L’assistant occupe la largeur du téléphone, sans demander une nouvelle caméra ni modifier son zoom.

Pour chacun des cinq repères : toucher approximativement la zone sur la photo, utiliser le zoom d’affichage ×2/×4 au besoin, observer la loupe séparée et ajuster avec les grosses flèches. Le pas fin vaut un pixel de l’image figée, pas un millimètre de précision garantie. Confirmer explicitement le point pour avancer.

Les boutons **20 / 6 / 3 / 11 / Bull** permettent de revenir directement sur un point, sans effacer les quatre autres. **Effacer seulement ce point** ne touche pas aux autres. Un Bull incohérent ou une homographie invalide laisse les points éditables et interdit l’application.

Après les cinq confirmations, vérifier la grille, cocher qu’elle suit les fils puis appliquer. La calibration du laboratoire n’est modifiée qu’à ce moment. **Fermer sans appliquer** ou Échap annule les modifications de l’assistant. La calibration précédente est conservée. Une nouvelle référence crée un assistant indépendant.

La méthode manuelle initiale reste disponible en secours. L’assistant est inaccessible pendant la surveillance et pendant l’inspection d’un lancer, pour ne pas recalibrer une observation en cours.

## Limites inchangées

Il s’agit toujours d’une calibration manuelle assistée, pas d’une reconnaissance automatique de cible. Les règles de géométrie, les seuils de détection, les permissions caméra et l’authentification sont inchangés. Aucune dépendance ajoutée, aucun service payant activé, aucun envoi d’image et aucune modification des moteurs de jeu, de la base ou des classements.

## Vérifications

- `npm run test:vision` inclut désormais 15 contrôles supplémentaires : progression explicite, correction d’un seul point, immutabilité du brouillon, coordonnées sous zoom, limites de l’image, pas d’ajustement et refus des valeurs invalides.
- `tests/workflow/vision-calibration.browser.mjs` est intégré au parcours navigateur existant. Il ouvre la vraie page Next/React dans la fixture isolée, importe une cible synthétique et contrôle le dialogue en largeur 390 px, les flèches, la loupe, le zoom, le rejet d’un mauvais Bull, la correction d’un seul repère, l’application après validation, l’annulation et Échap. Il vérifie aussi l’absence d’écriture API pendant ce parcours.
- Le navigateur de la fixture utilise sa configuration existante `bypassCSP: true` : ce test ne remplace pas la vérification des politiques HTTP de production.
- La caméra physique et Safari sur iPhone ne sont pas simulés par ces essais. Un test sur le téléphone réel reste nécessaire.

Références consultées : React useEffect (https://react.dev/reference/react/useEffect), élément HTML dialog (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## Livraison

Changement frontend uniquement. Ne pas annoncer cette interface en ligne tant que la branche n’a pas été fusionnée et le frontend du VPS reconstruit. Aucun déploiement automatique ajouté.
