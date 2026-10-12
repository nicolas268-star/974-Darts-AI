# BDC — Analyse des partenaires

Vue intégrée : `/tournaments/blind-draw-championship/partenaires`.
Accessible depuis la navigation BDC, le classement individuel, la fiche M1 et les profils généraux dont l’identité possède déjà une correspondance exacte validée.

## Diagnostic des sources

La saison sportive 2026–2027 est rattachée à **2027**, même pour les soirées de septembre et octobre 2026. `BDC_RESULTS` fournit les identifiants joueurs stables et les associations de chaque manche. L’identité d’une paire est la sérialisation de ses deux identifiants triés ; les IDs de doublettes temporaires ne sont pas des IDs de paires.

- **M1** : 32 résultats corrigés ; 31 feuilles individuelles disponibles, dont trois incomplètes ; une feuille absente. Le statut `partial-individual` décrit une feuille localement complète, dans une manche globalement partielle. `partial-individual-incomplete` signale les legs manquants. Les scores de poule sont des legs ; ceux de phase finale sont des **sets**. Le moteur utilise les résultats corrigés du fichier de détails, jamais les résumés Nakka interrompus.
- **M2** : 25 matchs, 64 legs et 14 joueurs audités. Les statistiques individuelles du fichier local ont été attribuées selon les `oid` de l’ordre Nakka propre à chaque leg. L’adaptateur relie leurs IDs locaux aux IDs canoniques, avec les correspondances exactes validées et un contrôle de l’appartenance à la doublette. Les correspondances Stéphane/Abrousse et Mario/Super Mario sont conservées. Le titre de la doublette ne sert pas à attribuer les lancers.
- Les **points M2 sont provisoires**, sous réserve du directeur sportif ; les statistiques M2 sont vérifiées. Ces statuts sont séparés.
- Les agrégats locaux donnent points, fléchettes, First 9 individuels, catégories exclusives de grosses volées, tours sans score et finishes attribués. Ils ne conservent pas le nombre réel de volées, les tentatives de double ni les séquences de volées. Les fréquences par 100 volées, le checkout % et l’analyse après une volée du partenaire restent donc indisponibles.

Les clubs/équipes 2027 proviennent du roster officiel, via les aliases BDC déjà validés dans `tournament-records.ts`. Une ressemblance avec un prénom ne crée pas une nouvelle identité. Les participants non reliés gardent une affiliation non renseignée.

## Périmètre et calculs

Les poules sont le choix initial, afin d’éviter d’ajouter des rencontres finales uniquement aux associations qualifiées. Les autres vues sont toutes les phases et phase finale. Les filtres de saison, manches et phase s’appliquent aux résultats, statistiques, couverture, références, graphiques et observations. Places finales et points restent le contexte de la manche entière.

- Moyenne individuelle : `3 × Σ points / Σ fléchettes`.
- Moyenne duo : `3 × (Σ points A + Σ points B) / (Σ fléchettes A + Σ fléchettes B)`, sur les mêmes feuilles disponibles pour les deux membres.
- First 9 : `3 × Σ first9Score / Σ first9Darts`, distinct du First 9 brut Nakka du duo.
- Total 100+ : somme unique des catégories **100–139, 140–169, 170–179 et 180**.
- Contribution : part des points individuels dans le duo ; la part des fléchettes et la part des finishes connus sont distinctes.
- Dispersion des moyennes par match : écart-type pondéré par les fléchettes, uniquement avec au moins trois matchs complets. Les matchs incomplets sont exclus de cet indicateur.
- Référence : moyenne pondérée avec les autres partenaires BDC, en excluant toute la paire analysée, sous les mêmes filtres. La référence du partenaire suit la même règle. Pas de repli sur le championnat ou le tournoi.
- Taux de résultats : sommes des victoires et matchs/legs, puis ratio. Si les sets ou les scores absents empêchent une comparaison commune en legs, le critère passe explicitement aux victoires en matchs.

La précision est conservée jusqu’à l’affichage. Un dénominateur nul donne `null` ; une donnée absente ne devient pas zéro. Les indicateurs gardent leurs IDs de matchs sources, volumes disponibles et matchs manquants. Les synthèses sont françaises, déterministes et testables. Les ex æquo restent ex æquo. Une association unique n’est jamais déclarée meilleure.

## Nicolas — Jeff / Laurent : contrôle manuel de référence

Lien à partager :
`/tournaments/blind-draw-championship/partenaires?player=nicolas-pdc&season=2027&rounds=1,2&phase=pool&left=jeff-tdc&right=laurent-bdc`.

| Poules M1 + M2 | Avec Jeff | Avec Laurent |
|---|---:|---:|
| Soirées ensemble | 1 | 1 |
| Matchs | 7 | 6 |
| Victoires / défaites | 2 / 5 | 2 / 4 |
| Legs gagnés / joués, résultats corrigés | 5 / 17 | 5 / 14 |
| Taux de legs gagnés | 29,41 % | 35,71 % |
| Matchs couverts / complets | 7 / 6 | 6 / 6 |
| Points / fléchettes Nicolas | 4 005 / 283 | 3 710 / 266 |
| Moyenne Nicolas | 42,46 | 41,84 |
| First 9 Nicolas | 48,31 | 49,67 |
| Moyenne collective | 40,16 | 38,67 |
| Finishes Nicolas enregistrés | 3 | 2 |

Les meilleurs résultats observés ressortent avec Laurent ; le meilleur rendement individuel et scoring collectif avec Jeff, sur les données présentes. L’écart individuel est **+0,61** avec Jeff par rapport à Laurent. Il ne prouve pas un effet du partenaire. L’incident M1, la forme du jour, les adversaires et le format limitent la comparaison. Une soirée par paire ne démontre pas une compatibilité durable.

## Architecture et maintenance

`lib/bdc-partners/types.ts` définit les contrats. `sources.ts` normalise les sélections auditées, vérifie les identités et évite les doubles imports. Le moteur et les observations sont indépendants de React. La vue dédiée consomme leurs résultats et expose les feuilles utilisées. Une prochaine manche s’ajoute au registre de sources après audit, avec ses résultats dans les conventions existantes, sans nouveau composant spécifique.

Les paramètres URL `player`, `season`, `rounds`, `phase`, `left`, `right` conservent la sélection et la comparaison. L’interface utilise tableau sur ordinateur, cartes sur téléphone, libellés textuels et disclosures accessibles au clavier. M1 n’a pas de timestamps locaux : aucun ordre chronologique n’est inventé. M2 peut afficher une évolution quand l’ordre est effectivement connu.

Ce module de consultation n’écrit pas en base et ne modifie ni les règles BDC, ni le championnat, ni le MVP, ni les jeux ou l’autoscoring.

## Vérification

Depuis `app/frontend` :

```sh
npm run test:bdc
npm run test:bdc:browser
npm test
npm run build
```

Le test navigateur accepte `PLAYWRIGHT_MODULE_PATH` et `CHROMIUM_EXECUTABLE_PATH` comme les autres scripts de contrôle du dépôt. Il vérifie les URL partagées, changements de filtre, états vides/invalide, clavier, absence d’erreurs et débordements à 320/390/430 px. Les captures et logs sont des résultats de contrôle temporaires, sans données privées.

Validation effectuée sur la branche `feat/bdc-partner-analysis` : `npm test` (suite complète, dont les BDC existants et nouveaux), tests BDC relancés après revue, TypeScript, lint ciblé sans avertissement et build de production réussis. Le navigateur Chromium headless a validé 11 blocs : paramètres partagés/rechargement, inversion A/B, trois conclusions réelles, filtres de phase et de manche, sets, identifiant invalide, états vides, clavier, responsive 320/390/430/1440 px, détails dépliés, évolution M2 uniquement et liens depuis BDC/M1. Aucune erreur JavaScript ou console dans le contexte de test avec l’opt-out audience natif activé.
