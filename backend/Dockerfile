# SiteChat backend image (multi-stage)
# Build context must be the repo root: docker build -f backend/Dockerfile .

# ---------- Stage 1: builder ----------
FROM python:3.12-slim AS builder

WORKDIR /build

# System build deps for wheels that may need compilation (numpy, faiss-cpu builds)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Non-root user
RUN groupadd -r sitechat && useradd -r -g sitechat -m sitechat

WORKDIR /app

# Install only the dependency tree from the builder stage
COPY --from=builder /install /usr/local

# Application code
COPY backend/app ./app

# Writable data dirs (uploads, indexes, logs) — mount volumes in production
RUN mkdir -p /app/data/uploads /app/data/faiss_index /app/logs \
    && chown -R sitechat:sitechat /app
VOLUME ["/app/data", "/app/logs"]

USER sitechat

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api', timeout=4).status==200 else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
