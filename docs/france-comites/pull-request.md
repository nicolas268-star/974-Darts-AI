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

## Validation

- Compilation backend réussie.
- 33 tests spécifiques au moteur ; 241 tests backend compatibles Windows réussis au total.
- 41 contrôles PostgreSQL du nouveau périmètre réussis dans PGlite.
- 51 contrôles de classement existants et 65 contrôles de fiches de tournois existants réussis.
- Dry-run : fichier SQLite inchangé octet pour octet ; `git diff --check` réussi.
- Les deux modules backend existants dépendant de `fcntl` et les scripts Interclubs appelant `python3` nécessitent Linux ; la CI complète les vérifie.

## Limites et déploiement

La migration n'est appliquée à aucun Supabase partagé ; son exécution et ses permissions ont été vérifiées dans PostgreSQL isolé. Aucun déploiement de production, aucune activation de planification et aucune interface publique nationale. Les preuves de rattachement doivent encore être contrôlées et validées avant publication. Les snapshots bruts restent dans la base locale ignorée par Git ; l'export versionné contient les métadonnées utiles à la revue, sans données de joueurs.

Documentation : `docs/france-comites/README.md`, `audit-architecture.md`, `inventaire-initial.md`, `exploitation.md`, `bilan-validation.md`, `phase-2.md`.
