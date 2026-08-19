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
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./

# Compila o sqlite3 no próprio Debian Bookworm,
# evitando incompatibilidade de GLIBC.
RUN npm ci --omit=dev && \
    npm rebuild sqlite3 --build-from-source

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
        fonts-liberation2 \
        fonts-crosextra-carlito \
        fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*


# ============================================================
# SUBSTITUICAO DE FONTES DO MICROSOFT NO LIBREOFFICE
# ============================================================

RUN printf '%s\n' \
'<?xml version="1.0"?>' \
'<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">' \
'<fontconfig>' \
'  <match target="pattern">' \
'    <test qual="any" name="family">' \
'      <string>Times New Roman</string>' \
'    </test>' \
'    <edit name="family" mode="prepend" binding="strong">' \
'      <string>Liberation Serif</string>' \
'    </edit>' \
'  </match>' \
'' \
'  <match target="pattern">' \
'    <test qual="any" name="family">' \
'      <string>Calibri</string>' \
'    </test>' \
'    <edit name="family" mode="prepend" binding="strong">' \
'      <string>Carlito</string>' \
'    </edit>' \
'  </match>' \
'' \
'  <match target="pattern">' \
'    <test qual="any" name="family">' \
'      <string>Arial</string>' \
'    </test>' \
'    <edit name="family" mode="prepend" binding="strong">' \
'      <string>Liberation Sans</string>' \
'    </edit>' \
'  </match>' \
'' \
'  <match target="pattern">' \
'    <test qual="any" name="family">' \
'      <string>Cambria</string>' \
'    </test>' \
'    <edit name="family" mode="prepend" binding="strong">' \
'      <string>Caladea</string>' \
'    </edit>' \
'  </match>' \
'</fontconfig>' \
> /etc/fonts/local.conf && \
fc-cache -f


# ============================================================
# APPLICATION
# ============================================================

WORKDIR /app

COPY --from=backend-build \
    /app/backend \
    ./backend

COPY --from=frontend-build \
    /app/frontend/dist \
    ./frontend/dist


# Confere já durante o build que o sqlite3 funciona
# no sistema operacional final.
RUN node -e "require('./backend/node_modules/sqlite3'); console.log('sqlite3 OK')"


ENV NODE_ENV=production
ENV PYTHON_BIN=python3

EXPOSE 10000

CMD ["node", "backend/server.js"]