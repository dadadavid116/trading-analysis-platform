# Phase 98 Smoke Test Checklist

Run these tests manually on the live VPS after deploying Phase 98 (`bash deploy.sh`).
Check off each item. Log failures with the error message and container log excerpt.

---

## Deploy

- [ ] `bash deploy.sh` completes without errors
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` — all containers show `Up (healthy)` or `Up`
- [ ] `docker compose ... logs api | tail -30` — no repeated errors
- [ ] `docker compose ... logs telegram | tail -30` — no repeated errors
- [ ] `docker compose ... exec api alembic current` — shows `head`

---

## AI — web

- [ ] **Claude chat:** Open Dashboard → Chat panel (model = Claude) → send "What is the current BTC price?" → receives a reply (not 401 or error)
- [ ] **ChatGPT chat** (if `OPENAI_API_KEY` set): Switch model chip to GPT → send any message → receives a reply
- [ ] **Chart Trade Setup:** Dashboard → Price chart → click **✦ Trade Setup** → analysis lines appear + reply in chat
- [ ] **Context AI summary:** Context → Overview → click Refresh → summary updates (Claude Haiku; needs `ANTHROPIC_API_KEY`)

---

## AI — Telegram

- [ ] `/start` — welcome message + persistent keyboard appears
- [ ] `/price` — returns OHLCV for active symbol
- [ ] `/context` — returns Context Score + regime
- [ ] **`/market`** — returns ~180-word market commentary with no raw API error text
  - If `ANTHROPIC_API_KEY` valid: normal commentary
  - If `ANTHROPIC_API_KEY` invalid: should see clean message "Claude API key is missing or invalid..." (not raw JSON)
- [ ] Free-text chat — send a plain sentence → AI replies
- [ ] `/model chatgpt` (if `OPENAI_API_KEY` set) → confirm switch → `/market` uses ChatGPT
- [ ] `/model claude` → switch back to Claude

---

## Strategy validator

- [ ] **Telegram:** `/strategy Buy BTC when RSI drops below 30 on 4H, stop 3% below entry, target 2R`
  - Should show validated card with entry/exit/SL/TP extracted
  - Claude summary present (if `ANTHROPIC_API_KEY` set) or fallback text "Strategy validated successfully."
  - Inline buttons: **Approve & Set Alert** and **Dismiss**
- [ ] Tap **Approve & Set Alert** — Claude creates 1–3 price alerts, confirms in Telegram
- [ ] `/alerts` — newly created strategy alerts appear in the list
- [ ] `/delete_alert <id>` — remove test alerts
- [ ] **Invalid strategy test:** `/strategy buy when moon` — should return "Invalid Strategy" message
- [ ] **Web UI:** Chat panel → type strategy → similar validation flow (requires `OPENAI_API_KEY`)

---

## Chat history & Save Chat

- [ ] Send several messages in the web chat
- [ ] Click the **Save** button on the chat session
- [ ] On VPS: `ls ~/trading-analysis-platform/chat_history/Claude/` (or ChatGPT/) — file appears with `(Saved by User)` suffix
- [ ] Session appears in the chat sidebar — click it to reload history
- [ ] Start a new session (clear or open a new one) and send a message — session_id changes
- [ ] (Optional, if near midnight UTC) Wait for nightly export → check for `YYYY-MM-DD Daily Log (Auto-Saved).md` in correct subfolder

---

## Telegram — full keyboard check

- [ ] 📊 Price button → same as `/price`
- [ ] 📡 Signals button → same as `/signals`
- [ ] ⚡ Risk button → same as `/risk` + kill switch inline button visible
- [ ] 💼 Positions button → same as `/positions`
- [ ] 🌐 Market button → same as `/market`
- [ ] 🧭 Context button → same as `/context`
- [ ] 🔔 Alerts button → same as `/alerts`
- [ ] 📜 History button → same as `/history`
- [ ] 🪙 BTC / 🔷 ETH / 🟣 SOL → symbol switching confirms active symbol
- [ ] Unauthorized message test: if possible, have a second Telegram account message the bot — it should receive no response (silently ignored)

---

## Alerts

- [ ] **From UI:** Dashboard → Alerts panel → create a `price_above` alert for BTC above a level well above current price → alert saved and appears in Active tab
- [ ] **From chart:** Click a price level on the chart → Alert above/below → confirm alert created
- [ ] **Via Telegram chat:** "Alert me if BTC drops below [level]" → AI creates alert → confirm with `/alerts`
- [ ] `/setalert above 999999` — creates alert with once mode
- [ ] `/delete_alert <id>` — removes the alert
- [ ] `rearm` mode: create an alert with rearm, verify it shows in Active (live trigger test is optional — skip if current price is far from threshold)

---

## Execution safety

- [ ] **Paper proposal:** Console → Queue → find a signal → click Execute → proposal appears in Account → Execution → Pending
- [ ] Click **Approve** → position opens → appears in Account → Positions
- [ ] Click **Check SL/TP** button — runs check, no crash (may close position if price hit levels)
- [ ] **Kill switch — block test:** Account → Risk → Enable Kill Switch (confirm dialog) → try to approve a proposal → should be BLOCKED → disable kill switch again
- [ ] **Live gate:** Account → ⚡ Live → gate checklist loads (no JS error) → shows ✓ or ✗ for each gate
- [ ] **OKX test connection** (only if OKX keys configured): click **Test Connection** → should confirm connection status
- [ ] **Do NOT place real live orders during smoke test** unless explicitly testing live execution with full intent

---

## Deploy — edge cases

- [ ] `bash deploy.sh quick` — completes without error, frontend + API restart
- [ ] After `bash deploy.sh`, check `docker compose ... logs api | grep -i "alembic"` — shows `upgrade head` success
- [ ] No `--remove-orphans` warning about unrecognised containers (if there are warnings, investigate)

---

## Sign-off

| Test group | Result | Notes |
|---|---|---|
| Deploy | ✅ / ❌ | |
| AI — web | ✅ / ❌ | |
| AI — Telegram | ✅ / ❌ | |
| Strategy validator | ✅ / ❌ | |
| Chat history | ✅ / ❌ | |
| Telegram keyboard | ✅ / ❌ | |
| Alerts | ✅ / ❌ | |
| Execution safety | ✅ / ❌ | |

When all rows show ✅ or have documented known-acceptable failures:
- Update `docs/roadmap.md` Phase 98 status from `⏳ In progress` to `✅ Done`
- Update `docs/phase_status.md` — set Phase 98 as complete
