#!/bin/bash
# deploy.sh — Pull latest changes and restart the trading platform.
#
# Usage:
#   bash deploy.sh            # rebuild frontend only (default, fastest)
#   bash deploy.sh all        # rebuild every service
#
# Run from: /root/trading-analysis-platform

set -e

# Reset files that may have been edited locally on the VPS
# (Caddyfile is sometimes patched in place; reset it to the repo version)
git checkout caddy/Caddyfile 2>/dev/null || true

git pull

if [ "${1}" = "all" ]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
else
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build frontend api
fi

echo "Deploy complete."
