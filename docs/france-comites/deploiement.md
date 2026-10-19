# Déploiement Comités France

La mise en production est autorisée par la demande utilisateur du 19 octobre 2026. Ce document décrit la procédure ; il ne constitue pas une attestation de déploiement exécuté.

## Préparation

- PR #95 : tests Linux obligatoires, build Next.js et tests navigateur réussis sur le commit exact avant fusion.
- VPS existant : `ubuntu@137.74.163.25`, checkout `/opt/974darts/current`, projet Compose `darts974`, domaine `974darts.re`.
- Supabase de production : projet `vkvdyrsrvbyugbjlmknb`. Vérifier la correspondance avec l'environnement serveur avant toute promotion ; ne jamais recopier une clé dans le dépôt ou les logs.
- Appliquer uniquement la migration additive `20261019090000_france_discovery.sql` via le processus Supabase de migration, après contrôle des tables et permissions. Aucun `db push` global.
- Sauvegarder la base SQLite locale réelle par l'API `sqlite3.Connection.backup`, calculer son SHA256, la transférer sous `/var/lib/974darts/backend-data/france-inventory-initial.sqlite`, propriétaire `10001:10001`, mode `0600`. Ne pas écraser un fichier distant existant sans comparaison préalable.
- Relever le SHA de production avant sa mise à jour. Préserver les modifications locales du Caddyfile et son inode monté. Si Compose ou Caddy ont changé entre ces commits, le script s'arrête pour inspection.

## Activation

Depuis le checkout de production correspondant au commit fusionné :

```sh
sudo bash deploy/deploy-france-inventory.sh RELEASE_SHA PREVIOUS_SHA INVENTORY_SHA256
```

Le script sauvegarde l'environnement, le proxy, les images effectives et les résultats sportifs publiés dans un répertoire privé `/var/backups/974darts/france-inventory-*`. Il construit uniquement backend et frontend pendant que le site fonctionne. La promotion copie les enregistrements absents, conserve sources brutes et checkpoints, laisse les associations candidates en attente et préserve les décisions déjà présentes sur la cible. Une interruption est reprenable par la même commande.

Après promotion des 26 organismes, 262 observations et 31 propositions, il remplace seulement backend/frontend, vérifie la santé HTTPS, l'annuaire et une fiche réelle. Il compare les empreintes des points historiques et des révisions publiées avant/après. Il ne recrée ni proxy ni workers et n'active aucun timer. Les sauvegardes contenant résultats et sources restent privées.

En cas d'échec après activation, les images précédentes sont restaurées automatiquement si l'environnement est inchangé. Les tables additives France restent présentes ; aucun retour arrière de points, résultats ou données persistantes n'est exécuté. Un échec après promotion mais avant activation peut laisser les données France préparées sous RLS, sans changer l'application active.

## Vérification finale

Vérifier dans le navigateur `/comites/france` sur ordinateur/mobile, une fiche, l'accès refusé à l'administration sans session et le formulaire administrateur. Contrôler avec `anon` et un utilisateur normal que sources, candidats et journaux restent inaccessibles. Consigner SHA déployé, migration, compteurs, URL, santé et chemin de sauvegarde dans le compte rendu d'exécution.
