
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT

if len(sys.argv) > 1:
    PROJECT = Path(sys.argv[1]).resolve()

publisher = PROJECT / "backend" / "app" / "publisher.py"
main = PROJECT / "backend" / "app" / "main.py"

if not publisher.exists():
    raise SystemExit(
        "ERREUR : backend/app/publisher.py introuvable.\n"
        "Copie les fichiers du patch à la racine du projet v0.8, "
        "au même niveau que package.json, puis relance."
    )

text = publisher.read_text(encoding="utf-8")

old = '''            leg_data = (
                self.db.table("legs")
                .select("id,natural_key")
                .eq("import_id", import_id)
                .execute()
            ).data
            leg_ids = {row["natural_key"]: row["id"] for row in leg_data}
'''

new = '''            # Supabase/PostgREST limite souvent les réponses à 1 000 lignes.
            # Le championnat contient plus de 1 000 legs : pagination obligatoire.
            leg_data: list[dict] = []
            page_size = 1000
            offset = 0

            while True:
                page = (
                    self.db.table("legs")
                    .select("id,natural_key")
                    .eq("import_id", import_id)
                    .range(offset, offset + page_size - 1)
                    .execute()
                ).data or []

                leg_data.extend(page)

                if len(page) < page_size:
                    break

                offset += page_size

            leg_ids = {row["natural_key"]: row["id"] for row in leg_data}

            missing_leg_keys = [
                row["natural_key"]
                for row in leg_rows
                if row["natural_key"] not in leg_ids
            ]
            if missing_leg_keys:
                raise RuntimeError(
                    f"{len(missing_leg_keys)} legs publiés sont introuvables après pagination. "
                    f"Premier leg manquant : {missing_leg_keys[0]}"
                )
'''

if old not in text:
    if "page_size = 1000" in text:
        print("Correctif pagination déjà appliqué.")
    else:
        raise SystemExit(
            "ERREUR : bloc attendu introuvable dans publisher.py. "
            "Le fichier ne correspond peut-être pas à la v0.8."
        )
else:
    publisher.write_text(text.replace(old, new), encoding="utf-8")
    print("Pagination des legs appliquée.")

if main.exists():
    main_text = main.read_text(encoding="utf-8")
    old_main = '''    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Publication failed: {exc}") from exc
'''
    new_main = '''    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Publication failed: {type(exc).__name__}: {exc}"
        ) from exc
'''
    if old_main in main_text:
        main.write_text(main_text.replace(old_main, new_main), encoding="utf-8")
        print("Journal détaillé FastAPI activé.")
    elif "traceback.print_exc()" in main_text:
        print("Journal détaillé déjà activé.")
    else:
        print("Avertissement : bloc de journal FastAPI non modifié.")

print()
print("PATCH V0.8.1 APPLIQUE AVEC SUCCES")
print("Redémarre FastAPI puis republie le même fichier.")
