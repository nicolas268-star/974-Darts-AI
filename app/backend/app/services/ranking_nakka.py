"""Bounded private collector. The connection is pinned to a checked public IP."""

from __future__ import annotations
import http.client
import ipaddress
import json
import socket
import ssl
import time
from urllib.parse import urlsplit
from app.services.nakka_direct_import import (
    analyze_direct_event,
    NakkaDirectImportError,
)

HOST = "tk2-228-23746.vs.sakura.ne.jp"
PATHS = {"/n01/tournament/n01_tournament.php", "/n01/tournament/n01_stats_t.php"}
MAX_BYTES = 2 * 1024 * 1024


def checked_addresses(host: str) -> list[str]:
    addresses = list(
        dict.fromkeys(
            row[4][0] for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        )
    )
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise ValueError("Destination réseau interdite.")
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, address: str, timeout: float):
        super().__init__(HOST, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=HOST)
        except BaseException:
            raw.close()
            raise


def collect_private(source_url: str, season: int) -> dict:
    deadline = time.monotonic() + 45

    def fetch(url: str, method: str = "GET"):
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname != HOST
            or parsed.port not in (None, 443)
            or parsed.username
            or parsed.password
            or parsed.path not in PATHS
            or method not in {"GET", "POST"}
        ):
            raise ValueError("Destination Nakka interdite.")
        addresses = checked_addresses(HOST)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Collecte expirée.")
        connection = PinnedHTTPSConnection(addresses[0], min(10, remaining))
        try:
            connection.request(
                method,
                parsed.path + "?" + parsed.query,
                body=b"" if method == "POST" else None,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "identity",
                    "User-Agent": "974Darts-ranking/1",
                },
            )
            response = connection.getresponse()
            if (
                response.status != 200
                or response.getheader("Content-Encoding", "identity") != "identity"
            ):
                raise ValueError("Réponse ou redirection Nakka refusée.")
            chunks = bytearray()
            while True:
                if time.monotonic() >= deadline:
                    raise TimeoutError("Collecte expirée.")
                chunk = response.read(min(65536, MAX_BYTES + 1 - len(chunks)))
                chunks.extend(chunk)
                if len(chunks) > MAX_BYTES:
                    raise ValueError("Réponse Nakka trop volumineuse.")
                if not chunk:
                    break
            return json.loads(chunks.decode("utf-8"))
        finally:
            connection.close()

    try:
        return analyze_direct_event(
            source_url, season, persist=False, request_json=fetch
        )
    except Exception as exc:
        raise NakkaDirectImportError(
            "Collecte Nakka impossible ou incomplète. Réessayer après vérification de la source."
        ) from exc
