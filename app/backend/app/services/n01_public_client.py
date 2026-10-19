"""Read-only official N01 API adapter, shared by discovery jobs.

The legacy radar/direct import use a different, undocumented transport. Keep
their publication pipeline unchanged; this adapter never imports sporting data.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LOG = logging.getLogger(__name__)
BASE_URL = "https://push.n01darts.com/api/v1"
ENDPOINTS = frozenset({
    "tournament/list", "tournament/get", "tournament/entry/list",
    "tournament/stats", "tournament/standings", "league/list", "league/get",
    "league/tournament/list", "match/list",
})


class N01Error(RuntimeError):
    def __init__(self, message: str, *, result: int | None = None, http: int | None = None):
        super().__init__(message)
        self.result, self.http = result, http


class N01Client:
    def __init__(self, *, interval: float = 0.75, retries: int = 3, timeout: float = 25,
                 opener: Callable = urlopen, sleep: Callable = time.sleep,
                 clock: Callable = time.monotonic):
        if interval < 0 or retries < 0 or timeout <= 0:
            raise ValueError("Invalid request limits")
        self.interval, self.retries, self.timeout = interval, retries, timeout
        self.open, self.sleep, self.clock = opener, sleep, clock
        self.last_request: float | None = None
        self.requests = 0
        self.trace: list[dict[str, Any]] = []

    def get(self, endpoint: str, **params: Any) -> dict:
        if endpoint not in ENDPOINTS or {"owner", "admin_id", "all"} & params.keys():
            raise ValueError("Only anonymous public read endpoints are allowed")
        query = urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{BASE_URL}/{endpoint}?{query}"
        request = Request(url, headers={"Accept": "application/json",
                          "User-Agent": "974Darts-France-Discovery/1.0 (public inventory)"})
        for attempt in range(self.retries + 1):
            if self.last_request is not None:
                self.sleep(max(0, self.interval - (self.clock() - self.last_request)))
            self.last_request = self.clock()
            self.requests += 1
            try:
                with self.open(request, timeout=self.timeout) as response:
                    data = json.loads(response.read().decode("utf-8"))
                if not isinstance(data, dict) or type(data.get("result")) is not int:
                    raise N01Error("Malformed N01 envelope")
                self.trace.append({"url": url, "http": 200, "result": data["result"],
                                   "at": datetime.now(UTC).isoformat()})
                if data["result"] != 0:
                    raise N01Error(f"N01 {endpoint}: {data.get('error', data['result'])}",
                                   result=data["result"])
                return data
            except HTTPError as exc:
                # N01 also wraps application errors in non-2xx responses (e.g.
                # standings without groups is HTTP 400, result -51).
                application_result, message = None, f"HTTP {exc.code} on {endpoint}"
                try:
                    body = json.loads(exc.read().decode("utf-8"))
                    if isinstance(body, dict) and type(body.get("result")) is int and body["result"] < 0:
                        application_result = body["result"]
                        message += f": {body.get('error', application_result)}"
                except (ValueError, UnicodeError, AttributeError, OSError):
                    pass
                self.trace.append({"url": url, "http": exc.code, "result": application_result,
                                   "at": datetime.now(UTC).isoformat()})
                if exc.code not in {429, 500, 502, 503, 504} or attempt == self.retries:
                    raise N01Error(message, http=exc.code, result=application_result) from exc
                delay = 2 ** attempt
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                if retry_after:
                    try:
                        delay = max(delay, float(retry_after))
                    except ValueError:
                        try:
                            delay = max(delay, (parsedate_to_datetime(retry_after) - datetime.now(UTC)).total_seconds())
                        except (ValueError, TypeError, OverflowError):
                            pass
                LOG.warning("n01_retry endpoint=%s http=%s attempt=%s delay=%s",
                            endpoint, exc.code, attempt + 1, delay)
                self.sleep(delay)
            except (URLError, TimeoutError, OSError) as exc:
                if attempt == self.retries:
                    raise N01Error(f"Network failure on {endpoint}: {exc}") from exc
                LOG.warning("n01_network_retry endpoint=%s attempt=%s", endpoint, attempt + 1)
                self.sleep(2 ** attempt)
            except (ValueError, UnicodeError) as exc:
                raise N01Error(f"Invalid JSON on {endpoint}") from exc
        raise AssertionError("unreachable")

    def pages(self, endpoint: str, *, count: int = 100, skip: int = 0,
              max_pages: int = 1001, **filters: Any) -> Iterator[tuple[int, list[dict]]]:
        if not 1 <= count <= 100 or not 0 <= skip <= 100000 or max_pages < 1:
            raise ValueError("Invalid pagination")
        seen: set[str] = set()
        for _ in range(max_pages):
            if skip > 100000:
                raise N01Error("N01 skip limit reached; split the date range")
            data = self.get(endpoint, count=count, skip=skip, **filters)
            rows = data.get("list")
            if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
                raise N01Error(f"Invalid list on {endpoint}")
            signature = json.dumps(rows, sort_keys=True, ensure_ascii=False)
            if rows and signature in seen:
                raise N01Error("Repeated page: the server may have ignored pagination")
            seen.add(signature)
            yield skip, rows
            if len(rows) < count:
                return
            skip += len(rows)
        raise N01Error("Page budget reached; coverage is partial, resume the run")
