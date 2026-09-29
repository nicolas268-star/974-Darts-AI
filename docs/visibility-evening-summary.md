# Résumés de soirée — Visibilité

L’espace `/admin/visibility` propose deux blocs distincts : résumé interne WhatsApp et publication officielle Facebook. Le référencement Google reste accessible en dessous.

## Parcours

La dernière rencontre interclubs publiée, détaillée et vérifiée de la saison active est sélectionnée automatiquement. Le résumé statistique est préparé à l’ouverture. Le bouton WhatsApp prépare la sélection éditoriale IA si elle est configurée, puis ouvre WhatsApp avec le texte. L’utilisateur choisit son groupe et confirme l’envoi dans WhatsApp. Une modification manuelle du texte est conservée lors du partage.

« Préparer la version Facebook » charge une version plus courte dans le bloc existant. « Copier et ouvrir Facebook » copie le texte et ouvre Facebook ; l’utilisateur choisit sa page ou son groupe et publie. Les annonces libres et le texte réutilisable pour Instagram restent disponibles.

L’application n’envoie pas de message directement et ne prétend pas connaître l’état de publication. Aucune intégration non officielle de WhatsApp Web n’est utilisée.

## Données et IA

Les données proviennent exclusivement de résultats interclubs publiés, vérifiés et détaillés. Les matchs doivent concorder avec le score collectif ; chaque leg doit être valide et avoir tous ses participants. Les moyennes sont calculées avec la somme des scores et des fléchettes, sans moyenne de moyennes. Les joueurs sans participation ne sont pas inclus.

L’analyse produit des faits vérifiés : répartition simples/doubles, origine principale de l’écart, moyennes collectives, meilleure moyenne avec volume de legs, victoires en simples, finish, 180 et points. L’IA choisit les faits pertinents et leur ordre pour WhatsApp et Facebook. Son résultat est limité à des identifiants de faits autorisés : noms, chiffres et phrases sont rendus par le service. Elle ne peut ajouter de record, émotion, récit ou précision aux doubles absents des données.

Sans clé, ou si le fournisseur est indisponible, le résumé statistique reste disponible et son statut est explicite. Aucun accès IA n’est supposé à partir de l’abonnement ChatGPT.

## Configuration OVH

La clé reste dans `/etc/974darts/production.env`, jamais dans le navigateur ou Git :

```dotenv
OPENAI_API_KEY=...
VISIBILITY_AI_MODEL=gpt-5-mini
```

Le modèle doit prendre en charge Responses, Structured Outputs et `reasoning.effort=low`. Les appels utilisent `store=false`, 1 800 tokens de sortie maximum et un délai de 35 secondes. Une génération par contenu et modèle est conservée dans `/app/data/visibility` (volume backend existant). Toute modification des faits invalide cette entrée. Les consultations seules ne déclenchent aucun appel IA.

Après ajout/modification d’une variable, recréer le conteneur backend via Compose. Le code nécessite aussi la reconstruction du frontend. Aucune migration SQL et aucune modification Caddy.

## Contrôles

- Accès au proxy réservé à l’administrateur autorisé ; contrôle de l’origine sur POST ; UUID et taille de requête validés.
- API interne protégée par le jeton serveur ; réponse privée sans cache navigateur.
- Tests métier : calcul pondéré, résultat incohérent, détail incomplet, données non publiées, saison inactive, absence/échec IA, cache invalidé et contrat Responses.
- Essai sur les données J1 du 28/09/2026 : 17–3, 20 matchs, 45 legs, 10 joueurs, moyenne Emmanuel 50,82, finish 88, un 180 de Yoann.
- Test navigateur isolé : partage intercepté, conservation des modifications, version Facebook, copie, refus utilisateur non autorisé/CSRF et affichage mobile. Aucun message envoyé.

## Références techniques

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-5-mini
- https://faq.whatsapp.com/425247423114725/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/groups
