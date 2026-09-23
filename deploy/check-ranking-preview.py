#!/usr/bin/env python3
"""Read-only VPS readiness report. Never print environment values or credentials."""
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess

PREVIEW_URL = "https://yndxyiaclzcfyqrxdxdo.supabase.co"


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=15)
        return result.stdout.strip() if result.returncode == 0 else "Indisponible"
    except (OSError, subprocess.TimeoutExpired):
        return "Indisponible"


def env_status(path):
    result = {"fichier": str(path), "present": path.is_file()}
    if not result["present"]:
        return result
    try:
        values = {}
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.removeprefix("export ").split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
        result["droits_restreints"] = stat.S_IMODE(path.stat().st_mode) & 0o077 == 0
        result["projet_preview_correct"] = values.get("SUPABASE_URL", "").rstrip("/") == PREVIEW_URL
        result["projet_public_preview_correct"] = values.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/") == PREVIEW_URL
        for key in ("SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "INTERNAL_API_TOKEN", "ADMIN_USER_ID"):
            result[key + "_renseigne"] = bool(values.get(key)) and not values[key].startswith("replace-")
        result["emails_desactives"] = values.get("RANKING_EMAIL_ENABLED", "false").lower() == "false"
    except (OSError, UnicodeError):
        result["lecture"] = "Impossible"
    return result


def report():
    print("Préproduction classement — contrôle en lecture seule")
    print("Version actuelle :", command(["git", "-C", "/opt/974darts/current", "log", "-1", "--format=%h %s"]))
    print("Docker Compose :", command(["docker", "compose", "version", "--short"]))
    print("Conteneurs 974Darts :")
    print(command(["docker", "ps", "-a", "--filter", "name=974", "--format", "table {{.Names}}\t{{.Status}}\t{{.Ports}} "]))
    if shutil.which("ss"):
        listeners = command(["ss", "-ltnH"])
        print("Écoutes sur 3080 / 3100 / 3443 / 443 :")
        print("\n".join(line for line in listeners.splitlines() if re.search(r":(?:3080|3100|3443|443)\s", line)) or "Aucune")
    print("Configuration isolée (présence uniquement, aucune valeur secrète) :")
    for filename in ("/etc/974darts/ranking-preview.env", "/etc/974darts/preview.env"):
        print(json.dumps(env_status(Path(filename)), ensure_ascii=False))
    print("Aucun service démarré, arrêté ou modifié.")


if __name__ == "__main__":
    report()
