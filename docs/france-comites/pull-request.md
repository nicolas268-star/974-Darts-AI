## Problème et résultat

Le radar Nakka existant est centré sur La Réunion et ne fournit pas de référentiel national d'organisateurs avec preuves. Cette phase ajoute la découverte publique N01 et un inventaire indépendant, sans écrire dans les points officiels, MVP 2027, résultats Interclubs, identités de joueurs ou historiques existants.

L'exploration réelle du 1er janvier 2025 au 31 août 2027 a terminé après reprise : 262 observations publiques, 13 ligues et 26 identités de comités documentées dans l'annuaire FFD. 31 associations restent à valider (10 Aquitaine Nord, 21 Aquitaine Sud). **Aucune association n'est certifiée ni publiée sur la seule base d'un nom : zéro rattachement confirmé.** Les observations dont l'origine française n'est pas établie sont présentées séparément ; la couverture n'est pas exhaustive.

## Implémentation

- Adaptateur officiel anonyme N01 : neuf endpoints vérifiés réellement, pagination, filtres UTC, temporisation, retries HTTP 429/Retry-After, enveloppes d'erreurs HTTP/applicatives.
- Service de découverte et mise à jour avec reprises par page/élément, budgets, dry-run en mémoire, sources et résultats JSON publics conservés en privé. Réutilisation de la normalisation du radar existant ; aucun second chemin de publication sportive.
- Sept tables `france_*`, RPC transactionnelle réservée au service, RLS publique limitée aux organismes et associations validés, journal immuable, corrections manuelles conservées, retrait des sources privées/inaccessibles.
- CLI de catalogue, validation, corrections, synchronisation et rapport ; SQLite local pour l'exécution sans accès Supabase cible.
- Inventaires Markdown/CSV/JSON réels, catalogue et vérification des sources, audit d'architecture, exploitation et proposition technique `/comites/france`.
- Tests et intégration CI ; service/timer fournis uniquement comme exemples désactivés.
- Annuaire `/comites/france`, fiches d'organismes et lien de navigation, avec recherche, filtre de ligue sportive, pagination et compteurs limités aux associations confirmées.
- Administration privée `/admin/comites-france` : propositions, observations, organismes, imports et décisions auditées. Route serveur avec session administrateur unique, contrôle d'origine, taille bornée et preuve ciblée obligatoire avant publication ; clé service dans un module `server-only`.
- Promotion initiale idempotente des vraies sources locales, sans recopier les décisions d'association locales, et script de déploiement dédié avec sauvegarde des images, contrôle des résultats sportifs et retour arrière applicatif.

## Validation

- Compilation backend réussie.
- 34 tests spécifiques au moteur, dont promotion idempotente et préservation des décisions de la cible ; 241 tests backend compatibles Windows réussis lors de la première phase.
- 41 contrôles PostgreSQL du nouveau périmètre réussis dans PGlite.
- 51 contrôles de classement existants et 65 contrôles de fiches de tournois existants réussis.
- Dry-run : fichier SQLite inchangé octet pour octet ; `git diff --check` réussi.
- Build Next.js de production, TypeScript et tests frontend France réussis : filtres publics, projection de données, URLs, états vides, accès administrateur, CSRF, limite de taille, preuve et acteur vérifié côté serveur.
- Promotion hors ligne de la base réelle : 26 organismes, 13 ligues, 262 observations, 31 propositions et 2 runs ; seconde exécution sans écriture et aucun rattachement publié.
- Parcours navigateur France réussis avec Next.js et PostgreSQL isolé : recherche, pagination, confidentialité, accès protégé, rejet et validation avec preuve, publication ciblée, onglets et largeurs de 320 à 1 440 px.
- Les deux modules backend existants dépendant de `fcntl` et les scripts Interclubs appelant `python3` nécessitent Linux ; la CI complète les vérifie.

## Limites et déploiement

La migration et ses permissions sont vérifiées dans PostgreSQL isolé. La mise en production est demandée et sa procédure est documentée dans `docs/france-comites/deploiement.md` ; le compte rendu d'exécution doit confirmer la migration cible, les images et les contrôles HTTPS. Les 31 preuves de rattachement restent à contrôler avant publication des compétitions. La planification reste désactivée. Les snapshots bruts restent privés ; l'export versionné contient les métadonnées utiles à la revue, sans données de joueurs.

Documentation : `docs/france-comites/README.md`, `audit-architecture.md`, `inventaire-initial.md`, `exploitation.md`, `bilan-validation.md`, `phase-2.md`.
