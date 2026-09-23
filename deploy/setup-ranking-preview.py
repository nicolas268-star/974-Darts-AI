#!/usr/bin/env python3
"""Provision this project's isolated preview from the VPS. No invitations or SMTP."""
import base64
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile
from urllib.error import HTTPError, URLError
from urllib.request import Request, HTTPRedirectHandler, build_opener
from uuid import UUID

PROJECT = "yndxyiaclzcfyqrxdxdo"
URL = "https://" + PROJECT + ".supabase.co"
DIRECTORY = Path("/etc/974darts")


class SetupError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SetupError("Redirection refusée ; aucune clé transmise à une autre adresse.")


def validate_key(key, role):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{20,4096}", key):
        raise SetupError("Format de clé invalide.")
    prefix = "sb_publishable_" if role == "anon" else "sb_secret_"
    if key.startswith(prefix):
        return key
    try:
        payload = key.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, IndexError, UnicodeError):
        raise SetupError("Type de clé incorrect : publique puis serveur attendues.") from None
    if claims.get("ref") != PROJECT or claims.get("role") != role:
        raise SetupError("Cette clé ne correspond pas au projet de préproduction et au rôle attendu.")
    # This is a sanity check only. The fixed project's API verifies the key next.
    return key


def api(key, path, method="GET", body=None, token=None):
    if not path.startswith(("/rest/v1/", "/auth/v1/")):
        raise SetupError("Chemin API refusé.")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token or not key.startswith("sb_"):
        headers["Authorization"] = "Bearer " + (token or key)
    if method == "POST" and path.startswith("/rest/v1/"):
        headers["Prefer"] = "resolution=ignore-duplicates,return=representation"
    request = Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                      headers=headers, method=method)
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            content = response.read(1_048_577)
            if len(content) > 1_048_576:
                raise SetupError("Réponse API trop volumineuse.")
            return json.loads(content) if content else None
    except HTTPError as error:
        # Never print response bodies, headers, request bodies, tokens or keys.
        raise SetupError(f"Étape {path.split('?')[0]} refusée (HTTP {error.code}).") from None
    except (URLError, TimeoutError, ValueError):
        raise SetupError("Connexion au projet de préproduction indisponible ou réponse invalide.") from None


def private_file(path):
    if path.is_symlink():
        raise SetupError("Lien symbolique refusé pour la configuration privée.")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise SetupError("Le fichier existant doit appartenir à root et être en permissions 600.")


def write_private(path, content, replace=False):
    if replace:
        private_file(path)
        fd, temporary = tempfile.mkstemp(prefix=".ranking-preview-", dir=path.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    else:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())


def prepare(directory, public_key, server_key, call=api):
    validate_key(public_key, "anon")
    validate_key(server_key, "service_role")
    env_path = directory / "ranking-preview.env"
    state_path = directory / "ranking-preview-access.json"
    # No operation is allowed against production, and existing config is preserved.
    if env_path.exists() or env_path.is_symlink():
        raise SetupError("ranking-preview.env existe déjà : configuration conservée, aucun changement.")
    if state_path.exists() or state_path.is_symlink():
        private_file(state_path)
        state = json.loads(state_path.read_text())
        if state.get("project") != PROJECT or state.get("purpose") != "ranking-preview-test-accounts-v1":
            raise SetupError("Le fichier de reprise ne correspond pas à cette préproduction.")
    else:
        suffix = secrets.token_hex(6)
        state = {"project": PROJECT, "purpose": "ranking-preview-test-accounts-v1", "accounts": [
            {"role": "ADMIN", "name": "Administrateur de recette", "email": f"admin-{suffix}@974darts.invalid", "password": secrets.token_urlsafe(32)},
            {"role": "SPORTS_DIRECTOR", "name": "Directeur sportif de recette", "email": f"ds-{suffix}@974darts.invalid", "password": secrets.token_urlsafe(32)},
        ]}
    expected_roles = ["ADMIN", "SPORTS_DIRECTOR"]
    if [a.get("role") for a in state.get("accounts", [])] != expected_roles:
        raise SetupError("Fichier de reprise invalide.")
    if any(not re.fullmatch(r"(?:admin|ds)-[a-f0-9]{12}@974darts\.invalid", a.get("email", ""))
           or len(a.get("password", "")) < 32 for a in state["accounts"]):
        raise SetupError("Identifiants de recette invalides.")
    # Read-only verification before any local credential or remote account creation.
    call(public_key, "/auth/v1/settings")
    config = call(server_key, "/rest/v1/ranking_workflow_config?select=administrator_id")
    profiles = call(server_key, "/rest/v1/profiles?select=user_id,role")
    known_ids = {a.get("id") for a in state["accounts"] if a.get("id")}
    if any(p["user_id"] not in known_ids for p in profiles) or any(c["administrator_id"] not in known_ids for c in config):
        raise SetupError("Des profils existent déjà hors de cette préparation ; vérification manuelle nécessaire.")
    users = call(server_key, "/auth/v1/admin/users?page=1&per_page=1000").get("users", [])
    if len(users) >= 1000:
        raise SetupError("Trop de comptes pour cette préparation isolée.")
    if not state_path.exists():
        write_private(state_path, json.dumps(state, indent=2) + "\n")
    for account in state["accounts"]:
        matches = [u for u in users if u.get("email") == account["email"]]
        if len(matches) > 1:
            raise SetupError("Plusieurs comptes correspondent à un compte de recette.")
        if matches:
            user = matches[0]
        elif account.get("id"):
            raise SetupError("Un compte de recette enregistré a été supprimé ; aucune recréation automatique.")
        else:
            user = call(server_key, "/auth/v1/admin/users", "POST", {
                "email": account["email"], "password": account["password"], "email_confirm": True,
                "user_metadata": {"display_name": account["name"], "purpose": "ranking-preview-test"},
            })
        user_id = str(UUID(user["id"]))
        if account.get("id") and account["id"] != user_id:
            raise SetupError("Le compte a changé ; vérification manuelle nécessaire.")
        # The stored password proves ownership if execution stopped after create_user.
        session = call(public_key, "/auth/v1/token?grant_type=password", "POST", {
            "email": account["email"], "password": account["password"],
        })
        token = session["access_token"]
        try:
            if session["user"]["id"] != user_id:
                raise SetupError("Identité Auth inattendue.")
            account["id"] = user_id
            write_private(state_path, json.dumps(state, indent=2) + "\n", replace=True)
            call(server_key, "/rest/v1/profiles?on_conflict=user_id", "POST", {
                "user_id": user_id, "role": account["role"], "display_name": account["name"],
            })
            own = call(public_key, "/rest/v1/profiles?select=user_id,role", token=token)
            if len(own) != 1 or own[0] != {"user_id": user_id, "role": account["role"]}:
                raise SetupError("Contrôle de connexion et des droits du profil échoué.")
        finally:
            call(public_key, "/auth/v1/logout?scope=local", "POST", token=token)
    admin_id = state["accounts"][0]["id"]
    call(server_key, "/rest/v1/ranking_workflow_config?on_conflict=singleton", "POST", {
        "singleton": True, "administrator_id": admin_id,
    })
    if call(server_key, "/rest/v1/ranking_workflow_config?select=administrator_id") != [{"administrator_id": admin_id}]:
        raise SetupError("Configuration administrateur inattendue ; aucune valeur existante écrasée.")
    env = {
        "SUPABASE_URL": URL, "SUPABASE_SERVICE_ROLE_KEY": server_key,
        "NEXT_PUBLIC_SUPABASE_URL": URL, "NEXT_PUBLIC_SUPABASE_ANON_KEY": public_key,
        "INTERNAL_API_TOKEN": secrets.token_urlsafe(48), "ADMIN_USER_ID": admin_id,
        "RANKING_WORKFLOW_ENABLED": "false", "RANKING_EMAIL_ENABLED": "false",
        "RANKING_PREVIEW_ENV_FILE": str(env_path), "RANKING_PREVIEW_SUPABASE_URL": URL,
        "RANKING_PREVIEW_SUPABASE_ANON_KEY": public_key,
    }
    content = "# Préproduction uniquement. Origine HTTPS à configurer avant démarrage.\n"
    content += "\n".join(f"{key}={value}" for key, value in env.items()) + "\n"
    write_private(env_path, content)


def main():
    if os.geteuid() != 0:
        raise SetupError("Exécuter avec sudo python3 sur le VPS.")
    DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = DIRECTORY.stat()
    if DIRECTORY.is_symlink() or info.st_uid != 0 or info.st_mode & 0o022:
        raise SetupError("Le dossier /etc/974darts doit être détenu par root sans écriture groupe/public.")
    if (DIRECTORY / "ranking-preview.env").exists():
        raise SetupError("Configuration déjà présente : aucun changement.")
    print("Projet : 974 Darts Preview Licencies (" + PROJECT + ")")
    print("Deux comptes de recette seront créés. Aucun email ni démarrage de service.")
    with open("/dev/tty", "w") as terminal:
        public_key = getpass.getpass("Clé publique du projet preview (publishable ou anon) : ", stream=terminal).strip()
        server_key = getpass.getpass("Clé serveur du projet preview (secret ou service_role) : ", stream=terminal).strip()
    prepare(DIRECTORY, public_key, server_key)
    print("Configuration isolée créée : /etc/974darts/ranking-preview.env (600).")
    print("Connexion Auth et profil ADMIN : OK. Connexion Auth et profil DS : OK.")
    print("Identifiants de test conservés sur le VPS : /etc/974darts/ranking-preview-access.json (600).")
    print("Emails désactivés. Aucun service démarré. Origine HTTPS à définir ensuite.")


if __name__ == "__main__":
    try:
        main()
    except (SetupError, OSError, ValueError, KeyError) as error:
        print("Arrêt : " + (str(error) if isinstance(error, SetupError) else "configuration impossible ; aucun secret affiché."))
        raise SystemExit(1) from None
