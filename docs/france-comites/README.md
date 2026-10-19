# Comités France — phase 1

Le moteur et les écrans publics/administrateur sont implémentés. La collecte publique a été exécutée et les sources restent distinctes des points, classements et résultats sportifs existants. Le déploiement de production demandé est préparé dans [la procédure dédiée](deploiement.md) ; son exécution et sa vérification HTTPS doivent être consignées avant d'annoncer une mise en ligne. La synchronisation planifiée reste désactivée.

## Résultat réel du 19 octobre 2026

- 26 identités de comités relevées dans l'[annuaire officiel FFD](https://www.ffdarts.fr/ffd-comites/), avec référence et date de vérification.
- 13 ligues N01 observées et 262 compétitions publiques collectées, dont certaines ne sont pas françaises : les résultats sans preuve de périmètre sont présentés séparément.
- 31 pistes d'association à examiner : 10 pour Aquitaine Nord et 21 pour Aquitaine Sud.
- **0 rattachement compétition/comité confirmé** : aucune source externe contrôlée ne justifie encore de certifier l'organisateur exact de ces compétitions. Une concordance de nom ne constitue pas une preuve suffisante.
- Fenêtre réelle : du 1er janvier 2025 au 31 août 2027 inclus. La saison 2026–2027 contient 76 observations ; le périmètre n'est pas exhaustif.
- Découverte terminée après reprise : 50 pages, 328 requêtes ; enrichissement des 31 candidats : 170 requêtes, après traitement d'une erreur normale d'absence de poules.

Les organismes attestés sans compétition N01 attribuée ne sont pas présentés comme ayant une présence N01 confirmée. Les données administratives territoriales restent vides sans preuve explicite de leur ressort ; les rattachements aux ligues sportives sont distincts.

## Livrables

| Document | Contenu |
|---|---|
| [Audit de l'architecture](audit-architecture.md) | Services existants, réutilisation et frontières avec les données officielles. |
| [Inventaire lisible](inventaire-initial.md) | Périmètre exécuté, organismes, propositions et observations non attribuées. |
| [Export CSV](inventaire-initial.csv) | Une ligne par association candidate ou observation, plus organismes sans compétition. |
| [Métadonnées portables](inventaire-metadata.json) | Référentiel, ligues, compétitions et checkpoints réellement collectés ; aucun résultat brut ni identité de joueur. |
| [Catalogue de sources](catalogue-sources.json) | Organismes documentés et deux ligues candidates, sans associations certifiées. |
| [Vérification des endpoints](verification-endpoints.json) | Neuf appels anonymes réels, paramètres et statuts. |
| [Vérification des ligues Aquitaine](verification-ligues-aquitaine.json) | Identifiants, titres et URLs officiels réellement observés. |
| [Exploitation](exploitation.md) | Commandes, reprise, dry-run, validation, corrections et Supabase. |
| [Interface](phase-2.md) | Contrats implémentés pour `/comites/france` et l'administration, puis évolutions restantes. |
| [Déploiement](deploiement.md) | Promotion des sources réelles, contrôles, sauvegarde et retour arrière applicatif. |
| [Bilan de validation](bilan-validation.md) | Tests, limites de l'environnement et fichiers livrés. |

Les snapshots bruts publics, leurs hashes et les journaux privés sont conservés dans `app/backend/data/france-inventory.sqlite`, ignoré par Git. Le JSON portable suffit à régénérer le rapport avec `write_report`; il ne remplace pas la base de synchronisation privée contenant les sources complètes.
