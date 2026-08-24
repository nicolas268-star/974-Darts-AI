import json

from app.services import player_transfer_service
from app.services.player_transfer_service import affiliations_from_current, player_directory

class Response:
    def __init__(self, data): self.data = data
class Query:
    def __init__(self, data): self.data = data
    def select(self, _fields): return self
    def execute(self): return Response(self.data)
class Database:
    rows = {
        "players": [{"id": "alex", "display_name": "Alex", "team_id": "fournaise"}],
        "teams": [{"id": "fournaise", "name": "PDC Fournaise", "club_id": "pdc"}],
        "clubs": [{"id": "pdc", "name": "Papangue Darts Club"}],
    }
    def table(self, name): return Query(self.rows[name])

def test_player_directory_resolves_team_and_club():
    assert player_directory(Database()) == [{"id": "alex", "name": "Alex", "team": "PDC Fournaise", "club": "Papangue Darts Club"}]

def test_current_affiliation_exists_without_transfer():
    payload = affiliations_from_current("new-player", "Joueur", "Equipe A", "Club A")
    assert payload["current"]["team"] == "Equipe A"
    assert payload["current"]["club"] == "Club A"

def test_scheduled_transfer_is_found_when_profile_id_differs(tmp_path, monkeypatch):
    state_path = tmp_path / "player_transfers.json"
    state_path.write_text(json.dumps({"version": 1, "transfers": [{
        "id": "transfer-alex",
        "player_id": "database-uuid-alex",
        "player_name": "Alex",
        "from_team": "PDC Fournaise",
        "from_club": "Papangue Darts Club",
        "target_team": "PDC A",
        "target_club": "Papangue Darts Club",
        "effective_date": "2099-09-01",
        "cancelled_at": None,
    }]}), encoding="utf-8")
    monkeypatch.setattr(player_transfer_service, "STATE_PATH", state_path)

    payload = affiliations_from_current(
        "profile-slug-alex", "ALEX", "PDC Fournaise", "Papangue Darts Club"
    )

    assert payload["upcoming"] == [{
        "transfer_id": "transfer-alex",
        "club": "Papangue Darts Club",
        "team": "PDC A",
        "effective_date": "2099-09-01",
        "note": None,
    }]
