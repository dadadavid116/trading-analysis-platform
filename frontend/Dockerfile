# Frontend Dockerfile
# Phase 3 scaffold — supports both dev (Vite dev server) and prod (Nginx static build).
#
# For local development (via docker-compose), the dev stage is used.
# For production (VPS), the prod stage serves the built static files via Nginx.

# ── Stage 1: Dev ──────────────────────────────────────────────────────────────
FROM node:20-slim AS dev

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Vite dev server default port
EXPOSE 5173

# Start development server (hot reload enabled)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Accept the dashboard API key at build time so Vite can inline it.
# Pass via docker-compose.prod.yml build args (see VITE_DASHBOARD_API_KEY).
# Leave empty for local development — auth is disabled when the key is not set.
ARG VITE_DASHBOARD_API_KEY=""
ENV VITE_DASHBOARD_API_KEY=$VITE_DASHBOARD_API_KEY

RUN npm run build


# ── Stage 3: Prod (Nginx) ─────────────────────────────────────────────────────
FROM nginx:alpine AS prod

# Copy built static files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Replace the default Nginx config with our SPA-aware config.
# This ensures all routes serve index.html (required for React client-side routing).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for the reverse proxy (Caddy in production)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
