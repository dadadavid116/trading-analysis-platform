# Deployment Guide — Trading Analysis Platform

This guide covers deploying the platform to a VPS for 24/7 live operation.

---

## Prerequisites

| Requirement | Details |
|---|---|
| VPS | Any Linux VPS (Ubuntu 22.04 recommended) with at least 1 GB RAM |
| Domain | A domain pointing to your VPS IP (A record configured) |
| Docker | Docker Engine + Compose plugin installed on the VPS |
| Ports | 80 and 443 open in the VPS firewall; 5432 and 8000 closed to public |

---

## 1. Install Docker on the VPS

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker info
```

---

## 2. Clone the repository

```bash
git clone https://github.com/dadadavid116/trading-analysis-platform.git
cd trading-analysis-platform
```

---

## 3. Create your `.env` file

```bash
cp .env.example .env
nano .env   # or vim .env
```

Minimum required values for production:

```dotenv
# PostgreSQL
POSTGRES_PASSWORD=<strong random password>

# Database URL — keep "db" as the host (Docker internal service name)
DATABASE_URL=postgresql+asyncpg://trading:<password>@db:5432/trading_db

# Claude API — required for the AI analysis panel
ANTHROPIC_API_KEY=<your key>

# Your domain — Caddy uses this for automatic HTTPS
DOMAIN=yourdomain.com

# CORS — set to your domain only (no localhost origins in production)
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# Dashboard access control — see §7 for instructions
CADDY_USER=<your chosen username>
CADDY_HASHED_PASSWORD=<bcrypt hash — see §7>
```

To enable the Telegram bot and alert notifications, also set:

```dotenv
TELEGRAM_BOT_TOKEN=<your token from @BotFather>
TELEGRAM_CHAT_ID=<your Telegram user ID>
```

These are optional — if blank, the `telegram` service stays idle and alerts
log to container stdout only.

---

## 4. Start the production stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Docker will:
1. Pull `postgres:16` and initialise the database.
2. Build and start the FastAPI backend (`api`).
3. Build the React app as a static bundle and serve it via Nginx (`frontend`).
4. Start the `collector`, `analysis`, and `alerts` workers.
5. Start `caddy` — which immediately requests a Let's Encrypt certificate for
   your domain and begins proxying traffic with Basic Auth enforced.

> **First build** takes a few minutes while Docker builds images and npm installs
> packages. Subsequent starts (without `--build`) are much faster.

---

## 5. Verify the stack is running

```bash
# Watch all service logs
docker compose -f docker-compose.prod.yml logs -f

# Check that all containers are up
docker compose -f docker-compose.prod.yml ps
```

Open `https://yourdomain.com` in a browser. You should see a login prompt
(HTTP Basic Auth). Enter your `CADDY_USER` and password. The dashboard should
load with live BTC data within a minute of first login.

---

## 6. Service overview (production)

| Service    | Public? | Description |
|------------|---------|-------------|
| `caddy`    | **Yes** (80, 443) | Reverse proxy + automatic HTTPS + Basic Auth |
| `frontend` | Internal only | Nginx serving the built React app |
| `api`      | Internal only | FastAPI — accessed via Caddy at `/api/*` |
| `collector`| Internal only | Binance WebSocket data collectors |
| `analysis` | Internal only | Claude AI market summary worker |
| `alerts`   | Internal only | Alert evaluation worker |
| `db`       | Internal only | PostgreSQL — never exposed publicly |

---

## 7. Access control

Authentication is handled at the **Caddy layer** using HTTP Basic Auth.
Caddy rejects unauthenticated requests before they touch the application —
no secret is embedded in or exposed by the frontend bundle.

| Variable | Where used |
|---|---|
| `CADDY_USER` | Caddy — username shown in the browser login prompt |
| `CADDY_HASHED_PASSWORD` | Caddy — bcrypt hash of your password |

The `/health` endpoint is intentionally excluded from auth so that uptime
monitoring tools can reach it without credentials.

**Step 1 — Generate a password hash**

Run this on your VPS (no extra tools needed):

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
```

This outputs a string like `$2a$14$...`. Copy the full hash.

**Step 2 — Add to `.env`**

```dotenv
CADDY_USER=admin
CADDY_HASHED_PASSWORD=$2a$14$...paste full hash here...
```

**Step 3 — Restart Caddy**

```bash
docker compose -f docker-compose.prod.yml restart caddy
```

**If `CADDY_USER` or `CADDY_HASHED_PASSWORD` are not set**, Caddy will fail
to start with a config error. This is intentional — failing loudly is safer
than silently disabling authentication.

**Local development:**
Caddy is not used in the local dev stack (`docker-compose.yml`). The Vite
dev server and FastAPI are accessed directly on their ports. No auth setup
is needed for local development.

**Optional secondary layer:**
Setting `DASHBOARD_API_KEY` in `.env` also enables an `X-API-Key` check
directly in FastAPI on all `/api/*` routes. This is not required when Caddy
Basic Auth is the primary gate. Leave it empty (the default) to rely on
Caddy alone.

**If you accidentally expose a credential:**
Immediately generate a new password, update `.env` with the new bcrypt hash,
and restart Caddy: `docker compose -f docker-compose.prod.yml restart caddy`.
If `DASHBOARD_API_KEY` is also set, rotate it too and rebuild the stack.

---

## 8. Firewall recommendations

Configure your VPS firewall (e.g. `ufw`) to only allow public traffic on
ports 22, 80, and 443:

```bash
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Ports 5432 (PostgreSQL) and 8000 (FastAPI) are not bound to host interfaces
in `docker-compose.prod.yml`, so they are already internal-only. The firewall
rule is an additional safety layer.

---

## 9. Updating the platform

```bash
cd trading-analysis-platform
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

This rebuilds only the services whose image has changed (Docker layer cache),
which is usually just `api` and `frontend` after code changes.

---

## 10. Useful commands

```bash
# View logs from a specific service
docker compose -f docker-compose.prod.yml logs -f api

# Restart a single service (e.g. after updating .env)
docker compose -f docker-compose.prod.yml restart caddy

# Stop the stack (data is preserved in the postgres_data volume)
docker compose -f docker-compose.prod.yml down

# Wipe the database and start fresh
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 11. Telegram bot setup

The `telegram` service runs a long-polling bot. No public URL or webhook is needed.

**Step 1 — Create a bot**
1. Open Telegram and message @BotFather
2. Send `/newbot` and follow the prompts
3. Copy the token you receive

**Step 2 — Get your chat ID**
1. Message @userinfobot on Telegram
2. It will reply with your user ID — this is your `TELEGRAM_CHAT_ID`

**Step 3 — Update `.env`**
```dotenv
TELEGRAM_BOT_TOKEN=123456:ABCdef...
TELEGRAM_CHAT_ID=123456789
```

**Step 4 — Restart the telegram service**
```bash
# Local dev
docker compose restart telegram

# VPS
docker compose -f docker-compose.prod.yml restart telegram
```

**Available bot commands:**

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/help` | List of commands |
| `/price` | Latest BTC price candle |
| `/analysis` | Latest AI market summary |
| `/alerts` | Configured alerts and their status (with IDs) |
| `/delete_alert <id>` | Delete an alert by ID |
| `/status` | Data freshness overview |

All bot commands are restricted to the configured `TELEGRAM_CHAT_ID`. Commands
from any other chat are silently ignored and logged as a warning on the server.
Alert notifications are sent automatically to `TELEGRAM_CHAT_ID` when an alert
condition is met. Logs are always written regardless of Telegram configuration.

---

## 12. What is intentionally not done yet

| Feature | Status |
|---|---|
| Telegram Mini App | Deferred — plain bot is the Phase 10 foundation |
| Telegram webhook mode | Deferred — long polling is simpler and works fine for now |
| Richer bot controls (create alerts from Telegram, etc.) | Deferred |
| Automated backups | Not implemented — back up the `postgres_data` volume manually |
| Alembic DB migrations | Not implemented — tables are created via `init_db.sql` and `create_all` |
| CI/CD pipeline | Not implemented — updates are manual `git pull + compose up` |

---

## 13. Local development

For local development, use `docker-compose.yml` (the default):

```bash
docker compose up --build
```

Caddy is not in the local dev stack. The Vite dev server and FastAPI are
accessed directly on their ports with no authentication required.

See the main [README.md](../README.md) for full local dev instructions.

---

## 14. Staging VPS validation

Before going live, run the pre-flight check script on your VPS:

```bash
bash scripts/staging_check.sh
```

This verifies:
- All required env vars are set and non-empty
- `DOMAIN` is not the placeholder value
- `CADDY_HASHED_PASSWORD` looks like a valid bcrypt hash
- `POSTGRES_PASSWORD` is not the default `changeme`
- `CORS_ALLOWED_ORIGINS` does not contain `localhost`
- Docker and Docker Compose are installed
- Ports 80 and 443 are available

Fix any `[FAIL]` items before deploying. `[WARN]` items are worth reviewing but
will not block the stack from starting.

### Post-startup verification

After `docker compose -f docker-compose.prod.yml up -d --build`:

**1. Check all containers are up and healthy**
```bash
docker compose -f docker-compose.prod.yml ps
```
All services should show `Up` (workers) or `Up (healthy)` (api, db).

**2. Check the public health endpoint (no auth required)**
```bash
curl -f https://yourdomain.com/health
# Expected: {"status":"ok"}
```

**3. Check that the dashboard requires auth**
```bash
curl -i https://yourdomain.com/
# Expected: HTTP 401 with WWW-Authenticate: Basic header
```

**4. Verify Caddy obtained a certificate**
```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate\|tls\|acme"
```
Caddy logs a success message when Let's Encrypt issues the certificate (usually within 30 s
of first start, provided DNS is correctly pointed at the VPS).

**5. Verify live data is flowing**
```bash
# Check collector
docker compose -f docker-compose.prod.yml logs --tail=20 collector

# Check analysis worker
docker compose -f docker-compose.prod.yml logs --tail=20 analysis

# Quick API test (with your credentials)
curl -u admin:yourpassword https://yourdomain.com/api/price/latest
```

**6. Verify the frontend loads**

Open `https://yourdomain.com` in a browser. After entering credentials, the
dashboard should load with data in all five panels within ~1 minute.

### Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Caddy fails to start | `CADDY_USER` or `CADDY_HASHED_PASSWORD` not set | Add to `.env`, restart caddy |
| Caddy fails to start | `CADDY_HASHED_PASSWORD` is a plain password, not a hash | Re-generate with `caddy hash-password` |
| `/health` returns connection refused | `api` container not started | Check `docker compose ps` and `logs api` |
| HTTPS certificate not issued | DNS A record not pointed at VPS | Check with `dig yourdomain.com` |
| HTTPS certificate not issued | Ports 80/443 blocked by VPS firewall | Run `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp` |
| Panels show no data | Collector not running | Check `docker compose logs collector` |
| Analysis panel empty | `ANTHROPIC_API_KEY` not set | Add key to `.env`, restart analysis |
| Database connection errors | `DATABASE_URL` uses `localhost` instead of `db` | Fix `DATABASE_URL` host to `db` |

---

## 15. Export / review bundle hygiene

When sharing code for review, use the export script to create a clean bundle:

```bash
bash scripts/export.sh
# Output: ../trading-analysis-platform-review-YYYYMMDD_HHMMSS.zip
```

The script uses `git archive`, which exports only version-controlled files and
automatically excludes everything in `.gitignore`.

**Never include in a review bundle:**
- `.env` — contains real secrets (passwords, API keys)
- `node_modules/` — large binary artefact, not source code
- `.claude/` or any local IDE/tool settings directories
- `frontend/dist/` — build output, regenerated on deploy
- Any `*.pyc` / `__pycache__` directories

**Verify a bundle is clean before sharing:**
```bash
unzip -l yourfile.zip | grep -E '\.env|node_modules|\.claude'
# Should produce no output
```

**If you accidentally commit or share a secret:**
1. Rotate the secret immediately (generate a new password/key).
2. Update `.env` and restart the affected service.
3. If committed to git: rewrite history with `git filter-repo` or contact
   your git host's support to remove cached objects.
