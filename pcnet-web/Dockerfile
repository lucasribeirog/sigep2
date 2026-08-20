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
# BACKEND BUILD
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
RUN npm ci --omit=dev

COPY backend/ ./


# ============================================================
# NEXUS RUNTIME
# ============================================================

FROM node:22-bookworm-slim


# ------------------------------------------------------------
# HABILITAR CONTRIB
#
# ttf-mscorefonts-installer pertence ao repositório contrib.
# ------------------------------------------------------------

RUN sed -i \
    's/Components: main/Components: main contrib/g' \
    /etc/apt/sources.list.d/debian.sources


# ------------------------------------------------------------
# DEPENDÊNCIAS GERAIS + FONTES LIVRES
# ------------------------------------------------------------

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        libreoffice-writer \
        python3 \
        python3-numpy \
        python3-opencv \
        fontconfig \
        debconf \
        cabextract \
        wget \
        xfonts-utils \
        fonts-dejavu-core \
        fonts-liberation \
        fonts-crosextra-carlito \
        fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*


# ------------------------------------------------------------
# MICROSOFT CORE FONTS
#
# Instala, entre outras:
#
# Times New Roman
# Times New Roman Bold
# Times New Roman Italic
# Times New Roman Bold Italic
# Arial
# Courier New
# etc.
# ------------------------------------------------------------

RUN echo \
    "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" \
    | debconf-set-selections && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        ttf-mscorefonts-installer \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*


# ------------------------------------------------------------
# FONTCONFIG DO NEXUS
#
# O Microsoft Core Fonts não contém Calibri.
#
# Carlito é metricamente compatível com Calibri, portanto:
#
# Calibri -> Carlito
# Cambria -> Caladea
#
# Times New Roman NÃO é substituída:
# usamos a Times New Roman verdadeira instalada acima.
# ------------------------------------------------------------

RUN printf '%s\n' \
    '<?xml version="1.0"?>' \
    '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">' \
    '<fontconfig>' \
    '' \
    '  <alias binding="strong">' \
    '    <family>Calibri</family>' \
    '    <prefer>' \
    '      <family>Carlito</family>' \
    '    </prefer>' \
    '  </alias>' \
    '' \
    '  <alias binding="strong">' \
    '    <family>Cambria</family>' \
    '    <prefer>' \
    '      <family>Caladea</family>' \
    '    </prefer>' \
    '  </alias>' \
    '' \
    '</fontconfig>' \
    > /etc/fonts/conf.avail/99-nexus-fonts.conf && \
    ln -sf \
        /etc/fonts/conf.avail/99-nexus-fonts.conf \
        /etc/fonts/conf.d/99-nexus-fonts.conf && \
    fc-cache -f -v


# ------------------------------------------------------------
# TESTES OBRIGATÓRIOS
#
# O build NÃO DEVE continuar se:
#
# Times New Roman -> outra fonte
# Calibri         -> outra fonte que não Carlito
#
# Assim evitamos novamente um deploy aparentemente correto
# usando DejaVu silenciosamente.
# ------------------------------------------------------------

RUN echo "==========================================" && \
    echo "        DIAGNÓSTICO DE FONTES NEXUS       " && \
    echo "==========================================" && \
    echo "" && \
    echo "Times New Roman:" && \
    fc-match "Times New Roman" && \
    echo "" && \
    echo "Times New Roman Bold:" && \
    fc-match "Times New Roman:style=Bold" && \
    echo "" && \
    echo "Calibri:" && \
    fc-match "Calibri" && \
    echo "" && \
    echo "Cambria:" && \
    fc-match "Cambria" && \
    echo "" && \
    echo "=========================================="


# ------------------------------------------------------------
# VALIDAÇÃO RÍGIDA
#
# Se estas condições não forem satisfeitas, o Docker build
# termina com erro em vez de publicar um PDF com fonte errada.
# ------------------------------------------------------------

RUN fc-match -f '%{family}\n' \
        "Times New Roman" \
        | head -n 1 \
        | grep -qi "Times New Roman" \
    && \
    fc-match -f '%{family}\n' \
        "Times New Roman:style=Bold" \
        | head -n 1 \
        | grep -qi "Times New Roman" \
    && \
    fc-match -f '%{family}\n' \
        "Calibri" \
        | head -n 1 \
        | grep -qi "Carlito"


# ============================================================
# APLICAÇÃO
# ============================================================

WORKDIR /app

COPY --from=backend-build \
    /app/backend \
    ./backend

COPY --from=frontend-build \
    /app/frontend/dist \
    ./frontend/dist


# ------------------------------------------------------------
# SANITY CHECK DO POSTGRES
# ------------------------------------------------------------

RUN node -e \
    "require('./backend/node_modules/pg'); console.log('pg OK')"


ENV NODE_ENV=production
ENV PYTHON_BIN=python3

EXPOSE 10000

CMD ["node", "backend/server.js"]