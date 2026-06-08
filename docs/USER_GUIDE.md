# Trading Analysis Platform — Complete User Guide

> **Who this guide is for:** Anyone using the platform for the first time with zero prior knowledge
> of the codebase, the server, or the tools behind it. Every step is spelled out in full.

---

## Table of Contents

1. [What Is This Platform?](#1-what-is-this-platform)
2. [Environment Variables — Every API Key Explained](#2-environment-variables--every-api-key-explained)
3. [Accessing the Platform](#3-accessing-the-platform)
4. [The Six Workspaces](#4-the-six-workspaces)
   - [Dashboard](#41-dashboard)
   - [Operator Console](#42-operator-console)
   - [Context Desk](#43-context-desk)
   - [Account](#44-account-workspace)
   - [Review](#45-review-workspace)
   - [Settings](#46-settings-workspace)
5. [Chart Panel — Full Feature Guide](#5-chart-panel--full-feature-guide)
6. [AI Chat Panel](#6-ai-chat-panel)
7. [Alerts](#7-alerts)
8. [Signal Queue & Paper Execution](#8-signal-queue--paper-execution)
9. [Risk Engine & Kill Switch](#9-risk-engine--kill-switch)
10. [Live Execution Gate (OKX)](#10-live-execution-gate-okx)
11. [Telegram Bot — Complete Guide](#11-telegram-bot--complete-guide)
12. [Deploying Updates to the VPS](#12-deploying-updates-to-the-vps)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What Is This Platform?

This is a **self-hosted crypto trading analysis platform** that runs 24/7 on a private VPS server.
It collects live market data, scores market conditions, generates trade signals, and lets you
execute paper (simulated) or live (real) trades — all from one private dashboard and Telegram bot.

**Key capabilities at a glance:**

| Capability | What it does |
|---|---|
| Live price & K-line charts | OKX perpetual swap data for BTC, ETH, SOL |
| Derivatives data | Funding rates, open interest, long/short ratios (Binance) |
| Factor scoring | Blends 7 crypto + 7 macro factors into a Context Score (−100 to +100) |
| Scanner | Runs every 30 s; emits trade signals when multiple factors align |
| Paper execution | Approve signals, auto-size positions, track P&L — no real money |
| Live execution | Place real orders on OKX (guarded by 5 safety gates) |
| AI analysis | Claude + ChatGPT for chart analysis, market commentary, strategy validation |
| Telegram bot | Full platform access from your phone via Telegram |
| Alerts | Price-level notifications via Telegram and/or browser |

**Data sources:**
- **OKX** — live price candles, order book, K-lines (perpetual swaps)
- **Binance Futures** — funding rates, open interest, liquidations, long/short ratios
- **FRED (Federal Reserve)** — macro data: yields, inflation, credit spreads
- **Yahoo Finance (yfinance)** — DXY, SPX, VIX, Gold (no key required)

---

## 2. Environment Variables — Every API Key Explained

All secrets live in a single file on the VPS called `.env`. This file is **never committed to
GitHub** — it stays private on the server only.

### How to open and edit the file

SSH into your VPS, then:

```bash
nano ~/trading-analysis-platform/.env
```

Use `Ctrl + O` → `Enter` to save, then `Ctrl + X` to exit.

After saving any change, restart the affected service:

```bash
cd ~/trading-analysis-platform
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

Or redeploy everything: `bash deploy.sh`

---

### Full `.env` reference

Below is every variable, what it does, and exactly where to get the value.

---

#### PostgreSQL (database) — set once, never change

```
POSTGRES_USER=trading
POSTGRES_PASSWORD=changeme
POSTGRES_DB=trading_db
DATABASE_URL=postgresql+asyncpg://trading:changeme@db:5432/trading_db
```

> Replace both `changeme` values with the same strong password. The `DATABASE_URL` must use
> the same password. Example: if password is `abc123` then:
> `POSTGRES_PASSWORD=abc123` and `DATABASE_URL=postgresql+asyncpg://trading:abc123@db:5432/trading_db`

---

#### Anthropic API Key (Claude AI) — **Required for AI features**

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

**Where to get it:**
1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys** in the left sidebar
4. Click **Create Key**
5. Copy the key — it starts with `sk-ant-api03-`
6. Paste it after the `=` in `.env` (no spaces, no quotes)

**Used for:** Chart Trade Setup analysis, AI market commentary, Telegram AI chat, strategy
summaries, daily review coaching notes, context AI narrative.

---

#### OpenAI API Key (ChatGPT) — Optional but recommended

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

**Where to get it:**
1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **Create new secret key**
4. Give it a name (e.g. "Trading Platform")
5. Copy the key — it starts with `sk-proj-` or `sk-`
6. Paste it after `OPENAI_API_KEY=` in `.env`

**Used for:** Alternative AI model in chat panel and Telegram, strategy validation (`/strategy`
command). If not set, the platform falls back to Claude for everything.

---

#### FRED API Key (macro data) — Free, optional

```
FRED_API_KEY=abcdef1234567890abcdef1234567890
```

**Where to get it:**
1. Go to [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
2. Click **Request an API Key**
3. Create a free St. Louis Fed account
4. Your key will be emailed to you — it is a 32-character string
5. Paste it after `FRED_API_KEY=`

**Used for:** US 10-year Treasury yield, HY credit spread, CPI, PCE, NFP — all shown on the
Context Desk Macro tab. If left blank, the macro factor section shows "N/A" but everything else
works normally.

---

#### Telegram Bot Token — Required for Telegram features

```
TELEGRAM_BOT_TOKEN=1234567890:AABBccDDeeFFggHHiiJJkkLLmmNNoopp
```

**Where to get it:**
1. Open Telegram on your phone
2. Search for **@BotFather** and start a chat
3. Send: `/newbot`
4. Follow the prompts — choose a name and a username (must end in `bot`)
5. BotFather will reply with a token like `1234567890:AABBccDDee...`
6. Copy that entire token and paste it after `TELEGRAM_BOT_TOKEN=`

---

#### Telegram Chat ID — Required for Telegram features

```
TELEGRAM_CHAT_ID=987654321
```

**Where to get it:**
1. Open Telegram
2. Search for **@userinfobot** and start a chat
3. Send any message (e.g. `/start`)
4. It will reply with your **Id:** number — that is your chat ID
5. Paste it after `TELEGRAM_CHAT_ID=`

> Your chat ID is a plain number (e.g. `987654321`). It can also be negative for group chats.

---

#### Caddy Basic Auth — Required to protect the website

This puts a username/password login screen in front of your entire dashboard.

```
CADDY_USER=david
CADDY_HASHED_PASSWORD=$2a$14$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**How to generate the hashed password:**

Run this command on the VPS (replace `yourpassword` with your chosen password):

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
```

Copy the output (starts with `$2a$`) and paste it as `CADDY_HASHED_PASSWORD`.

> The password you type when visiting the site is the plain text one (`yourpassword`), not the hash.

---

#### JWT Secret Key — Enables in-app login (optional)

```
JWT_SECRET_KEY=a8f3b1c9d2e4f6789012345678901234567890abcdef1234567890abcdef1234
```

**How to generate:**

On the VPS, run:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Copy the output and paste it as `JWT_SECRET_KEY`.

**If left blank:** The in-app login screen is skipped; Caddy Basic Auth is the only gate.
**If set:** An in-app login screen also appears using the `ADMIN_EMAIL`/`ADMIN_PASSWORD` below.

---

#### Admin Account (for in-app login)

```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme-set-this
```

> Change `ADMIN_PASSWORD` to something strong. After the first login, change it via
> **Settings → Account → Change Password** in the UI.

---

#### OKX API Keys — Required ONLY for live trading

```
OKX_API_KEY=your-okx-api-key
OKX_API_SECRET=your-okx-api-secret
OKX_API_PASSPHRASE=your-okx-passphrase
OKX_SANDBOX=true
```

**Where to get it:**
1. Log in to [https://www.okx.com](https://www.okx.com)
2. Go to **Account → API** (top-right menu)
3. Click **Create API Key**
4. Choose **Sub-account API** (safer — isolates trading funds)
5. Set permissions: **Trade only** — do NOT enable Withdraw
6. Set **IP restriction** to your VPS IP address (run `curl ifconfig.me` on the VPS to find it)
7. Set a passphrase — you will need this for `OKX_API_PASSPHRASE`
8. Copy the **API Key**, **Secret Key**, and your **Passphrase**

> **Start with `OKX_SANDBOX=true`** — this uses OKX's simulated trading environment.
> Only change to `OKX_SANDBOX=false` when you are ready to place real orders.

**If not set:** The platform runs in paper-only mode. All analysis, signals, and paper trading
work perfectly without OKX keys.

---

#### Domain Name

```
DOMAIN=yourdomain.duckdns.org
```

Set this to whatever domain or subdomain points to your VPS. Used by Caddy for HTTPS.

---

## 3. Accessing the Platform

### Web dashboard

Open a browser and go to:

```
https://yourdomain.duckdns.org
```

You will be prompted for the **Caddy Basic Auth** username and password (the `CADDY_USER` and
the plain-text version of `CADDY_HASHED_PASSWORD` you set). If `JWT_SECRET_KEY` is also set,
a second in-app login will appear.

### Telegram bot

Search for your bot's username in Telegram and send `/start`.
The bot is private — it only responds to the chat ID in `TELEGRAM_CHAT_ID`.

---

## 4. The Six Workspaces

The top navigation bar has six pages. Click any tab to switch.

---

### 4.1 Dashboard

The main trading screen. Contains four panels side by side:

| Panel | What it shows |
|---|---|
| **Price** | Live K-line chart with overlays and AI trade setup |
| **Liquidations** | Recent long/short liquidation events |
| **Order Book** | Live bid/ask depth from OKX |
| **Chat** | AI assistant (Claude or ChatGPT) with market context |

**Symbol selector** (top-left of every page): Switch between BTC, ETH, and SOL. All panels
update to show data for the selected symbol.

---

### 4.2 Operator Console

The signal and execution command center. Five tabs:

| Tab | Purpose |
|---|---|
| **Scanner** | Raw scanner output — signals from the last scan run |
| **Queue** | Persisted signals awaiting review and execution approval |
| **Execution** | Pending execution proposals; approve or reject to open paper positions |
| **Risk** | Kill switch, per-trade risk, open risk bar, rule adherence |
| **Backtest** | Run backtests against historical price data for any signal |

---

### 4.3 Context Desk

The macro + crypto intelligence page. Six tabs:

| Tab | Purpose |
|---|---|
| **Overview** | Unified Context Score (−100 to +100), consensus bar, regime label, event calendar |
| **Crypto** | 7 crypto factors: funding, OI, long/short ratio, liquidation pressure, order book imbalance |
| **Macro** | 7 macro factors: DXY, SPX, VIX, Gold, US10Y yield, HY spread, CPI |
| **Signals** | Signal history with regime + score at time of creation |
| **Journal** | Trade journal — free-text notes per position |
| **Performance** | P&L, win rate, expectancy, equity curve |

---

### 4.4 Account Workspace

Everything about your (paper) trading account. Six tabs:

| Tab | Purpose |
|---|---|
| **Overview** | Equity, return %, drawdown, equity curve chart, trade stats |
| **Positions** | Open and closed paper positions; close or cancel from here |
| **Orders** | Order history — pending, filled, cancelled |
| **Execution** | Execution proposals (duplicate of Operator Console Execution tab) |
| **Risk** | Kill switch, exposure bars, per-symbol risk, rule adherence checklist |
| **⚡ Live** | Live Execution Gate — enable/disable real OKX orders |
| **Config** | Starting capital, max risk per trade %, max open risk %, daily loss limit |

---

### 4.5 Review Workspace

Post-trade analysis and research. Seven tabs:

| Tab | Purpose |
|---|---|
| **Daily Review** | Today's trades + AI coaching note (Claude, cached 30 min) |
| **By Regime** | Win rate grouped by market regime |
| **Rules** | 5-rule risk compliance score — did you follow the rules? |
| **By Setup** | Performance broken down by timeframe and direction |
| **Diagnostics** | Factor IC correlation, regime heatmap, score quartile stats |
| **Journal** | Trade journal |
| **Backtest** | Same backtest panel as Operator Console |

---

### 4.6 Settings Workspace

Platform configuration. Six tabs:

| Tab | Purpose |
|---|---|
| **General** | UI density (compact / normal) |
| **AI Models** | Choose Claude or ChatGPT separately for chat, chart analysis, scanner |
| **Notifications** | Browser push, Telegram, webhook URL, quiet hours |
| **Account** | Change password (only when JWT login is enabled) |
| **Factor Weights** | Adjust the weighting of each scoring factor (must total 100) |
| **Export** | Choose CSV or JSON for data exports |

---

## 5. Chart Panel — Full Feature Guide

The chart is the primary analysis tool on the Dashboard.

### Time intervals

Buttons across the top: `3m  5m  15m  1H  4H  1D  1M`

Click any button to reload the chart with that candle period.
A countdown timer (⏱) next to the price data shows time until the current candle closes.

### Overlay toggles (chip row below the header)

Click any chip to toggle that overlay on/off. Active overlays show a colored underline.

| Overlay | What it draws |
|---|---|
| EMA 20 | 20-period exponential moving average (orange) |
| EMA 50 | 50-period EMA (orange-red) |
| EMA 200 | 200-period EMA (purple) |
| VWAP | Volume-weighted average price (blue dashed) |
| Volume | Volume histogram at the bottom of the main chart |
| BB (20,2) | Bollinger Bands — upper, middle, lower (blue) |
| RSI (14) | Relative Strength Index in a sub-panel below the chart |
| MACD (12,26) | MACD line, signal line, histogram sub-panel |
| StochRSI | Stochastic RSI %K and %D sub-panel |
| CVD | Cumulative Volume Delta sub-panel |
| Pivots | Daily pivot points (PP, R1–R3, S1–S3) |
| Ichimoku | Tenkan, Kijun, Span A/B, Chikou on the main chart |
| Patterns | Candlestick pattern markers (D=Doji, H=Hammer, S=Shooting Star, BE=Bullish/Bearish Engulf) |
| HA | Heikin-Ashi smoothed candles (toggle at the end of the chip row) |

### Chart indicators sub-panels

When RSI, MACD, StochRSI, or CVD are enabled, additional panels appear below the main chart.
All panels share the same time axis and scroll in sync.

### Setting price alerts from the chart

1. Move your cursor over the chart — a floating price label appears
2. Click at any price level — a popover appears
3. Choose **↑ Alert above** or **↓ Alert below**
4. The alert is saved and a dashed line appears on the chart

To mark a level (permanent annotation):
1. Click on the chart
2. Choose **✏ Mark level**
3. Type an optional label, pick a color, click **Save**
4. Marked levels persist across page reloads for that symbol

### Trade Setup (AI analysis)

1. Select your **bias**: Auto / ↑ Long / ↓ Short
2. Click the **✦ Trade Setup** button
3. Claude analyzes the chart and draws:
   - Blue lines — entry zone (low and high)
   - Orange line — stop loss
   - Green lines — support levels
   - Red lines — resistance levels + take profit targets
4. The analysis narrative appears in the **Chat panel** on the right

To configure the AI's approach, click the **⚙** gear button:
- **Style:** Scalp / Swing / Position
- **Risk / trade:** 0.5% to 3.0%
- **Min R:R:** 1.5 to 5.0
- **Analysis indicators:** Check which indicators the AI should factor in

To remove analysis lines: click **Clear** (appears after an analysis runs).

---

## 6. AI Chat Panel

Located on the right side of the Dashboard. Supports full conversation context.

### Switching AI model

- Click the **Claude** or **GPT** chip at the top of the chat panel
- Or type `Switch to ChatGPT` / `Switch to Claude` in the message box

### What the AI knows

The AI always has access to:
- Live price data for the active symbol
- Recent liquidation events
- The Context Score and current regime

### Asking about the chart

After running a Trade Setup analysis, you can ask follow-up questions:
> "Why did you pick that entry zone?"
> "What's the invalidation level for this setup?"
> "How does the current funding rate affect this trade?"

### Creating alerts via chat

You can ask the AI to create alerts directly in conversation:
> "Set an alert when BTC goes above 72000"
> "Alert me if ETH drops below 3200"

The AI will call the alert tool and confirm the alert was created.

---

## 7. Alerts

Alerts fire when a price condition is met and send a Telegram message (if configured).

### Creating an alert

**From the chart:** Click any price level → **↑ Alert above** or **↓ Alert below**

**From the Operator Console:** Go to the Scanner tab and look for the Alerts section

**Via chat:** Ask the AI: *"Set an alert when BTC goes above 72000"*

**Via Telegram:** `/setalert above 72000` or `/setalert below 65000`

### Alert modes

| Mode | Behaviour |
|---|---|
| **once** | Fires once, then deactivates |
| **rearm** | Fires every time the condition is met (re-arms after each trigger) |

### Viewing active alerts

- **Dashboard:** Dashed orange lines on the chart show active price alerts
- **Telegram:** `/alerts` — lists all active alerts with their IDs

### Deleting an alert

- **Telegram:** `/delete_alert <id>` (get the ID from `/alerts`)
- **Chart:** Not yet supported — use Telegram or the API

---

## 8. Signal Queue & Paper Execution

Signals are automatically generated by the scanner when multiple market factors align.

### Signal lifecycle

```
candidate → active → closed (hit TP/SL) or expired (24 h)
                   → invalidated (manual)
```

### Viewing signals

Go to **Operator Console → Queue** tab. Each signal card shows:
- Direction (▲ Long / ▼ Short) and symbol
- Context Score and regime at signal creation time
- Entry zone, stop loss, take profit levels
- Scanner labels (e.g. "funding_extreme", "oi_expansion")

### Executing a signal (paper trading)

1. Go to **Operator Console → Queue**
2. Find a signal with status **candidate** or **active**
3. Click **▶ Execute** — this creates an execution proposal
4. Go to **Operator Console → Execution** (or **Account → Execution**)
5. Review the proposal card — it shows:
   - Risk assessment verdict (APPROVED / WARNING / BLOCKED)
   - Suggested position size (auto-calculated from your equity and risk %)
   - Stop loss, take profit levels
6. Click **Approve** to open the paper position, or **Reject** to dismiss

### Automatic SL/TP checking

The platform checks open positions every few minutes against the latest price.
When price hits a TP or SL level, the position is automatically closed and P&L is recorded.

### Manual execution

Go to **Operator Console → Execution → +Manual** tab to open a position without a signal.

---

## 9. Risk Engine & Kill Switch

The risk engine evaluates every trade before it is allowed to execute.

### Five risk rules (checked on every execution)

| Rule | Default threshold |
|---|---|
| Per-trade risk | Max 2% of equity per trade |
| Open risk headroom | Total open risk must not exceed 10% |
| Daily drawdown | Must not exceed 5% loss in a day |
| Kill switch | Instantly blocks all new trades when active |
| Minimum equity | Must have positive equity |

### Changing risk limits

Go to **Account → Config** and adjust:
- Starting capital
- Max risk per trade %
- Max open risk %
- Daily loss limit %

### Kill switch

The kill switch immediately **blocks all new paper and live orders** when active.
It does not close existing positions.

**To toggle:**
- **Web:** Account → Risk tab → Kill Switch toggle (with confirm dialog)
- **Telegram:** `/risk` → tap the **Enable/Disable Kill Switch** button in the message

---

## 10. Live Execution Gate (OKX)

> **Do not enable live trading until you fully understand the risks.**
> Start with `OKX_SANDBOX=true` in your `.env` to test on OKX's simulated exchange first.

### Five safety gates (all must pass before enabling)

| Gate | Requirement |
|---|---|
| OKX keys configured | `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE` must be set in `.env` |
| Kill switch inactive | The kill switch must be OFF |
| Capital configured | Starting capital must be set (Account → Config) |
| Risk ≤ 5% | Per-trade risk setting must be 5% or lower |
| Paper trading history | At least 1 closed paper trade must exist |

### How to enable live mode

1. Set your OKX API keys in `.env` and run `bash deploy.sh` to apply
2. Go to **Account → ⚡ Live** tab
3. The gate checklist shows ✓ or ✗ for each requirement
4. When all 5 show ✓, click **Enable Live Trading**
5. A disclaimer appears — read it carefully, then click **Continue**
6. Type the confirmation phrase exactly: `ENABLE LIVE TRADING`
7. Click **Enable** — a green "LIVE" indicator appears

### Sandbox vs real money

| `OKX_SANDBOX` setting | Effect |
|---|---|
| `true` (default) | All orders go to OKX's simulated testnet — no real money |
| `false` | Real orders on the live OKX exchange |

A **SANDBOX** or **REAL MONEY** badge is shown in the Live tab so you always know which mode is active.

### Placing a live order

With live mode enabled, fill in the order form in **Account → ⚡ Live**:
- Symbol (BTC-USDT-SWAP / ETH-USDT-SWAP / SOL-USDT-SWAP)
- Direction (Long / Short)
- Order type (Market / Limit)
- Size in USD
- Entry price (for limit orders)
- Stop loss and TP1 prices

Click **Place Order** — the order is sent to OKX and appears in the order history table below.

### Disabling live mode

Click **Disable Live Trading** in the Live tab at any time.
This does NOT cancel any orders already on the exchange — cancel those manually in OKX.

---

## 11. Telegram Bot — Complete Guide

The Telegram bot gives you full platform access from your phone.

### First-time setup

1. Find your bot in Telegram (search the username you gave it in BotFather)
2. Send `/start`
3. A persistent keyboard with quick-access buttons appears at the bottom of the screen

### The quick-access keyboard

```
┌─────────────┬──────────────┬────────────┬──────────────┐
│  📊 Price   │  📡 Signals  │  ⚡ Risk   │ 💼 Positions │
├─────────────┼──────────────┼────────────┼──────────────┤
│  🌐 Market  │  🧭 Context  │  🔔 Alerts │  📜 History  │
├─────────────┼──────────────┼────────────┤
│   🪙 BTC    │   🔷 ETH     │   🟣 SOL   │
└─────────────┴──────────────┴────────────┘
```

Tap any button — it acts exactly like typing the corresponding command.
The bottom row (BTC / ETH / SOL) switches the active symbol for all subsequent commands.

---

### Full command reference

#### Market data

| Command | What it returns |
|---|---|
| `/price` | Live OHLCV candle for the active symbol |
| `/signals` | Up to 6 recent active/candidate signals with entry, SL, TP |
| `/context` | Context Score, Crypto Score, Macro Score, current regime |
| `/market` | ~180-word AI market commentary for the active symbol |

#### Account & trading

| Command | What it returns |
|---|---|
| `/risk` | Equity, P&L, open positions count, open risk %, daily limit, kill switch status |
| `/positions` | All open paper positions with entry, SL, TP, size, age |
| `/history` | Last 7 closed trades with P&L and win/loss icon |

#### Alerts

| Command | Usage example |
|---|---|
| `/setalert above <price>` | `/setalert above 72000` — fires when price crosses above |
| `/setalert below <price>` | `/setalert below 65000` — fires when price crosses below |
| `/alerts` | Lists all active alerts with their IDs |
| `/delete_alert <id>` | `/delete_alert 5` — removes alert #5 |

#### Symbol switching

| Command | Effect |
|---|---|
| `/symbol BTC` | Switch all market commands to BTC |
| `/symbol ETH` | Switch to ETH |
| `/symbol SOL` | Switch to SOL |
| Tap `🪙 BTC` | Same as `/symbol BTC` (keyboard shortcut) |

#### AI model

| Command | Effect |
|---|---|
| `/model` | Shows the current AI model |
| `/model claude` | Switch to Claude Sonnet |
| `/model chatgpt` | Switch to ChatGPT (GPT-4o) |
| `/claude` | Quick switch to Claude |
| `/chatgpt` | Quick switch to ChatGPT |

#### Strategy validation

```
/strategy Buy BTC when RSI < 30 on 4H, stop 5% below entry, target 2R
```

The bot uses ChatGPT to validate whether the description is a complete, specific strategy.
If valid, it shows the parsed entry/exit/TF/SL/TP and offers **Approve & Set Alert** or **Dismiss**.
Approving asks Claude to automatically create the relevant price alerts.

> `/strategy` requires `OPENAI_API_KEY` to be set.

#### Utility

| Command | Effect |
|---|---|
| `/start` | Welcome message + restores the keyboard |
| `/help` | Full command reference card |
| `/clear` | Wipes the AI conversation history (useful if the AI gets confused) |

#### Kill switch via inline button

When you use `/risk`, the response includes an inline button:
- **🔴 Enable Kill Switch** — tap to block all new trades
- **🟢 Disable Kill Switch** — tap to re-enable trading

The button edits the original message to confirm the change.

---

### Free-text AI chat

Any message that is not a `/command` is sent to the AI as a chat message.
The AI has:
- Live price context for the active symbol
- Recent liquidation data
- The ability to create, list, and delete price alerts using tools

Example conversations that work well:
> *"What's the current market structure for BTC?"*
> *"Is this a good time to go long based on funding rates?"*
> *"Create an alert when BTC goes above 70000 and another below 65000"*
> *"What's my account equity and risk exposure?"* — the AI will look it up

To keep context clean, use `/clear` to start a fresh conversation.

---

### Notification delivery

When a price alert triggers, a Telegram message is sent automatically to `TELEGRAM_CHAT_ID`.
The message includes: alert name, symbol, condition, threshold, and current price.

---

## 12. Deploying Updates to the VPS

Whenever code changes are pushed to GitHub, they are **not live** until you run the deploy script
on the VPS.

### Standard deploy (all services)

```bash
cd ~/trading-analysis-platform
bash deploy.sh
```

This does:
1. Resets any local VPS edits (e.g. Caddyfile)
2. `git pull` — downloads the latest code
3. Builds the frontend (with `--no-cache` to guarantee fresh JS/CSS)
4. Restarts all containers
5. Runs `alembic upgrade head` — applies any new database migrations

### Quick deploy (frontend + API only)

```bash
bash deploy.sh quick
```

Use this when only the UI or backend API changed — it skips rebuilding collectors and other
services, so it's faster (about 1–2 minutes instead of 3–5).

### Viewing live logs

```bash
# All services at once
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# A specific service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f telegram
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f collector
```

### Restarting a single service (without rebuilding)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart telegram
```

---

## 13. Troubleshooting

### "Analysis error: 401 invalid x-api-key"

Your `ANTHROPIC_API_KEY` is missing, wrong, or was revoked.

1. Get a new key from [https://console.anthropic.com](https://console.anthropic.com)
2. Open `.env`: `nano ~/trading-analysis-platform/.env`
3. Update `ANTHROPIC_API_KEY=` with the new key
4. Recreate the API container: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api`

> A `restart` is not enough after a `.env` change — you must use `up -d` to recreate the container.

---

### "No price data for BTCUSDT yet"

The price collector hasn't started or is reconnecting.

Check the collector logs:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f collector
```

If it shows WebSocket connection errors, wait 30–60 seconds and try again. If it keeps failing,
run `bash deploy.sh` to do a full rebuild.

---

### Telegram bot not responding

1. Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct in `.env`
2. Check the bot is running: `docker compose ... logs -f telegram`
3. Confirm you are messaging the correct bot username
4. Only the exact chat ID in `TELEGRAM_CHAT_ID` can use the bot — no other users can

---

### Website shows 502 Bad Gateway

Caddy is running but can't reach the frontend or API container.

Run:
```bash
bash deploy.sh
```

The deploy script includes `--remove-orphans` which cleans up any stale containers causing this.

---

### Chart shows "Chart error" or is blank

The API may have restarted. Refresh the page. If the error persists:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
```
Look for Python errors in the output.

---

### AI chat says "ANTHROPIC_API_KEY is not configured"

Same fix as the 401 error above — set the key in `.env` and run `up -d api`.

---

### Context Score shows 0 or "no data"

The factor scorer runs every 5 minutes. If you just deployed, wait up to 5 minutes.
If it never updates, check the API logs for scoring errors:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api | grep scorer
```

---

### Scanner shows no signals

The scanner runs every 30 seconds. Signals are only emitted when the composite score is
≥ 0.60 and at least 2 independent factors agree. In low-volatility / neutral markets,
no signals is the correct and expected output.

---

*Last updated: June 2026 — covers all features through Phase 97.*
