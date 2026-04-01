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
   your domain and begins proxying traffic.

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

Open `https://yourdomain.com` in a browser. The dashboard should load with
live BTC data within a minute.

---

## 6. Service overview (production)

| Service    | Public? | Description |
|------------|---------|-------------|
| `caddy`    | **Yes** (80, 443) | Reverse proxy + automatic HTTPS |
| `frontend` | Internal only | Nginx serving the built React app |
| `api`      | Internal only | FastAPI — accessed via Caddy at `/api/*` |
| `collector`| Internal only | Binance WebSocket data collectors |
| `analysis` | Internal only | Claude AI market summary worker |
| `alerts`   | Internal only | Alert evaluation worker |
| `db`       | Internal only | PostgreSQL — never exposed publicly |

---

## 7. Firewall recommendations

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

## 8. Updating the platform

```bash
cd trading-analysis-platform
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

This rebuilds only the services whose image has changed (Docker layer cache),
which is usually just `api` and `frontend` after code changes.

---

## 9. Useful commands

```bash
# View logs from a specific service
docker compose -f docker-compose.prod.yml logs -f api

# Restart a single service (e.g. after updating .env)
docker compose -f docker-compose.prod.yml restart analysis

# Stop the stack (data is preserved in the postgres_data volume)
docker compose -f docker-compose.prod.yml down

# Wipe the database and start fresh
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 10. Telegram bot setup

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
| `/alerts` | Configured alerts and their status |
| `/status` | Data freshness overview |

Alert notifications are sent automatically to `TELEGRAM_CHAT_ID` when an alert
condition is met. Logs are always written regardless of Telegram configuration.

---

## 11. What is intentionally not done yet

| Feature | Status |
|---|---|
| Telegram Mini App | Deferred — plain bot is Phase 10 foundation |
| Telegram webhook mode | Deferred — long polling is simpler and works fine for now |
| Richer bot controls (create alerts from Telegram, etc.) | Deferred |
| Automated backups | Not implemented — back up the `postgres_data` volume manually |
| Auth / access control | Not implemented — the dashboard is currently open |
| Alembic DB migrations | Not implemented — tables are created via `init_db.sql` and `create_all` |
| CI/CD pipeline | Not implemented — updates are manual `git pull + compose up` |

---

## 12. Local development

For local development, use `docker-compose.yml` (the default):

```bash
docker compose up --build
```

See the main [README.md](../README.md) for full local dev instructions.
