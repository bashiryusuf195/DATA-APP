# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json knexfile.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build
RUN find /app/dist/modules/transactions/pdf -type f

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# Install production deps; add ts-node + typescript for knex migrations
RUN npm ci --omit=dev && \
    npm install --no-save ts-node typescript && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

# Migration support: knex needs the TypeScript source + knexfile at runtime
COPY knexfile.ts ./
COPY src/database ./src/database

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
