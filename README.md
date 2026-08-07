<p align="center">
  <img src="./docs/974darts-platform.png"
       alt="974Darts - Data Analytics Platform for traditional darts on Reunion Island"
       width="100%">
</p>

**Continuous Improvement × Data × Automation × Artificial Intelligence**
---

# 🔧 Technical Documentation

The original development documentation is maintained below in French, reflecting the project's development history.

> The section below contains the original technical documentation of the 974Darts development environment.


# 974 Darts AI Web — v0.10 / Sprint 3.1

Cette version publie réellement le championnat dans Supabase via un backend Python FastAPI.

## Fonctionnement

1. Next.js authentifie l'administrateur.
2. Le fichier Excel est transmis au backend FastAPI.
3. FastAPI analyse l'onglet `PvP`.
4. Les lignes T1/T2 sont exclues du championnat.
5. Le bouton **Publier** crée ou met à jour :
   - saisons ;
   - journées ;
   - équipes ;
   - joueurs ;
   - rencontres ;
   - matchs ;
   - legs ;
   - statistiques joueur-leg ;
   - historique d'import ;
   - anomalies.
6. Le SHA-256 du fichier empêche une double publication.

## Mise à niveau depuis la v0.7

1. Décompresser cette version dans un nouveau dossier.
2. Copier l'ancien `.env.local`.
3. Ajouter dans `.env.local` :

```env
PYTHON_API_URL=http://127.0.0.1:8000
INTERNAL_API_TOKEN=UNE_LONGUE_VALEUR_ALEATOIRE
ALLOWED_ORIGIN=http://localhost:3000
```

4. Dans Supabase SQL Editor, exécuter le contenu de :

`supabase/migration_v0_8_publication.sql`

5. Exécuter `INSTALLER_WINDOWS.bat`.
6. Exécuter `LANCER_SITE.bat`.

Deux fenêtres restent ouvertes :
- FastAPI sur le port 8000 ;
- Next.js sur le port 3000.

## Test

- Backend : `http://127.0.0.1:8000/health`
- Site : `http://localhost:3000/admin`

Analyse le classeur, puis clique sur **Publier**.

## Sécurité

- Le navigateur ne connaît jamais la clé secrète Supabase.
- Next.js vérifie le rôle ADMIN.
- Next.js et FastAPI utilisent un token interne.
- FastAPI utilise la clé serveur uniquement dans son processus local.
- Ne partage jamais `.env.local`.
