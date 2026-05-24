# syntax=docker/dockerfile:1
# =============================================================================
# Stage 1 — Python deps + model download
# =============================================================================
FROM python:3.11-slim AS python-deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/tts-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Voice to bundle — override at build time:
#   docker build --build-arg PIPER_VOICES=pt_BR-faber-medium .
ARG PIPER_VOICES=pt_BR-edresson-low
ENV PIPER_VOICES=${PIPER_VOICES}

COPY docker/download_models.py /tmp/download_models.py
RUN python3 /tmp/download_models.py

# =============================================================================
# Stage 2 — Node.js build
# =============================================================================
FROM node:20-slim AS node-builder

WORKDIR /build

COPY apps/api/package*.json ./
RUN npm ci --ignore-scripts

COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --production

# =============================================================================
# Stage 3 — Runtime image
# =============================================================================
FROM python:3.11-slim AS final

LABEL maintainer="Spell TTS API" \
      description="Piper TTS REST API — pt-BR" \
      version="1.0.0"

ARG PIPER_VOICES=pt_BR-edresson-low

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=3000 \
    MODELS_DIR=/app/models \
    CACHE_DIR=/app/cache \
    LOGS_DIR=/app/logs \
    TEMP_DIR=/app/temp \
    PIPER_VOICES=${PIPER_VOICES}

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-deps /usr/local/bin/python3    /usr/local/bin/python3
COPY --from=python-deps /usr/local/bin/python3.11 /usr/local/bin/python3.11
COPY --from=python-deps /build/models             /app/models

COPY --from=node-builder /build/dist         /app/apps/api/dist
COPY --from=node-builder /build/node_modules /app/apps/api/node_modules
COPY --from=node-builder /build/package.json /app/apps/api/package.json

COPY services/tts-engine /app/services/tts-engine

RUN mkdir -p /app/cache /app/logs /app/temp \
    && chmod 777 /app/cache /app/logs /app/temp

RUN useradd -r -s /bin/false -u 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "/app/apps/api/dist/server.js"]
