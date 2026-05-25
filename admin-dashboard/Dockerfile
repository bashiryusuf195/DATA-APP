# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# VITE_API_BASE_URL is baked into the JS bundle at build time.
# Pass it as a Railway build argument:
#   Service → Settings → Build → Add variable: VITE_API_BASE_URL=https://api.hivedata.com.ng
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: nginx static server ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Copy the compiled SPA
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config to the TEMPLATES directory.
# The official nginx image ships with /docker-entrypoint.d/20-envsubst-on-templates.sh
# which runs envsubst on every *.template file in /etc/nginx/templates/ before
# nginx starts, writing the result to /etc/nginx/conf.d/.
# This substitutes ${PORT} with the value Railway injects at runtime.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway sets $PORT dynamically. nginx binds to that port (see nginx.conf).
# EXPOSE is informational only — the actual port is whatever Railway assigns.
EXPOSE 8080

# Healthcheck: use shell form so ${PORT:-8080} expands at container runtime.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/health" || exit 1

# The nginx entrypoint handles template substitution then starts nginx.
CMD ["nginx", "-g", "daemon off;"]
