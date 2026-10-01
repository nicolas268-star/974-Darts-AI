# Résumés de soirée — Visibilité

L’espace `/admin/visibility` propose deux blocs distincts : résumé interne WhatsApp et publication officielle Facebook. Le référencement Google reste accessible en dessous.

## Parcours

La dernière rencontre interclubs publiée, détaillée et vérifiée de la saison active est sélectionnée automatiquement. Le résumé statistique est préparé à l’ouverture. Le bouton WhatsApp prépare la sélection éditoriale IA si elle est configurée, puis ouvre WhatsApp avec le texte. L’utilisateur choisit son groupe et confirme l’envoi dans WhatsApp. Une modification manuelle du texte est conservée lors du partage.

« Préparer la version Facebook » charge une version plus courte dans le bloc existant. « Copier et ouvrir Facebook » copie le texte et ouvre Facebook ; l’utilisateur choisit sa page ou son groupe et publie. Les annonces libres et le texte réutilisable pour Instagram restent disponibles.

L’application n’envoie pas de message directement et ne prétend pas connaître l’état de publication. Aucune intégration non officielle de WhatsApp Web n’est utilisée.

## Publication automatique du championnat

Le service Compose `interclub-analysis` vérifie le calendrier au début de chaque minute. Les soirs de rencontre `CHAMPIONSHIP` non annulée, il commence à **22 h, heure de La Réunion (UTC+4, soit 18 h UTC)**, puis réessaie **toutes les 10 minutes pendant 24 heures, jusqu’à 22 h le lendemain inclus**, si la rencontre est incomplète ou la source indisponible. Après ce dernier créneau, aucune nouvelle collecte automatique n’est lancée pour cette rencontre. Les rencontres déjà publiées ne sont plus collectées. Un redémarrage reprend au prochain créneau depuis le volume persistant. Un report ou une annulation est relu avant la publication.

Il lit le détail Nakka de la ligue active, exige les 16 simples et 4 doubles terminés, et recalcule chaque volée. Les résultats, statistiques par joueur et totaux collectifs doivent concorder avec les agrégats Nakka. Les joueurs sont rattachés au registre des licenciés actifs et aux effectifs officiels 2026–2027 : nom complet (ou alias confirmé), équipe et club. Aucun rapprochement approximatif, aucune création de joueur et aucune fusion ne sont effectués. L’identifiant Nakka `opid` est conservé pour audit uniquement ; une erreur comme celle de Yoann/Yvan en J1 ne mélange pas les statistiques.

La fonction Supabase `publish_interclub_match`, accessible uniquement au rôle serveur, enregistre dans une même transaction le résultat officiel, les matchs, legs, statistiques individuelles et profils cumulés de saison. Le classement et les pages joueurs/équipes lisent immédiatement ces tables, sans étape manuelle. Les moyennes et First 9 cumulent les points et les fléchettes ; les poids exacts sont conservés. La date propre à chaque rencontre est conservée même lorsque plusieurs matchs d’une journée ont lieu à des dates différentes.

Un verrou de saison protège les cumuls. La même source ne peut être publiée deux fois, y compris après un arrêt survenu entre la validation en base et l’enregistrement du fichier d’état. La J1 déjà publiée est reconnue après comparaison de tous ses détails et enrichie uniquement avec les poids First 9 et l’audit automatique. Un résultat existant divergent n’est jamais écrasé : il reste visible et une anomalie est affichée dans Visibilité. Les données historiques de 2026 sont conservées.

Une fois les résultats publiés, le résumé statistique est préparé. La disponibilité de la clé IA n’a aucune incidence sur les résultats, le classement ou les statistiques. Un échec IA relance uniquement la sélection éditoriale, toutes les cinq minutes pendant 48 heures. Les anciens états `READY` de la préparation privée passent aussi par la publication : ils ne peuvent pas court-circuiter cette étape.

Le statut dans Visibilité indique l’activité de publication, la prochaine soirée et les attentes. Le partage WhatsApp et le bloc Facebook conservent leur fonctionnement : aucun message n’est envoyé automatiquement sur les réseaux sociaux.

### Déploiement

1. Pour une installation initiale, appliquer `supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql` avant le code (migration additive : colonnes First 9, date de rencontre, audit privé et fonction serveur).
   Appliquer ensuite `supabase/migrations/20260930180153_interclub_evening_schedule.sql` pour autoriser la publication dès 22 h (également requis sur une installation existante).
2. Vérifier/adopter la J1 existante avec le collecteur et `publish_collected`, sans nouvelle rencontre ni doublon.
3. Reconstruire et démarrer `backend frontend interclub-analysis`. Ils partagent `/var/lib/974darts/backend-data`, accessible à l’UID 10001.
4. Vérifier le fichier `interclub_analysis.json` : `publication_enabled: true`, `last_check_at` récent ; surveiller les entrées `published_result_id` après les rencontres.

Aucun ajout de clé IA n’est requis pour cette automatisation. Pour la sélection éditoriale IA seulement, utiliser la même configuration OpenAI sur `backend` et `interclub-analysis`, puis recréer ces deux services après changement de clé.

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

Après ajout/modification d’une variable, recréer le conteneur backend via Compose. Le code nécessite aussi la reconstruction du frontend. La migration de publication ci-dessus doit précéder cette version. La configuration Caddy est conservée.

## Contrôles

- Accès au proxy réservé à l’administrateur autorisé ; contrôle de l’origine sur POST ; UUID et taille de requête validés.
- API interne protégée par le jeton serveur ; réponse privée sans cache navigateur.
- Tests métier : calcul pondéré, résultat incohérent, détail incomplet, données non publiées, saison inactive, absence/échec IA, cache invalidé et contrat Responses.
- Tests transactionnels isolés : rollback après échec final, rôles publics refusés, horaire, données incomplètes, idempotence, adoption J1, cumuls de deux rencontres et historique inchangé.
- Essai sur les données J1 du 28/09/2026 : 17–3, 20 matchs, 45 legs, 10 joueurs, moyenne Emmanuel 50,82, finish 88, un 180 de Yoann.
- Test navigateur isolé : partage intercepté, conservation des modifications, version Facebook, copie, refus utilisateur non autorisé/CSRF et affichage mobile. Aucun message envoyé.

## Références techniques

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-5-mini
- https://faq.whatsapp.com/425247423114725/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/groups

### Correction contrôlée de J1 3BDC du 30 septembre 2026

Pour la source `t_1hPp_2294` uniquement, après clôture manuelle du Double 3, les agrégats Nakka peuvent omettre les données de score de sa deuxième manche ou de ses deux manches tout en comptant les participations. Le collecteur accepte ce cas seulement si tous les écarts individuels et collectifs correspondent exactement aux volées de ces manches. Les compteurs de legs, les résultats, les identités et les autres contrôles restent obligatoires. La publication utilise toutes les volées, avec une trace `source_reconciliation` conservant les agrégats d’origine et les manches absentes des totaux de score Nakka. Aucun autre événement ne bénéficie de cette exception.
