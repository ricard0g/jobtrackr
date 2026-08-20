# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS python-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /bin/uv

FROM python-base AS test

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY tests ./tests
RUN uv sync --frozen --extra gemini --extra dev
RUN uv run pytest && touch /verified

FROM python-base AS runtime

COPY --from=test /verified /verified
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --extra gemini --no-dev --no-editable \
    && groupadd --system --gid 10001 cvgen \
    && useradd --system --uid 10001 --gid cvgen --home-dir /app --shell /usr/sbin/nologin cvgen \
    && chown -R cvgen:cvgen /app

USER cvgen

EXPOSE 8081

ENV CV_GENERATION_PROVIDER=gemini \
    CV_GENERATION_ALLOW_FAKE_PROVIDER=false \
    CV_GENERATION_PROFILE=production \
    HOST=0.0.0.0 \
    PORT=8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/health/ready')"

CMD ["uvicorn", "cv_generation.main:app", "--host", "0.0.0.0", "--port", "8081"]
