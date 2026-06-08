# Trading Analysis Platform — Official User Guide

> **Platform status:** All 97 build phases complete. This guide covers the full feature set.
> **Audience:** This guide is written for someone with zero knowledge of the codebase or server.
> Every step is spelled out in full.

---

## Table of Contents

1. [What Is This Platform?](#1-what-is-this-platform)
2. [Safety First](#2-safety-first)
3. [Quick Start](#3-quick-start)
4. [Feature Availability by API Key](#4-feature-availability-by-api-key)
5. [Environment Variables — Every Secret Explained](#5-environment-variables--every-secret-explained)
   - [How to edit `.env` on the VPS](#how-to-edit-env-on-the-vps)
   - [PostgreSQL (database)](#postgresql-database)
   - [Anthropic API Key — Claude AI](#anthropic-api-key--claude-ai)
   - [OpenAI API Key — ChatGPT](#openai-api-key--chatgpt)
   - [FRED API Key — macro data](#fred-api-key--macro-data)
   - [Telegram Bot Token](#telegram-bot-token)
   - [Telegram Chat ID](#telegram-chat-id)
   - [Caddy Basic Auth](#caddy-basic-auth)
   - [JWT Secret Key](#jwt-secret-key)
   - [Admin Account](#admin-account)
   - [OKX API Keys — live trading only](#okx-api-keys--live-trading-only)
   - [Domain Name](#domain-name)
6. [Accessing the Platform](#6-accessing-the-platform)
7. [The Six Workspaces](#7-the-six-workspaces)
   - [Dashboard](#71-dashboard)
   - [Console (Operator Console)](#72-console-operator-console)
   - [Context](#73-context-context-desk)
   - [Account](#74-account-workspace)
   - [Review](#75-review-workspace)
   - [Settings](#76-settings-workspace)
8. [Chart Panel — Full Feature Guide](#8-chart-panel--full-feature-guide)
9. [AI Chat Panel](#9-ai-chat-panel)
10. [Alerts](#10-alerts)
11. [Signal Queue & Paper Execution](#11-signal-queue--paper-execution)
12. [Risk Engine & Kill Switch](#12-risk-engine--kill-switch)
13. [Live Execution Gate (OKX)](#13-live-execution-gate-okx)
14. [Telegram Bot — Complete Guide](#14-telegram-bot--complete-guide)
15. [Deploying Updates to the VPS](#15-deploying-updates-to-the-vps)
16. [Troubleshooting](#16-troubleshooting)
17. [Glossary](#17-glossary)

---

## 1. What Is This Platform?

This is a **self-hosted crypto trading analysis platform** that runs 24/7 on a private VPS (virtual
private server). It collects live market data, scores market conditions, generates trade signals, and
supports paper (simulated) or live (real) order execution — all from one private web dashboard and a
Telegram bot.

**It is not financial advice. It is a decision-support tool.**

**Key capabilities:**

| Capability | What it does |
|---|---|
| Live price & K-line charts | OKX perpetual swap data — BTC, ETH, SOL |
| Derivatives data | Funding rates, open interest, long/short ratios (Binance Futures) |
| Factor scoring | Blends 7 crypto + 7 macro factors into a Context Score (−100 to +100) |
| Scanner | Runs every 30 s; generates signals when multiple factors align |
| Paper execution | Review proposals, open paper positions, track P&L — no real money |
| Live execution | Place real orders on OKX (guarded by 5 safety gates) |
| AI analysis | Claude + ChatGPT for chart analysis, market commentary, strategy validation |
| Telegram bot | Full platform access from your phone |
| Alerts | Price-level notifications via Telegram and/or browser push |
| Backtesting | Replay past signals against 1-minute historical candle data |

**Data sources:**

| Source | Used for | Key required? |
|---|---|---|
| OKX WebSocket | Live price candles, order book (perpetual swaps) | No |
| Binance Futures | Funding rates, open interest, liquidations, long/short ratios | No |
| yfinance | DXY, SPX, NDX, VIX, Gold (macro context) | No |
| FRED (St. Louis Fed) | UST yields, HY credit spread, CPI, PCE, NFP | Yes (free) |
| Anthropic | Claude AI features | Yes |
| OpenAI | ChatGPT features, strategy validation | Yes (optional) |

**Platform format:** Self-hosted web application, accessed through any browser at your domain.
A PWA (Progressive Web App) manifest and service worker are included — you can install it to
your home screen on mobile for an app-like experience. It is not available on the App Store or
Google Play.

---

## 2. Safety First

> Read this section before enabling any live features.

- **Paper mode first.** The platform starts in paper-only mode. Live execution requires explicitly
  enabling it through a 3-step gate. Do not skip the paper trading stage.
- **Live trading can lose real money.** OKX live mode sends real orders to the real exchange with
  real funds. Every order placed is your financial responsibility.
- **This platform is not financial advice.** AI analysis and signals are decision-support tools,
  not recommendations to buy or sell.
- **Always start with `OKX_SANDBOX=true`.** This uses OKX's simulated exchange — same interface,
  no real money. Only change to `false` when you are confident in the full setup.
- **Use a dedicated OKX sub-account** with Trade permission only. Never grant Withdraw
  permission to any API key used by this platform.
- **IP-whitelist your VPS** on OKX when creating the API key. This prevents the key from being
  used from any other IP even if it leaks.
- **Disabling live mode does not cancel exchange orders.** Any orders already on the OKX exchange
  remain open until you cancel them directly in OKX. The kill switch blocks new platform orders
  but does not interact with the exchange's order book.
- **Keep your `.env` file private.** Never commit it to GitHub. It contains all your secrets.

---

## 3. Quick Start

1. Open the platform URL in a browser: `https://yourdomain.duckdns.org`
2. Log in through the Caddy Basic Auth prompt (username + password you set in `.env`)
3. If `JWT_SECRET_KEY` is set, a second in-app login screen appears — use `ADMIN_EMAIL` / `ADMIN_PASSWORD`
4. Select your symbol: **BTC**, **ETH**, or **SOL** in the top-left selector
5. **Dashboard** — live K-line chart, price data, order book, liquidations, derivatives, alerts
6. **Context** — market regime, factor scores, macro overview, news feed
7. **Console** — scanner output, trade signal queue, portfolio tracker, risk panel
8. **Account** — equity, positions, paper execution proposals, order history
9. **Review** — daily coaching, performance stats, regime analysis, backtesting
10. **Settings** — AI model preferences, notification settings, factor weights
11. For mobile access: open Telegram and send `/start` to your bot

---

## 4. Feature Availability by API Key

| Feature | No AI keys | Anthropic only | OpenAI only | Both AI keys |
|---|---|---|---|---|
| Live price data & charts | ✅ | ✅ | ✅ | ✅ |
| Scanner signals | ✅ | ✅ | ✅ | ✅ |
| Paper execution & risk | ✅ | ✅ | ✅ | ✅ |
| Alerts (Telegram + browser) | ✅ | ✅ | ✅ | ✅ |
| Chart Trade Setup analysis | ❌ | ✅ Claude | ❌ | ✅ |
| AI market commentary | ❌ | ✅ Claude | ✅ GPT-4o | ✅ either |
| AI chat (web + Telegram) | ❌ | ✅ Claude | ✅ GPT-4o | ✅ switchable |
| AI daily review coaching | ❌ | ✅ Claude Haiku | ❌ | ✅ |
| Strategy validation | ❌ | ❌ | ✅ Required | ✅ (GPT validates, Claude summarises) |
| Context Score AI narrative | ❌ | ✅ Claude Haiku | ❌ | ✅ |
| FRED macro factors | ✅ (yfinance only) | ✅ (yfinance only) | ✅ (yfinance only) | ✅ (yfinance only) |
| FRED macro factors (yields/inflation) | ❌ | ❌ | ❌ | ❌ (needs FRED key) |
| Live exchange orders | ❌ (needs OKX keys) | ❌ | ❌ | ❌ (needs OKX keys) |

> **yfinance** data (DXY, SPX, VIX, Gold) works with no API key. Only the FRED-backed factors
> (UST 10Y yield, HY credit spread, CPI, PCE, NFP) require a FRED key.

---

## 5. Environment Variables — Every Secret Explained

All secrets live in a single file on the VPS called `.env`. This file is **never committed to
GitHub** — it stays private on the server.

### How to edit `.env` on the VPS

SSH into your VPS, then:

```bash
nano ~/trading-analysis-platform/.env
```

- `Ctrl + O` → `Enter` to save
- `Ctrl + X` to exit

After any change, recreate the affected container to pick up the new values:

```bash
cd ~/trading-analysis-platform
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

> A `restart` is NOT enough — it does not reload `.env`. Use `up -d` to recreate the container.

For all-service changes, run a full deploy: `bash deploy.sh`

---

### PostgreSQL (database)

```
POSTGRES_USER=trading
POSTGRES_PASSWORD=changeme
POSTGRES_DB=trading_db
DATABASE_URL=postgresql+asyncpg://trading:changeme@db:5432/trading_db
```

> **Set this before the very first deployment and do not change it afterwards.**
> The password appears in both `POSTGRES_PASSWORD` and inside `DATABASE_URL` — they must match.
> If you change the password after the Docker database volume already exists, the container will
> fail to start because the stored password hash in the volume won't match the new value.
> Changing it requires a database credential migration that is outside normal deploy scope.
>
> Example with password `abc123`:
> ```
> POSTGRES_PASSWORD=abc123
> DATABASE_URL=postgresql+asyncpg://trading:abc123@db:5432/trading_db
> ```

---

### Anthropic API Key — Claude AI

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

**Where to get it:**
1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys** in the left sidebar → **Create Key**
4. Copy the key (starts with `sk-ant-api03-`)
5. Paste it after `ANTHROPIC_API_KEY=` (no spaces, no quotes)

**Used for:** Chart Trade Setup analysis, AI market commentary, Telegram AI chat,
daily review coaching notes, strategy validation summary, context AI narrative.

---

### OpenAI API Key — ChatGPT

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

**Where to get it:**
1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **Create new secret key** — give it a name
4. Copy the key (starts with `sk-proj-` or `sk-`)
5. Paste it after `OPENAI_API_KEY=`

**Used for:** ChatGPT model in the chat panel and Telegram, and **strategy validation
(`/strategy` command requires this key)**. Strategy validation specifically uses OpenAI's
GPT-4o for the structured analysis step, then optionally uses Claude to write a summary.
If this key is not set, the `/strategy` command and the ChatGPT model option are unavailable;
all other AI features fall back to Claude automatically.

---

### FRED API Key — macro data

```
FRED_API_KEY=abcdef1234567890abcdef1234567890
```

**Where to get it:**
1. Go to [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
2. Click **Request an API Key** → create a free account
3. Your 32-character key will be emailed to you
4. Paste it after `FRED_API_KEY=`

**What works without it:** DXY, SPX, NDX, VIX, and Gold factor data (via yfinance) are always
collected regardless of this key. The macro factor section on Context Desk will show these.

**What requires it:** US 10-year Treasury yield, HY credit spread, CPI YoY, PCE, NFP.
Without the FRED key these specific factors display as unavailable (N/A) on the Macro tab.

---

### Telegram Bot Token

```
TELEGRAM_BOT_TOKEN=1234567890:AABBccDDeeFFggHH
```

**Where to get it:**
1. Open Telegram → search **@BotFather** → send `/newbot`
2. Choose a display name and a username (must end in `bot`)
3. BotFather replies with a token like `1234567890:AABBccDDee...`
4. Copy the entire token and paste it after `TELEGRAM_BOT_TOKEN=`

---

### Telegram Chat ID

```
TELEGRAM_CHAT_ID=987654321
```

**Where to get it:**
1. Open Telegram → search **@userinfobot** → send any message (e.g. `/start`)
2. It replies with your **Id:** number — that is your chat ID (plain integer, e.g. `987654321`)
3. Paste it after `TELEGRAM_CHAT_ID=`

> The bot only responds to this exact chat ID. Any other user who messages the bot is silently
> ignored. Group chat IDs are negative (e.g. `-987654321`).

---

### Caddy Basic Auth

This adds a browser username/password prompt protecting the entire dashboard before any request
reaches the application.

```
CADDY_USER=david
CADDY_HASHED_PASSWORD=$2a$14$xxxxxxxxxxxxxxxxxxxx
```

**How to generate the hashed password** — run on the VPS (replace `yourpassword`):

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
```

The output starts with `$2a$`. Copy it as the value of `CADDY_HASHED_PASSWORD`.

> **Dollar signs in `.env`:** The `$` characters in the bcrypt hash do not need escaping in
> this setup — the hash is passed through Docker Compose environment variable interpolation
> directly into the Caddy container and read by the Caddyfile as `{$CADDY_HASHED_PASSWORD}`.
> Paste the hash value exactly as generated, including all `$` characters.

The password you type in the browser is the plain-text version (`yourpassword`), not the hash.

---

### JWT Secret Key

```
JWT_SECRET_KEY=a8f3b1c9d2e4f6789012345678901234
```

**How to generate:**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Copy the output (64 hex characters) and paste after `JWT_SECRET_KEY=`.

**If left blank:** The in-app login screen is skipped entirely. Caddy Basic Auth is the only
protection layer. This is the default and is fine for a single-operator setup.

**If set:** An additional in-app login screen appears (separate from Caddy Basic Auth), using
the `ADMIN_EMAIL` / `ADMIN_PASSWORD` credentials below.

---

### Admin Account

```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme-set-this
```

> Only relevant if `JWT_SECRET_KEY` is set. The admin user is created automatically on the
> first startup. After logging in, change the password via **Settings → Account → Change Password**.
> Use a strong password — this is your in-app login.

---

### OKX API Keys — live trading only

```
OKX_API_KEY=your-okx-api-key
OKX_API_SECRET=your-okx-api-secret
OKX_API_PASSPHRASE=your-okx-passphrase
OKX_SANDBOX=true
```

> **Leave blank and `OKX_SANDBOX=true` for paper-only mode.** Everything except live orders
> works without these keys.

**Where to get it:**
1. Log in to [https://www.okx.com](https://www.okx.com)
2. Top-right menu → **Account → API**
3. Click **Create API Key** → choose **Sub-account API** (safer — isolates trading funds)
4. Permissions: **Trade only** — do NOT enable Withdraw. Ever.
5. IP restriction: set to your VPS IP (find it with `curl ifconfig.me` on the VPS)
6. Set a passphrase — you will need this for `OKX_API_PASSPHRASE`
7. Copy **API Key**, **Secret Key**, and your **Passphrase**

| Setting | Effect |
|---|---|
| `OKX_SANDBOX=true` | Simulated trading on OKX testnet — no real money lost |
| `OKX_SANDBOX=false` | Real orders on the live OKX exchange |

Always verify the **SANDBOX** or **REAL MONEY** badge in the Live tab before placing any order.

---

### Domain Name

```
DOMAIN=yourdomain.duckdns.org
```

Set this to the domain or subdomain pointing to your VPS. Caddy uses it to obtain an HTTPS
certificate automatically via Let's Encrypt.

---

## 6. Accessing the Platform

### Web dashboard

```
https://yourdomain.duckdns.org
```

1. Browser prompts for Caddy Basic Auth (your `CADDY_USER` and plain-text password)
2. If `JWT_SECRET_KEY` is set, an in-app login screen appears next — use `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. After login the dashboard loads

### Mobile (PWA)

On iOS: Safari → Share → Add to Home Screen
On Android: Chrome → three-dot menu → Add to Home Screen

The PWA installs as an icon and opens full-screen without the browser chrome.

### Telegram bot

Search your bot's username in Telegram → send `/start`.
The bot only responds to your `TELEGRAM_CHAT_ID`.

---

## 7. The Six Workspaces

The top navigation bar shows six tabs. The label in the browser nav bar is shown in **bold**.

---

### 7.1 Dashboard

**Nav label: Dashboard**

The main trading screen. The layout has two columns:

**Left column:**
- **Price** (PricePanel) — K-line chart with all overlays and the AI Trade Setup button
- **Order Book** (OrderBookPanel) — live bid/ask depth from OKX

**Right column:**
- **Liquidations** (LiquidationPanel) — recent forced liquidation events (Binance Futures)
- **Derivatives** (DerivativesPanel) — funding rate, open interest, long/short ratio, Fear & Greed, sparklines
- **Alerts** (AlertsPanel) — active alert list with Active and History tabs; create and manage alerts

**Optional chat column** (toggle button in the header): AI chat panel.

On mobile, one panel is shown at a time. A bottom tab bar lets you switch between: Chart, Liq, OB,
Deriv, Alerts, Chat.

---

### 7.2 Console (Operator Console)

**Nav label: Console**

The signal discovery and trading operations center.

**Left column (always visible on desktop):**
- **Scanner** — raw output from the latest scanner run; signals grouped by symbol with scores and labels
- **Candidate** — the Setup panel; shows the highest-scoring candidate signal with an AI setup card and position-size calculator

**Right column tabs:**

| Tab | Purpose |
|---|---|
| **Event Log** | Live SSE event feed — all platform events in real time |
| **Queue** | Persisted trade signals awaiting review; Live/Closed/All filter; Activate, Invalidate, and Execute buttons |
| **Account** | Account state panel: equity summary, open-risk bar, open positions, risk limits, config modal |
| **Signals** | Multi-timeframe signal matrix — RSI + EMA trend arrow for BTC/ETH/SOL × 15m/1H/4H/1D |
| **Risk** | Kill switch toggle, exposure bars (open risk + daily drawdown), trade sizer form |
| **Portfolio** | Personal portfolio tracker — add positions with entry/size, live P&L |

---

### 7.3 Context (Context Desk)

**Nav label: Context**

The macro and crypto intelligence workspace.

| Tab | Purpose |
|---|---|
| **Overview** | Unified Context Score (−100 to +100), consensus bar, regime label, sub-scores, event calendar strip, AI narrative card |
| **Crypto** | 7 live crypto factors: funding rate, OI delta, long/short ratio, liquidation pressure, order-book imbalance, Fear & Greed, total market cap |
| **Macro** | 7 macro factors: DXY, SPX, VIX, Gold (yfinance); UST 10Y, HY credit spread, CPI (FRED if key set) |
| **News** | Crypto news feed (CoinTelegraph + CoinDesk RSS headlines) |
| **Market Map** | Heatmap — BTC/ETH/SOL × 5m/15m/1H/4H/24H % change grid; asset correlation matrix; global market stats |
| **Market Summary** | Scheduled AI market summary (Claude Haiku, updated every 10 minutes) |

---

### 7.4 Account Workspace

**Nav label: Account**

Everything about your trading account (paper or live).

| Tab | Purpose |
|---|---|
| **Overview** | Equity, return %, drawdown %, open-risk bar, equity-curve SVG, trade statistics grid |
| **Positions** | Open paper positions (close/cancel) + closed position history |
| **Orders** | Order history — pending, filled, cancelled; manual order form |
| **Execution** | Execution proposals — pending (Approve / Reject), history, manual proposal form, SL/TP check button |
| **Risk** | Kill switch toggle, exposure bars, per-symbol risk, rule adherence checklist |
| **Config** | Starting capital, max risk per trade %, max open risk %, daily loss limit % |
| **⚡ Live** | Live Execution Gate — enable/disable real OKX orders, gate checklist, order form, order history |

---

### 7.5 Review Workspace

**Nav label: Review**

Post-trade analysis, research, and performance evaluation.

| Tab | Purpose |
|---|---|
| **Daily Review** | Today's closed trades + P&L + AI coaching note (Claude Haiku, 30-min cache) |
| **By Regime** | Win rate and P&L grouped by market regime at signal creation time |
| **Rules** | 5-rule risk compliance score — did you follow risk rules today? |
| **By Setup** | Trade performance breakdown by timeframe and direction |
| **Diagnostics** | Factor IC correlation, regime heatmap, score quartile stats, trade attribution with score breakdown |
| **Journal** | Trade journal — free-text notes and outcome tracking per setup |
| **Performance** | Win rate, expectancy, equity curve, streak, per-symbol / per-bias breakdown |
| **Backtest** | Replay past signals against 1-minute candle history |

---

### 7.6 Settings Workspace

**Nav label: Settings**

Platform preferences. Settings are stored per-user in the database when JWT login is enabled,
or in browser localStorage when login is disabled.

| Tab | Purpose |
|---|---|
| **General** | UI density: compact or normal |
| **AI Models** | Choose Claude or ChatGPT independently for: chat, chart analysis, scanner |
| **Notifications** | Browser push, Telegram enable/disable, webhook URL, quiet hours |
| **Account** | Change password (only active when JWT login is enabled) |
| **Factor Weights** | Adjust the percentage weight of each scoring factor; total must equal 100 |
| **Export** | Choose CSV or JSON format for data exports |

---

## 8. Chart Panel — Full Feature Guide

The chart is the primary analysis tool on the Dashboard.

### Time intervals

Click any button to reload the chart at that candle period:
`3m  5m  15m  1H  4H  1D  1M`

A countdown timer (⏱) shows time remaining until the current candle closes.

### Overlay toggles

Click any chip in the row below the header to toggle overlays on/off.

| Chip | What it draws | Where |
|---|---|---|
| EMA 20 | 20-period exponential moving average | Main chart |
| EMA 50 | 50-period EMA | Main chart |
| EMA 200 | 200-period EMA | Main chart |
| VWAP | Volume-weighted average price (resets daily) | Main chart |
| Volume | Direction-colored volume histogram (bottom 18% of chart) | Main chart |
| BB (20,2) | Bollinger Bands upper/middle/lower | Main chart |
| RSI (14) | Relative Strength Index with 70/50/30 reference lines | Sub-panel |
| MACD (12,26) | MACD line, signal line, histogram | Sub-panel |
| StochRSI | Stochastic RSI %K and %D with 80/50/20 reference lines | Sub-panel |
| CVD | Cumulative Volume Delta with zero reference | Sub-panel |
| Pivots | Daily pivot points PP, R1–R3, S1–S3 (from yesterday's OHLC) | Main chart |
| Ichimoku | Tenkan, Kijun, Span A/B (projected forward 26 bars), Chikou | Main chart |
| Patterns | Candlestick pattern markers: D=Doji, H=Hammer, S=Shooting Star, BE=Engulfing | Main chart |
| HA | Heikin-Ashi smoothed candles (toggle; shown at end of chip row) | Main chart |

Sub-panels (RSI, MACD, StochRSI, CVD) appear below the main chart when toggled on. All panels
scroll and zoom in sync.

### Setting price alerts from the chart

1. Move the cursor over the chart — a floating price label appears
2. Click at any price — a popover appears
3. Choose **↑ Alert above** or **↓ Alert below** to set a price alert
4. The alert is saved and a dashed line appears on the chart

**Marking a price level (permanent annotation):**
1. Click on the chart → **✏ Mark level**
2. Type an optional label, choose a color → **Save**
3. Annotations persist in the browser and survive page refreshes for that symbol

> Note: marked levels (annotations) are stored in browser localStorage, not the database.
> They do not appear on other devices or other browsers.

### Trade Setup (AI chart analysis)

1. Select your **bias**: Auto / ↑ Long / ↓ Short
2. Click **✦ Trade Setup** — Claude analyzes the chart and draws:
   - Blue lines — entry zone (low and high)
   - Orange line — stop loss
   - Green lines — support levels
   - Red lines — resistance levels + take-profit targets
3. The full analysis narrative appears in the Chat panel

To configure the AI's approach, click **⚙**:
- **Style:** Scalp / Swing / Position
- **Risk / trade:** 0.5% to 3.0%
- **Min R:R:** 1.5 to 5.0
- **Analysis indicators:** check which indicators the AI should consider

Click **Clear** to remove analysis lines from the chart.

> Requires `ANTHROPIC_API_KEY` to be set.

---

## 9. AI Chat Panel

Located on the right side of the Dashboard (toggle with the chat button in the header).

### Switching AI model

Click the **Claude** or **GPT** chip at the top of the panel, or type a request in the chat.

### What the AI knows during web chat

The web chat AI receives a system prompt that includes:
- The latest price candle (OHLCV) for the active symbol
- The 3 most recent liquidation events for the active symbol

It does **not** automatically receive the Context Score or regime in the web chat.
To get a commentary that includes macro/regime context, use the Telegram `/market` command instead.

### AI tools available in web chat

The AI can:
- Look up the current price for any tracked symbol
- Create a price alert (price above or below a threshold)
- List all existing alerts
- Delete an alert by ID

Example: *"Set an alert when BTC goes above 72000"* — the AI calls the tool and confirms.

---

## 10. Alerts

Alerts watch a price condition and fire a Telegram notification when it is met.

### Alert condition types

| Condition | Fires when |
|---|---|
| `price_above` | Price crosses above the threshold |
| `price_below` | Price crosses below the threshold |
| `funding_rate_above` | Funding rate crosses above the threshold % |
| `funding_rate_below` | Funding rate crosses below the threshold % |
| `price_spike_up` | Price rises more than X% within the window (minutes) |
| `price_spike_down` | Price falls more than X% within the window (minutes) |
| `oi_spike` | Open interest changes more than X% within the window |

### Trigger modes

| Mode | Behaviour |
|---|---|
| `once` | Fires once when the condition is first met, then deactivates (does not re-evaluate) |
| `rearm` | Fires when the condition is met; automatically re-arms once the condition is no longer met, allowing it to fire again the next time the threshold is crossed |

### Creating an alert

**From the chart:** Click any price level → **↑ Alert above** or **↓ Alert below**

**From the Alerts panel (Dashboard, right column):** Use the create-alert form in the AlertsPanel

**Via chat (web or Telegram):** Ask the AI: *"Alert me if ETH drops below 3200"*

**Via Telegram command:** `/setalert above 72000` or `/setalert below 65000`

### Viewing and deleting alerts

- **Dashboard → Alerts panel:** Active/History tabs — shows all active alerts; the History tab shows triggered alerts
- **Telegram `/alerts`:** Lists all active alerts with IDs
- **Telegram `/delete_alert <id>`:** Deletes the alert with that ID

---

## 11. Signal Queue & Paper Execution

Signals are automatically generated by the scanner when multiple market factors align.

### Signal lifecycle

```
candidate  →  active  →  expired  (24 hours with no manual action)
                      →  invalidated  (manually dismissed)
```

`close_reason` for a closed signal: `tp`, `sl`, `expired`, or `invalidated`.

### Viewing signals

**Console → Queue** tab. Each signal card shows:
- Direction (▲ Long / ▼ Short), symbol, and timeframe
- Context Score and regime at time of signal creation
- Entry zone, stop loss, take-profit levels
- Scanner labels (e.g. `funding_extreme`, `oi_expansion`)

### Executing a signal (paper trading)

1. **Console → Queue** — find a signal, click **▶ Execute**
2. This creates an execution proposal in the background
3. Go to **Account → Execution** (or **Console → Queue** has a link)
4. The proposal card shows:
   - Risk assessment verdict: APPROVED / WARNING / BLOCKED
   - Suggested position size (auto-calculated from equity × risk%)
   - Entry zone, stop loss, take-profit levels, R:R ratio
5. Click **Approve** → position opens immediately; click **Reject** to dismiss

### SL/TP checking — important note

**Automatic SL/TP closing does NOT happen in the background.** The platform does not
continuously scan open positions for stop-loss or take-profit hits.

To check whether any open positions have hit their SL or TP levels:
- Go to **Account → Execution** → click the **Check SL/TP** button
- Or the API endpoint `POST /api/execution/check` can be called externally

This is an intentional design — the check is manual and on-demand.

### Manual execution

**Account → Execution → +Manual** tab — open a paper position without a signal.

---

## 12. Risk Engine & Kill Switch

The risk engine evaluates every execution proposal before it is allowed to proceed.

### Five risk gates (checked on every proposal)

| Gate | Default threshold |
|---|---|
| Kill switch | Must be OFF — if ON, all new proposals are blocked immediately |
| Per-trade risk | Must not exceed 2% of equity |
| Open risk headroom | Total open risk across all positions must not exceed 10% |
| Daily drawdown | Must not have lost more than 5% of equity today |
| Equity | Must have positive equity |

### Changing risk limits

**Account → Config:**
- Starting capital
- Max risk per trade %
- Max open risk %
- Daily loss limit %

### Kill switch

**Blocks all new paper and live execution proposals immediately when active.**
Does not close or cancel existing positions.
Does not cancel any orders already open on the OKX exchange.

**How to toggle:**
- **Web:** Account → Risk tab → Kill Switch toggle (confirm dialog required)
- **Telegram:** `/risk` → tap the inline **Enable/Disable Kill Switch** button

---

## 13. Live Execution Gate (OKX)

> **This section concerns real money. Read carefully.**
>
> This platform is not financial advice. Live trading can result in total loss of funds.
> Only enable this if you fully understand the risks and have tested extensively in sandbox mode.

### Five safety gates (all must pass)

| Gate | Requirement |
|---|---|
| OKX keys configured | `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE` set in `.env` |
| Kill switch inactive | Kill switch must be OFF |
| Capital configured | Starting capital > 0 in Account → Config |
| Risk ≤ 5% per trade | Max risk per trade must be set to 5% or lower |
| Paper trading history | At least 1 closed paper trade must exist |

### Testing your API keys first

Before enabling live mode, verify your OKX keys work:
- In **Account → ⚡ Live**, click the **Test Connection** button (calls `GET /api/live/test`)
- This pings the OKX account endpoint with read-only access and confirms the key is valid
- Do this before every session

### How to enable live mode

1. Set your OKX API keys in `.env`, run `bash deploy.sh`
2. Go to **Account → ⚡ Live**
3. The gate checklist shows ✓ or ✗ for each requirement
4. When all 5 show ✓, click **Enable Live Trading**
5. A disclaimer appears — read it fully, then click **Continue**
6. Type the exact phrase: `ENABLE LIVE TRADING`
7. Click **Enable** — a pulsing green **LIVE** dot appears

### Supported instruments

| Symbol | Contract |
|---|---|
| BTC | BTC-USDT-SWAP (contract size: 0.01 BTC each) |
| ETH | ETH-USDT-SWAP (contract size: 0.1 ETH each) |
| SOL | SOL-USDT-SWAP (contract size: 1.0 SOL each) |

### Placing a live order

Fill in the order form in **Account → ⚡ Live**:
- Symbol, Direction (Long / Short), Order type (Market / Limit)
- Size in USD, Entry price (limit only), Stop loss, TP1

### Critical safety notes for live mode

- **Start small.** Use the smallest possible order size until you have verified the integration end-to-end.
- **Verify every order on OKX.** Always confirm orders were filled or cancelled directly in the OKX interface, not just in this platform.
- **Disabling live mode here does NOT cancel exchange orders.** Open OKX orders remain live until cancelled directly on OKX.
- **The kill switch blocks new platform orders** but has no interaction with the exchange — it does not cancel orders already on the OKX order book.
- **Always run with `OKX_SANDBOX=true` first.** The sandbox badge and live badge are clearly visible — verify which one you are on before placing any order.
- **Withdraw permission must be disabled** on the OKX API key used by this platform.
- **IP-whitelist the VPS IP** on the OKX API key settings page.

### Disabling live mode

Click **Disable Live Trading** at any time. This only stops the platform from placing new orders.
Manually cancel any open positions and orders directly on the OKX website.

---

## 14. Telegram Bot — Complete Guide

The Telegram bot gives you full platform access from your phone.

### First-time setup

1. Find your bot by username in Telegram (the one you created via BotFather)
2. Send `/start`
3. A persistent keyboard appears at the bottom of the screen — it stays there permanently

### The quick-access keyboard

```
┌──────────────┬───────────────┬─────────────┬──────────────┐
│  📊 Price    │  📡 Signals   │  ⚡ Risk    │ 💼 Positions │
├──────────────┼───────────────┼─────────────┼──────────────┤
│  🌐 Market   │  🧭 Context   │  🔔 Alerts  │  📜 History  │
├──────────────┼───────────────┼─────────────┤
│   🪙 BTC     │   🔷 ETH      │   🟣 SOL    │
└──────────────┴───────────────┴─────────────┘
```

Each button calls the corresponding command. The BTC/ETH/SOL row switches the active symbol
for all subsequent commands.

---

### Full command reference

#### Market data

| Command | Returns |
|---|---|
| `/price` | Live OHLCV candle for the active symbol with timestamp and age |
| `/signals` | Up to 6 recent candidate/active signals with entry, SL, TP, regime, context score |
| `/context` | Context Score, Crypto Score, Macro Score, current regime — from the factor scoring engine |
| `/market` | ~180-word AI market commentary including price data and context score + regime |

> `/market` is the one Telegram command that includes both price data **and** the Context Score
> and regime in its AI prompt. Use this for a fuller market overview.

#### Account & trading

| Command | Returns |
|---|---|
| `/risk` | Equity, P&L, open positions count, open risk %, daily limit %, kill switch status + toggle button |
| `/positions` | All open paper positions with entry, SL, TP, size, age |
| `/history` | Last 7 closed trades with P&L, win/loss icon, win rate summary |

#### Alerts

| Command | Example / Notes |
|---|---|
| `/setalert above <price>` | `/setalert above 72000` — fires when price crosses above threshold |
| `/setalert below <price>` | `/setalert below 65000` — fires when price crosses below threshold |
| `/alerts` | Lists all active alerts with IDs, condition type, threshold |
| `/delete_alert <id>` | `/delete_alert 5` — permanently removes alert #5 |

#### Symbol switching

| Command / button | Effect |
|---|---|
| `/symbol BTC` | All data commands now use BTCUSDT |
| `/symbol ETH` | Switch to ETHUSDT |
| `/symbol SOL` | Switch to SOLUSDT |
| Tap `🪙 BTC` / `🔷 ETH` / `🟣 SOL` | Same as `/symbol` (keyboard shortcut) |

#### AI model

| Command | Effect |
|---|---|
| `/model` | Shows current AI model |
| `/model claude` | Switch to Claude Sonnet |
| `/model chatgpt` | Switch to ChatGPT GPT-4o (requires `OPENAI_API_KEY`) |
| `/claude` | Quick switch to Claude |
| `/chatgpt` | Quick switch to ChatGPT |

#### Strategy validation

```
/strategy Buy BTC when RSI < 30 on 4H, stop 5% below entry, target 2R
```

1. GPT-4o validates whether the description is a complete, specific, actionable strategy
2. If valid: shows entry condition, exit condition, timeframe, SL, TP
3. Claude writes a plain-English summary
4. Inline buttons: **Approve & Set Alert** (Claude creates relevant price alerts) or **Dismiss**

> Requires `OPENAI_API_KEY`. Claude API key is used for the summary step (optional but recommended).

#### Utility

| Command | Effect |
|---|---|
| `/start` | Welcome message + shows/restores the keyboard |
| `/help` | Full command reference card |
| `/clear` | Clears the AI conversation history (start a fresh context) |

### Kill switch via Telegram

Send `/risk`. The response includes an inline button:
- **🔴 Enable Kill Switch** — tapping this immediately blocks all new platform orders
- **🟢 Disable Kill Switch** — re-enables trading

The button edits the original message to confirm the action.

### Free-text AI chat in Telegram

Any message that is not a `/command` is sent to Claude (or ChatGPT if switched) as a conversation.

The AI receives a context prompt containing:
- Live price data (OHLCV) for the active symbol
- The 3 most recent liquidation events for that symbol
- The active symbol name

Example conversations:
> *"What key levels should I watch for BTC this session?"*
> *"Set an alert when BTC drops below 65000 with rearm mode"*
> *"Is the current funding rate extreme?"*

Use `/clear` to reset the conversation history if it gets confused.

### Notification delivery

When a price alert triggers, a Telegram message is automatically sent to `TELEGRAM_CHAT_ID`.
The message includes the alert name, symbol, condition, threshold, and current price.

---

## 15. Deploying Updates to the VPS

Code pushed to GitHub is **not live** until you run the deploy script on the VPS.

### Standard deploy (all services)

```bash
cd ~/trading-analysis-platform
bash deploy.sh
```

This:
1. Resets any local VPS edits (e.g. Caddyfile tweaks)
2. `git pull` — fetches latest code
3. `docker compose build --no-cache frontend` — forces a fresh JS/CSS build
4. Restarts all containers with `--remove-orphans` (cleans up any renamed/removed services)
5. `alembic upgrade head` — applies any pending database schema migrations

### Quick deploy (frontend + API only)

```bash
bash deploy.sh quick
```

Use when only UI or backend logic changed. Skips rebuilding collectors and other services.
Takes 1–2 minutes instead of 3–5.

### Viewing live container logs

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f telegram
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f collector
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f alerts
```

### Restarting a single service (no rebuild)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

Use `up -d` (not `restart`) after changing `.env` — only `up -d` recreates the container and
reloads environment variables.

---

## 16. Troubleshooting

### "Analysis error: 401 invalid x-api-key"

Your `ANTHROPIC_API_KEY` is missing, wrong, or was revoked.
1. Get a new key from [https://console.anthropic.com](https://console.anthropic.com)
2. `nano ~/trading-analysis-platform/.env` → update `ANTHROPIC_API_KEY=`
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api`

---

### Caddy Basic Auth works but in-app login fails

- **JWT not configured:** If `JWT_SECRET_KEY` is blank in `.env`, the in-app login screen
  should not appear. If it does appear and rejects, check that the key is a valid 64-character
  hex string.
- **Admin user not created:** The default admin is created only once on the first startup.
  Check API logs: `docker compose ... logs api | grep -i admin`
- **Wrong password:** The default password is `ADMIN_PASSWORD` from `.env`. Change it after
  the first login in Settings → Account → Change Password.

---

### Website shows 502 Bad Gateway

Caddy is running but the backend is unreachable.
Run `bash deploy.sh` — the `--remove-orphans` flag clears stale containers.
Check the API is running: `docker compose ... logs api`

---

### HTTPS certificate error / "Your connection is not private"

Caddy automatically obtains a Let's Encrypt certificate for the domain in `DOMAIN=`.
- Confirm the domain's DNS A record points to the VPS IP
- Port 80 must be open (Caddy needs it for the ACME challenge)
- Check Caddy logs: `docker compose ... logs caddy`

---

### No price data / chart is blank

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f collector
```

If the collector shows WebSocket connection errors, wait 30–60 seconds — it reconnects
automatically. If it keeps failing, run `bash deploy.sh`.

---

### Context Score shows 0 or stale

The factor scorer runs every 5 minutes. Allow up to 5 minutes after a fresh deploy.
For persistent issues: `docker compose ... logs api | grep scorer`

---

### FRED macro data missing / showing N/A

This is expected if `FRED_API_KEY` is blank. DXY, SPX, VIX, and Gold (yfinance) still work.
To enable FRED factors: get a free key at [https://fred.stlouisfed.org](https://fred.stlouisfed.org),
add it to `.env`, run `docker compose ... up -d api`.

---

### yfinance macro data temporarily unavailable

yfinance occasionally has temporary rate-limit or data availability issues. This is external and
outside platform control. The factor will show as unavailable until yfinance recovers, usually
within minutes to hours. The platform handles this gracefully with no crash.

---

### Telegram bot not responding

1. Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct in `.env`
2. `docker compose ... logs telegram` — check for startup errors
3. Make sure you are messaging the correct bot username
4. Only the exact `TELEGRAM_CHAT_ID` can use the bot. Any other user is silently ignored.

---

### Telegram keyboard not showing

Send `/start` — this restores the persistent keyboard. The keyboard is sent with every reply
but can disappear if you use a different Telegram client or clear the chat.

---

### OKX live test failed

Go to **Account → ⚡ Live → Test Connection**.
- Confirm all three OKX keys are set correctly in `.env` and the container was restarted with `up -d api`
- Confirm the API key is active and not expired on OKX
- Confirm the key has **Trade** permission
- Confirm your VPS IP matches the IP whitelist on the OKX key settings

---

### OKX order rejected

Common reasons:
- **Insufficient balance** — the sub-account does not have enough USDT margin
- **Min order size** — contract size is too small (check minimum lot size for the instrument)
- **Sandbox vs live mismatch** — verify `OKX_SANDBOX` matches the account type you expect
- Check API logs: `docker compose ... logs api | grep -i okx`

---

### Alembic migration failed during deploy

If `bash deploy.sh` prints an Alembic error:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic history
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic current
```
Do not manually edit the database unless you understand what the migration does.
Post the error output for diagnosis before taking action.

---

### Database password mismatch (container fails to start)

If the API or DB container crashes with an authentication error after you changed
`POSTGRES_PASSWORD` in `.env`:
The Docker volume contains the old password. Changing `.env` alone is not sufficient.
Options: restore the original password in `.env`, OR perform a database credential migration
(export data, destroy volume, recreate with new password, restore data). The second option
risks data loss — proceed carefully and take a backup first.

---

### Frontend build failed during deploy

If `bash deploy.sh` exits with a TypeScript or npm error:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs frontend
```
The error message will name the file and line. TypeScript errors must be fixed in code before
the deploy will succeed.

---

### Browser push notifications not working

Go to **Settings → Notifications** and confirm Browser Notifications are enabled.
The browser will prompt for permission on the first use — check that you allowed it.
On iOS, browser push requires the PWA to be installed to the home screen.

---

## 17. Glossary

| Term | Definition |
|---|---|
| **Context Score** | A single number from −100 to +100 that blends 7 crypto factors (60%) and 7 macro factors (40%) into a unified market bias score. Positive = bullish lean, negative = bearish lean. |
| **Regime** | A deterministic label for the current market environment, derived from factor scoring: `risk_on`, `neutral`, `fragile`, `risk_off`, `crowded_long`, or `crowded_short`. |
| **Signal** | A trade direction recommendation generated by the scanner when the composite score reaches ≥ 0.60 and ≥ 2 independent factors agree. Signals have a lifecycle: candidate → active → expired/invalidated. |
| **Execution Proposal** | A structured trade proposal created from a signal (or manually). Contains suggested position size, entry zone, SL, TP, and a risk assessment verdict. Must be approved to open a paper position. |
| **Paper Position** | A simulated trade tracked in the database with no real money involved. Entry, exit, SL/TP levels and P&L are all tracked as if the trade were real. |
| **Live Order** | A real order placed on the OKX exchange via the live execution gate. Involves real money. |
| **Kill Switch** | A master safety toggle. When active, the risk engine blocks all new execution proposals (both paper and live). Does not affect already-open positions or exchange orders. |
| **R Multiple** | A trade's profit or loss expressed as a multiple of the initial risk. E.g. a trade that risked $100 and made $200 is +2R. A trade that hit its stop loss is −1R. |
| **Drawdown** | The peak-to-trough decline in equity from an account high. A 5% daily drawdown means equity fell 5% from the day's opening value. |
| **Factor IC** | Information Coefficient — a correlation measure between a factor's score (e.g. context score) and the resulting trade P&L. IC > 0 means the factor had predictive value. |
| **FRED** | Federal Reserve Economic Data — a free database from the St. Louis Federal Reserve Bank. Used here for Treasury yields, credit spreads, and inflation data. API key required. |
| **yfinance** | Yahoo Finance Python library. Used to pull DXY, SPX, NDX, VIX, and Gold price data without any API key. |
| **Funding Rate** | A periodic payment between long and short perpetual swap holders. Positive = longs pay shorts (longs are crowded). Negative = shorts pay longs (shorts are crowded). |
| **Open Interest (OI)** | Total number of open perpetual swap contracts. Rising OI with rising price = new money entering long. Rising OI with falling price = new money entering short. |
| **Long/Short Ratio** | The proportion of top-trader accounts or positions that are long vs short. Extreme values are used as contrarian signals. |
| **VIX** | CBOE Volatility Index — a measure of expected US equity market volatility over the next 30 days. High VIX often correlates with risk-off crypto conditions. |
| **DXY** | US Dollar Index — measures the dollar against a basket of major currencies. A rising DXY often creates headwinds for crypto (risk-off). |
| **Execution Proposal Verdict** | APPROVED = all risk checks pass; WARNING = trade is allowed but one or more soft limits are breached; BLOCKED = one or more hard rules (kill switch, daily drawdown) prevent execution. |
| **SL/TP Check** | An on-demand check of all open paper positions against the latest database price. Must be triggered manually via the check button in Account → Execution. |

---

*This guide covers the platform as built through Phase 97 (June 2026).
For questions, corrections, or new phase planning, refer to `docs/phase_status.md`.*
