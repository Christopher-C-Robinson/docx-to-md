FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Runtime ----
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    libreoffice-writer \
    fonts-liberation \
    && soffice --version >/dev/null 2>&1 \
    && rm -rf /var/lib/apt/lists/*

# Create a dedicated non-root user for running the application.
# Running as root inside a container widens the blast radius of any exploit
# (e.g. a malicious DOCX triggering a vulnerability in pandoc/libreoffice).
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --shell /bin/sh --create-home appuser

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Give the non-root user ownership of the application directory.
RUN chown -R appuser:appgroup /app

USER appuser

ENTRYPOINT ["node", "dist/cli/index.js"]
