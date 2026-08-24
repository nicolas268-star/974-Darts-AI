from app.services.tournament_watch_service import _classify, _extract_date, _plain_text


def test_extracts_french_named_date():
    assert _extract_date("Tournoi le 28 août 2026 au club") == "2026-08-28"


def test_extracts_numeric_date():
    assert _extract_date("Open de fléchettes 07/09/2026") == "2026-09-07"


def test_html_is_reduced_to_visible_text():
    assert "Tournoi" in _plain_text("<h1>Tournoi</h1><script>secret</script>")
    assert "secret" not in _plain_text("<h1>Tournoi</h1><script>secret</script>")


def test_missing_date_is_not_sent_to_validation_queue():
    item = _classify({"status": "PENDING", "title": "Navigation du club"})
    assert item["status"] == "INSUFFICIENT"
