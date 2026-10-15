"""Organiser-provided context, kept separate from calculated match statistics."""
import hashlib
import os
from pathlib import Path
import tempfile

CONTEXT_LIMIT = 1600
J2_CONTEXT = (
    "Côté Ambrée, saluons la belle prestation de Benoit BRUNET, habituellement joueur de "
    "l’équipe B (Brune), venu exceptionnellement renforcer l’équipe A (Ambrée) pour cette rencontre. "
    "Merci à lui d’avoir répondu présent !\n\n"
    "Une bonne ambiance entre les deux équipes a accompagné cette soirée. "
    "Un petit souci technique avec Nakka a occasionné un léger retard."
)


def _path(result_id):
    root = Path(os.getenv("VISIBILITY_CACHE_DIR", "/app/data/visibility")) / "context"
    return root / (hashlib.sha256(str(result_id).encode()).hexdigest() + ".txt")


def load_context(evening):
    path = _path(evening["result_id"])
    if path.exists():
        return path.read_text(encoding="utf-8")
    # This testimony is confirmed for this encounter only, never inferred from a score.
    if (evening.get("source_url") == "https://n01darts.com/n01/league/season.php?id=t_uAfU_5679"
            and evening["season"] == "2026-2027" and evening["round"] == "J2"
            and evening["date"] == "14/10/2026"):
        return J2_CONTEXT
    return ""


def save_context(result_id, text):
    if not isinstance(text, str) or len(text) > CONTEXT_LIMIT:
        raise ValueError("Le contexte doit contenir au maximum 1 600 caractères.")
    path = _path(result_id)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".context-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text.strip())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)
