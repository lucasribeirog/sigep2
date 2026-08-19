# ============================================================
# FRONTEND BUILD
# ============================================================

FROM node:22-bookworm AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build


# ============================================================
# BACKEND DEPENDENCIES
# ============================================================

FROM node:22-bookworm AS backend-build

WORKDIR /app/backend

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./

RUN npm ci --omit=dev

COPY backend/ ./


# ============================================================
# NEXUS RUNTIME
# ============================================================

FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        libreoffice-writer \
        python3 \
        python3-numpy \
        python3-opencv \
        fontconfig \
        fonts-dejavu-core \
        fonts-liberation \
        fonts-crosextra-carlito \
        fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-build \
    /app/backend \
    ./backend

COPY --from=frontend-build \
    /app/frontend/dist \
    ./frontend/dist

ENV NODE_ENV=production
ENV PYTHON_BIN=python3

EXPOSE 10000

CMD ["node", "backend/server.js"]