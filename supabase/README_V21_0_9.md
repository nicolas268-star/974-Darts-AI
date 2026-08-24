# Supabase — état attendu V21.0.9

Projet production : `974 Darts AI` (`vkvdyrsrvbyugbjlmknb`, eu-west-3).

La base de production a été contrôlée le 24/08/2026 :
- moteur X01 présent ;
- format multijoueur présent (`play_format`, `side`, `winner_side`) ;
- sessions multi-appareils présentes (`session_code`, `live_game_members`) ;
- rôles `HOST`, `SCORER`, `SPECTATOR` présents ;
- fonctions d'accès/scoring et `join_live_game_session(text,text)` présentes.

Les SQL de ce dossier sont conservés comme trace de release. Ne pas les réexécuter aveuglément sur la production déjà alignée.
