# Résumés de soirée — Visibilité

L’espace `/admin/visibility` propose deux blocs distincts : résumé interne WhatsApp et publication officielle Facebook. Le référencement Google reste accessible en dessous.

## Parcours

La dernière rencontre interclubs publiée, détaillée et vérifiée de la saison active est sélectionnée automatiquement. Le résumé statistique est préparé à l’ouverture. Le bouton WhatsApp prépare la sélection éditoriale IA si elle est configurée, puis ouvre WhatsApp avec le texte. L’utilisateur choisit son groupe et confirme l’envoi dans WhatsApp. Une modification manuelle du texte est conservée lors du partage.

« Préparer la version Facebook » charge une version plus courte dans le bloc existant. « Copier et ouvrir Facebook » copie le texte et ouvre Facebook ; l’utilisateur choisit sa page ou son groupe et publie. Les annonces libres et le texte réutilisable pour Instagram restent disponibles.

L’application n’envoie pas de message directement et ne prétend pas connaître l’état de publication. Aucune intégration non officielle de WhatsApp Web n’est utilisée.

## Préparation automatique les soirs de championnat

Le service Compose `interclub-analysis` vérifie le calendrier du site au début de chaque minute. Pour chaque événement `CHAMPIONSHIP` non annulé, il déclenche la préparation à **23 h 50, heure de La Réunion (UTC+4)**, à la date effectivement enregistrée au calendrier. Il relit ce calendrier à chaque passage ; un report ou une annulation invalide une analyse préparée pour l’ancienne date.

Il collecte directement le lien Nakka de la rencontre, dans la ligue de la saison active. Aucun clic d’import n’est nécessaire pour obtenir le résumé dans Visibilité. Il exige 16 simples et 4 doubles terminés, des legs complets, et la concordance des statistiques individuelles et collectives avec les volées. Les identifiants de participants propres à la rencontre sont utilisés ; un identifiant canonique Nakka erroné ne fusionne pas deux joueurs. Les faits viennent de Nakka et le lien de détail conduit à cette source.

Si le match est encore en cours, la source indisponible ou incohérente, nouvelle tentative **toutes les 5 minutes pendant 48 heures**, y compris après minuit. Un redémarrage reprend les tentatives en attente. Au-delà de 48 heures, Visibilité indique qu’un contrôle est nécessaire. 23 h 50 est l’heure de déclenchement : le texte est disponible après la collecte et, si configurée, la réponse de l’IA.

Les analyses prêtes sont conservées dans `/app/data/interclub_analysis.json`, sur le volume persistant existant. Un verrou entre processus évite deux traitements simultanés. Une analyse prête est réutilisée ; si seule l’IA est indisponible, le résumé statistique est conservé et la sélection IA est retentée sans recollecter le match. Le statut visible dans Visibilité inclut l’activité du service, la prochaine soirée et les rencontres en attente.

Cette préparation concerne les analyses privées et les textes de communication. Elle ne modifie pas les tables officielles de championnat, les classements ni les identités, et ne publie aucun message sur un réseau social. Les procédures de publication des statistiques restent distinctes. Aucune migration Supabase n’est nécessaire.

Déploiement : reconstruire `backend frontend interclub-analysis` et démarrer les trois services. Le service de nuit nécessite une clé OpenAI dans le même fichier d’environnement que le backend pour produire la sélection IA ; sans clé, il prépare une analyse statistique explicite. Après modification de cette clé, recréer **backend et interclub-analysis**. Le bouton de partage WhatsApp conserve son fonctionnement.

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
