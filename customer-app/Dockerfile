# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# VITE_* build args — Railway injects them; Vite embeds them into the bundle
ARG VITE_API_BASE_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY

# Install dependencies (layer cached until package.json changes)
COPY package*.json ./
RUN npm ci

# Change this value to force Docker to discard any cached source/build layers
ARG CACHE_BUST=2026-06-09c

# Copy source code in explicit layers so Docker invalidates cache on any src change
COPY src/ ./src/
COPY public/ ./public/
COPY index.html nginx.conf serve.json ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js ./

RUN npm run build

# ─── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx.conf uses ${PORT} as a template variable. Copy it as a .template file
# so we can run envsubst at container start to inject Railway's $PORT.
COPY --from=build /app/nginx.conf /etc/nginx/templates/default.conf.template
# envsubst '${PORT}' substitutes only ${PORT}, leaving nginx's own $uri, $uri/,
# $http_upgrade, etc. completely untouched.
CMD ["/bin/sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
