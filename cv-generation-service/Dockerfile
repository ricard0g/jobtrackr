# CV Generation Service — WeasyPrint-capable image
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CV_GENERATION_PROVIDER=fake

# Native deps for WeasyPrint (Pango/Cairo/GDK-Pixbuf) + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --upgrade pip \
    && pip install -e ".[gemini]"

EXPOSE 8081

ENV PORT=8081
CMD ["uvicorn", "cv_generation.main:app", "--host", "0.0.0.0", "--port", "8081"]
