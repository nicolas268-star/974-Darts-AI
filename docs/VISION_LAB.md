# 974Darts Vision — laboratoire privé (étape 1)

## Périmètre livré

Page `/admin/vision`, réservée à l'administrateur existant (`requireAdmin` au niveau de la page et du layout). Aucun nouveau compte, aucune migration SQL, aucune API de score, aucun accès aux résultats officiels. Entrée « Vision · laboratoire » dans la navigation privée. Le navigateur traite les images localement ; aucune API payante et aucune dépendance ajoutée.

Ce jalon n'est **pas** un autoscoring fiable ni un modèle IA entraîné. Il fournit un banc d'essai reproductible : caméra arrière, calibration manuelle contrôlée, surveillance des changements, propositions explicitement incertaines, annotations humaines et export.

## Première utilisation

1. Ouvrir `/admin/vision` directement dans Safari/Chrome, en HTTPS, avec le compte administrateur. L'entrée de navigation recharge volontairement le document : la Permissions-Policy caméra ne se met pas à jour lors d'une simple transition Next.
2. Immobiliser le téléphone hors de la trajectoire, cadrer toute la cible vide, 20 en haut. Activer la caméra puis **Figer la référence**. Le microphone n'est jamais demandé.
3. Sur l'image figée, cliquer au milieu du **fil extérieur des doubles** des secteurs 20, 6, 3, 11, puis au centre du Bull. Ne pas cliquer sur les chiffres ni sur le bord du support. Une saisie X/Y en pourcentage est disponible au clavier.
4. Vérifier la superposition des six anneaux et des séparations. Cocher la vérification. Une calibration incorrecte fausse tous les scores géométriques ; recommencer en cas de doute.
5. **Armer la détection**, lancer UNE fléchette, puis attendre l'image stabilisée. Alternativement, **Comparer maintenant** après le lancer. Le programme ne valide aucun score.
6. Examiner les propositions. Les extrémités des silhouettes ne sont pas nécessairement les pointes ! Cliquer sur le point d'entrée visible et/ou saisir le secteur réel observé. Confirmer, signaler une fausse détection ou une observation indéterminable.
7. Attendre la confirmation de conservation dans le journal local. Les captures figées sont enregistrées automatiquement avec leurs images, même sans annotation. À la fin de la séance, cocher l'inclusion des images puis télécharger tout le journal ou sélectionner les essais souhaités : un seul ZIP contient leurs diagnostics JSON. Sans cette case, les images sont exclues du ZIP. En cas d'échec du stockage, exporter immédiatement la capture en JSON individuel avec ses images avant de poursuivre.
8. Garder les fléchettes en place pour utiliser l'image annotée comme prochaine référence. Après une volée, mettre en pause, retirer les fléchettes, figer une nouvelle référence et refaire les repères. La reprise caméra après un téléchargement conserve la calibration si le format et le cadrage sont inchangés ; confirmer le cadrage avant de réarmer.

L'import de deux JPEG/PNG/WebP de même cadrage et dimensions permet de tester sans caméra. Limites : 12 Mo par fichier, 20 MP au décodage, redimensionnement à 960 pixels maximum sur le plus grand côté. Ne pas importer deux photos prises à la main ou des captures avec un zoom différent.

## Algorithme et abstention

- Homographie projective calculée à partir de quatre repères, puis contrôle indépendant du Bull. Rejet des repères dégénérés, inversés, trop petits, hors cadre ou incohérents.
- Géométrie nominale d'une cible steel-tip (rayon extérieur des doubles = 170 mm). Pas de correction de distorsion optique ; placer la caméra raisonnablement face à la cible et éviter l'ultra grand-angle.
- Image d'analyse limitée à 480 pixels sur le grand côté, comparaison de luminance corrigée d'un décalage global modéré, suppression du bruit isolé, composantes connexes.
- Deux extrémités sur les silhouettes suffisamment allongées, au maximum quatre propositions. Pas de modèle appris, pas de score de confiance, pas de sélection automatique de la pointe.
- Changements étendus, éclairage fortement modifié ou changements dispersés : abstention et référence à vérifier. Cette heuristique ne garantit pas de détecter tous les mouvements de caméra.
- Surveillance à 4 échantillons par seconde, stabilisation sur trois images successives, arrêt après une observation ou 60 secondes sans résultat exploitable. Les durées sont des paramètres initiaux, pas une garantie de latence.
- Une image sans changement n'est jamais transformée en lancer raté. Une pointe masquée, un rebond, un groupement ou une ombre peuvent nécessiter une annotation manuelle.
- L'annotation est verrouillée par identifiant de capture contre un double clic. Aucun score n'est envoyé aux moteurs de jeu. Le moteur de vision pur ne modifie pas ses entrées.

## Vie privée et cycle de vie

Caméra accessible uniquement avec action utilisateur sur le document du laboratoire. Permission refusée par défaut sur les autres réponses HTTP ; exception exacte `/admin/vision`, micro et géolocalisation toujours refusés. CSP conservée, seulement `media-src 'self' blob:` ajouté pour cette page. Le menu du laboratoire utilise des navigations documentaires pour cette politique.

Arrêt des pistes caméra, de la surveillance et du maintien d'écran à la fermeture/démontage ou au passage de la page en arrière-plan. Protection contre une autorisation caméra résolue après annulation. Le maintien d'écran est facultatif et peut être refusé/relâché par le navigateur. Écran verrouillé = aucune promesse de fonctionnement.

Les captures figées et leurs annotations restent dans IndexedDB, sur cet appareil et dans ce navigateur, sans synchronisation serveur. Le journal survit au rechargement ; le navigateur peut néanmoins supprimer ses données, notamment lorsque les données du site sont effacées. Limites : 100 captures, 64 Mio par capture, 512 Mio pour le journal, sans éviction silencieuse. Un échec de stockage est affiché ; la capture et son annotation restent exportables individuellement depuis la page ouverte. « Vider le journal » supprime les captures et images locales après confirmation.

L'inclusion des images dans les téléchargements reste décochée par défaut. L'export ZIP regroupe les diagnostics des seuls essais choisis ; l'export JSON historique ne contient les images que de la paire actuellement inspectée. Pas de vidéo enregistrée ni d'upload. Ne pas publier des captures personnelles dans le dépôt. Voir [journal et export groupé](vision/journal-export.md).

## Tests

`cd app/frontend && npm run test:vision`

26 contrôles sur images synthétiques et structure de code : les 20 secteurs et multiplicateurs, Bull, frontières, homographies et inverses, repères invalides, bruit, éclairage, occultations, silhouettes ambiguës, anciennes fléchettes, entrée invalide, immutabilité et isolation du laboratoire. Intégrés à `npm test` pour la CI existante.

Ces tests ne mesurent **pas** la précision sur une cible réelle et les contrôles structurels d'authentification ne remplacent pas un test navigateur authentifié.

Avant déploiement : CI frontend complète (`lint`, TypeScript, contrôles existants, vision, build) et autres contrôles obligatoires verts. Aucun remplacement de dépendances ou de lockfile nécessaire.

### Recette sur appareils réels, restant à faire

- Accès anonyme et compte non-admin refusés ; administrateur autorisé. Vérifier aussi les en-têtes caméra après connexion et navigation.
- iPhone/Safari et Android/Chrome : autorisation/refus, arrière-plan, écran verrouillé, interruption de caméra, portrait/paysage, retour à la page.
- Cible entière, différentes lumières, 20 lancers isolés, doubles/triples/Bull, pointes masquées, groupements, mains, retrait et petits mouvements de téléphone.
- Référence stable, un seul échantillon par capture, correction humaine, annotations/export, export avec/sans images, import de deux fichiers.
- Vérifier l'absence de requêtes transportant des images et l'absence totale de modification des parties/statistiques.

Ne pas annoncer un taux de précision avant annotation d'un corpus distinct des données utilisées pour ajuster les seuils. Les candidats sont multiples : un taux « candidat correct présent » ne serait pas une précision top-1 d'autoscoring.

## Déploiement et retour arrière

Changements frontend uniquement. Après fusion validée, mise à jour sur `/opt/974darts/current` vers le SHA vérifié puis reconstruction du service `frontend` avec `deploy/compose.yaml` et `/etc/974darts/production.env`. Aucun changement au Caddyfile local, aux workers, au backend ou à la base. Contrôler `/api/health` et l'accès privé avant les essais.

Retour arrière : revenir au commit précédent et reconstruire uniquement le frontend ; aucune donnée à migrer/restaurer.

## Références techniques consultées

- MDN, MediaDevices.getUserMedia : https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN, WakeLock : https://developer.mozilla.org/en-US/docs/Web/API/WakeLock
- Next.js, headers / priorité de la dernière règle : https://nextjs.org/docs/app/api-reference/config/next-config-js/headers

Le futur jalon 2 ajoutera seulement après validation expérimentale l'appairage téléphone/PC et un adaptateur d'impacts vers les jeux. Ils ne font pas partie de cette livraison.
