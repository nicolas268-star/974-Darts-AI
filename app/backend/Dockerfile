FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN groupadd --system --gid 10001 darts \
    && useradd --system --uid 10001 --gid darts --home-dir /app darts

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=darts:darts app ./app
COPY --chown=darts:darts data ./data
COPY --chown=darts:darts RELEASE.json ./RELEASE.json

USER darts

FROM runtime AS api

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]

FROM runtime AS worker

CMD ["python", "-m", "app.services.tournament_watch_worker"]

FROM runtime AS scraper

USER root

RUN python -m playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

USER darts

CMD ["python", "-m", "app.services.nakka_watch_worker"]
