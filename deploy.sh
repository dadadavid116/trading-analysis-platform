#!/bin/bash
# deploy.sh — Pull latest changes and restart the trading platform.
#
# Usage:
#   bash deploy.sh        # rebuild all services with a build: section (default)
#   bash deploy.sh quick  # rebuild frontend + api only (when only UI/API changed)
#
# Run from: /root/trading-analysis-platform

set -e

# Reset files that may have been edited locally on the VPS
# (Caddyfile is sometimes patched in place; reset it to the repo version)
git checkout caddy/Caddyfile 2>/dev/null || true

git pull

if [ "${1}" = "quick" ]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans frontend api
else
  # Rebuild everything that has a build: section.
  # --no-cache frontend ensures JS/CSS changes always land even if layer hashes collide.
  # --remove-orphans removes stale Caddy/other containers that cause 502s after renames.
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
fi

# Apply any pending Alembic migrations.
# Alembic is now the single source of truth for schema changes.
# This is a no-op when the database is already at head.
echo "Running database migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api alembic upgrade head

echo "Deploy complete."
