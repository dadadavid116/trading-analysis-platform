#!/usr/bin/env bash
# scripts/staging_check.sh — Pre-flight validation for VPS staging deployment
#
# Run this on the VPS BEFORE:
#   docker compose -f docker-compose.prod.yml up -d --build
#
# Checks:
#   1. .env file exists
#   2. Required env vars are set (non-empty)
#   3. Docker and Docker Compose are installed
#   4. Ports 80 and 443 are not already bound by another process
#   5. DOMAIN value matches expected format (basic check)
#   6. CADDY_HASHED_PASSWORD looks like a bcrypt hash
#
# Usage:
#   bash scripts/staging_check.sh
#
# Run from the repo root.

set -euo pipefail

PASS=0
FAIL=0
WARN=0

_pass() { echo "  [OK]   $1"; PASS=$((PASS + 1)); }
_fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
_warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }
_section() { echo ""; echo "── $1 ──────────────────────────────────────────"; }

# ── Locate .env ───────────────────────────────────────────────────────────────
_section "Environment file"

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo ".")"
ENV_FILE="${REPO_ROOT}/.env"

if [[ -f "${ENV_FILE}" ]]; then
    _pass ".env file found"
    # shellcheck source=/dev/null
    set -a; source "${ENV_FILE}"; set +a
else
    _fail ".env file not found — copy .env.example and fill in values"
    echo ""
    echo "  Run:  cp .env.example .env && nano .env"
    echo ""
    exit 1
fi

# ── Required env vars ─────────────────────────────────────────────────────────
_section "Required environment variables"

REQUIRED_VARS=(
    DOMAIN
    POSTGRES_USER
    POSTGRES_PASSWORD
    POSTGRES_DB
    DATABASE_URL
    ANTHROPIC_API_KEY
    CADDY_USER
    CADDY_HASHED_PASSWORD
    CORS_ALLOWED_ORIGINS
)

for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [[ -n "${val}" ]]; then
        _pass "${var} is set"
    else
        _fail "${var} is empty — set a value in .env"
    fi
done

# ── Sanity checks on specific values ─────────────────────────────────────────
_section "Value sanity checks"

# DOMAIN should not be the placeholder
if [[ "${DOMAIN:-}" == "yourdomain.com" || "${DOMAIN:-}" == "" ]]; then
    _fail "DOMAIN is still the placeholder value — set your real domain"
else
    _pass "DOMAIN looks custom: ${DOMAIN}"
fi

# CORS_ALLOWED_ORIGINS should contain the domain in production
if echo "${CORS_ALLOWED_ORIGINS:-}" | grep -q "localhost"; then
    _warn "CORS_ALLOWED_ORIGINS contains localhost — for VPS, set to https://${DOMAIN:-yourdomain.com}"
else
    _pass "CORS_ALLOWED_ORIGINS does not contain localhost"
fi

# CADDY_HASHED_PASSWORD should look like a bcrypt hash
if [[ "${CADDY_HASHED_PASSWORD:-}" == \$2* ]]; then
    _pass "CADDY_HASHED_PASSWORD looks like a valid bcrypt hash"
else
    _fail "CADDY_HASHED_PASSWORD does not look like a bcrypt hash (should start with \$2a\$ or \$2b\$)"
    echo "  Generate one with:"
    echo "    docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'"
fi

# DATABASE_URL should reference "db" (Docker service name), not "localhost"
if echo "${DATABASE_URL:-}" | grep -q "@db:"; then
    _pass "DATABASE_URL uses Docker service name 'db'"
else
    _warn "DATABASE_URL may not use Docker service name 'db' — check it points to the db service"
fi

# POSTGRES_PASSWORD should not be the default
if [[ "${POSTGRES_PASSWORD:-}" == "changeme" ]]; then
    _fail "POSTGRES_PASSWORD is still 'changeme' — set a strong random password"
else
    _pass "POSTGRES_PASSWORD is not the default placeholder"
fi

# ── Docker availability ───────────────────────────────────────────────────────
_section "Docker"

if command -v docker &>/dev/null; then
    _pass "docker is installed ($(docker --version 2>/dev/null | head -1))"
else
    _fail "docker not found — install Docker Engine: curl -fsSL https://get.docker.com | sh"
fi

if docker compose version &>/dev/null 2>&1; then
    _pass "docker compose plugin is available"
elif docker-compose --version &>/dev/null 2>&1; then
    _warn "docker-compose (v1) found — upgrade to Docker Compose v2 (plugin) is recommended"
else
    _fail "docker compose not found — ensure the Compose plugin is installed"
fi

# ── Port availability ─────────────────────────────────────────────────────────
_section "Port availability (80 and 443)"

for port in 80 443; do
    if ss -tlnp "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
        _fail "Port ${port} is already in use — stop the process holding it before starting"
    else
        _pass "Port ${port} is available"
    fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  Results: ${PASS} passed · ${WARN} warnings · ${FAIL} failed"
echo "────────────────────────────────────────────────────"
echo ""

if [[ ${FAIL} -gt 0 ]]; then
    echo "  Fix the FAIL items above before deploying."
    echo ""
    exit 1
elif [[ ${WARN} -gt 0 ]]; then
    echo "  Warnings found — review them before deploying to production."
    echo "  To deploy:  docker compose -f docker-compose.prod.yml up -d --build"
    echo ""
    exit 0
else
    echo "  All checks passed. Ready to deploy:"
    echo "    docker compose -f docker-compose.prod.yml up -d --build"
    echo ""
    exit 0
fi
