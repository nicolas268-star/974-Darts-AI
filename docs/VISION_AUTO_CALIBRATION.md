# Vision : détection automatique des contours et réglages

## Parcours

Sur `/admin/vision`, figer une référence de cible vide, puis **Détecter ma cible**. Le bouton propose le Bull et les anneaux sans demander les cinq clics manuels. Les images sont analysées dans le navigateur. Pas d’upload ni d’API payante.

Contrôler la grille. Corriger au besoin sa position, sa taille, sa rotation ou son orientation par secteurs de 18°. **Largeur, hauteur et perspective** donne accès à des réglages supplémentaires. Le mode fin utilise 1 pixel de déplacement, 1 % de taille et 0,5° de rotation ; ce ne sont pas des garanties de précision physique. **Rétablir la proposition** annule les ajustements. Une modification invalide les confirmations.

Cocher séparément que le centre/doubles/triples suivent la cible et que le 20 est au bon endroit. Appliquer. Fermer ou Échap ne modifie jamais la calibration du laboratoire. Si la détection échoue, aucune grille par défaut n’est inventée : la loupe et les repères manuels restent disponibles.

## Ce qui est automatique, ce qui ne l’est pas

Version `colour-rings-v1` : segmentation rouge/vert, candidats Bull compacts, recherche radiale de deux bandes compatibles avec doubles/triples, ellipse ajustée avec rejet des contours aberrants, carte projective déterminée par l’ellipse et le Bull, puis alignement de l’alternance des couleurs. Des vérifications sur les deux anneaux, leurs quadrants et les secteurs non colorés écartent certaines confusions (notamment l’anneau lumineux seul). Plusieurs cibles plausibles provoquent un refus.

L’orientation initiale suppose le 20 près du haut. **Aucune lecture automatique des chiffres**, aucun modèle IA entraîné. La vérification du vrai 20 reste obligatoire. Cible entièrement visible, suffisamment grande, rouge/vert, vide et bien éclairée requise. Une occultation, de fortes perspectives, des reflets ou des couleurs inhabituelles peuvent empêcher la reconnaissance. La détection ne garantit ni exactitude millimétrique ni reconnaissance de tous les appareils/cibles.

Les réglages sont immuables, appliqués en coordonnées de l’image d’origine et revérifiés par les garde-fous géométriques existants. La rotation se fait dans le plan de la cible avant projection ; déplacement et taille sont exprimés dans l’image. L’orientation par secteurs garde la possibilité de corriger l’hypothèse initiale.

## Décalage d’affichage

La photo de l’utilisateur montrait une grille décalée, sans permettre d’établir avec certitude la cause exacte sur son téléphone. Pour supprimer la désynchronisation possible des couches Canvas/SVG, **l’image et toute sa grille sont maintenant dessinées dans le même bitmap**, via un rendu commun au laboratoire, à l’assistant manuel et au nouvel aperçu automatique. Une seule transformation gère le zoom. Les clics se réfèrent au rectangle réel de ce canvas ; pas à une vue carrée indépendante. Aucun correctif de décalage constant propre à une photo/appareil.

Le format capturé est également vérifié avant analyse : s’il change, la validation est retirée et une nouvelle référence est demandée. Un mouvement de caméra conservant les dimensions n’est pas couvert par ce contrôle : le téléphone doit rester immobile.

## Tests et limites de la validation

`npm run test:vision` inclut les 26 contrôles existants, les 15 contrôles de l’assistant et 29 nouveaux contrôles synthétiques : formats carré/portrait/paysage, décentrage, ellipse, perspective, bruit, refus des scènes vides/tronquées/occultées et anneaux uniformes, plusieurs cibles, ajustements inverses, coordonnées sous zoom et absence de mutation.

Le parcours Playwright de calibration est adapté au rendu unifié et complété par `vision-auto.browser.mjs` : images **540×960 et 960×540** dans un affichage 390 px, détection réelle des pixels de la fixture, confirmations, réglages et réinitialisation, conservation des pixels photo/grille après application (hors annotations ajoutées), absence de débordement, annulation, refus d’une scène vide et absence d’écriture API. La CI existante conserve aussi les parcours des jeux et du classement.

Ces images synthétiques ne constituent pas une mesure de précision en situation réelle. Le test de navigateur existant utilise Chromium avec `bypassCSP: true` ; une validation physique iPhone/Safari et Android/Chrome reste nécessaire. Aucun portrait, photo de domicile ou image fournie par l’utilisateur n’est ajouté au dépôt.

## Périmètre

Frontend privé uniquement. Aucune migration, changement de dépendance, modification d’authentification, permission caméra supplémentaire, écriture de score ou connexion aux classements. Le moteur de détection des fléchettes reste expérimental et inchangé. Aucune synchronisation caméra/partie n’est ajoutée dans ce correctif.

Déploiement : après CI verte et fusion, reconstruire uniquement le frontend. Conserver le commit et l’image précédents. Ne pas confondre fusion GitHub et déploiement VPS effectif.

Références API : MDN CanvasRenderingContext2D.drawImage, Next.js use client. Méthode de détection locale écrite pour ce laboratoire, sans poids ni jeu de données tiers.
