/**
 * src/api/index.ts — Typed API client for the Trading Analysis Platform.
 *
 * Thin fetch wrappers for all backend endpoints. Types mirror the Pydantic
 * response schemas in backend/app/schemas/.
 *
 * Base URL is proxied through Vite during local development (see vite.config.ts).
 * In production the same /api path is routed by the Caddy reverse proxy.
 *
 * Authentication
 * --------------
 * Access control is handled entirely at the Caddy layer (HTTP Basic Auth).
 * The browser handles the auth prompt and caches credentials for the session.
 * No secret is embedded in or sent from this module.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceCandle {
  id: number;
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiquidationEvent {
  id: number;
  symbol: string;
  timestamp: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  exchange: string;
}

export interface OrderBookSnapshot {
  id: number;
  symbol: string;
  timestamp: string;
  bids: [number, number][];  // [price, quantity] pairs
  asks: [number, number][];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_URL = '/api';

/**
 * Generic fetch wrapper. Throws an error if the response is not OK.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// ── Endpoint functions ─────────────────────────────────────────────────────────

/** Fetch the latest price candle for a symbol. */
export function fetchLatestPrice(symbol = 'BTCUSDT'): Promise<PriceCandle> {
  return apiFetch<PriceCandle>(`/price/latest?symbol=${symbol}`);
}

/** Fetch paginated candle history for a symbol. */
export function fetchPriceHistory(limit = 60, symbol = 'BTCUSDT'): Promise<PriceCandle[]> {
  return apiFetch<PriceCandle[]>(`/price/history?limit=${limit}&symbol=${symbol}`);
}

export interface KlineCandle {
  time: number;   // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Fetch OHLCV candles for a given interval and symbol from OKX (via the backend). */
export function fetchKlines(interval: string, limit = 100, symbol = 'BTCUSDT'): Promise<KlineCandle[]> {
  return apiFetch<KlineCandle[]>(`/price/klines?interval=${interval}&limit=${limit}&symbol=${symbol}`);
}

/** Fetch recent liquidation events for a symbol. */
export function fetchRecentLiquidations(limit = 20, symbol = 'BTCUSDT'): Promise<LiquidationEvent[]> {
  return apiFetch<LiquidationEvent[]>(`/liquidations/recent?limit=${limit}&symbol=${symbol}`);
}

export interface HeatmapCell {
  pi:       number;   // price bin index (0 = price_min)
  ti:       number;   // time bin index (0 = oldest)
  buy_usd:  number;   // shorts liquidated (exchange bought to close)
  sell_usd: number;   // longs liquidated  (exchange sold to close)
}

export interface LiquidationHeatmapData {
  symbol:           string;
  hours:            number;
  price_min:        number;
  price_max:        number;
  price_bin_size:   number;
  price_bins:       number;
  time_bins:        number;
  time_bin_minutes: number;
  time_start:       string;
  time_end:         string;
  cells:            HeatmapCell[];
}

/** Fetch the price×time liquidation heatmap for a symbol. */
export function fetchLiquidationHeatmap(symbol = 'BTCUSDT', hours = 24): Promise<LiquidationHeatmapData> {
  return apiFetch<LiquidationHeatmapData>(`/liquidations/heatmap?symbol=${symbol}&hours=${hours}`);
}

/** Fetch the latest order book snapshot for a symbol. */
export function fetchOrderBookSnapshot(symbol = 'BTCUSDT'): Promise<OrderBookSnapshot> {
  return apiFetch<OrderBookSnapshot>(`/orderbook/snapshot?symbol=${symbol}`);
}

export interface AnalysisSummary {
  id: number;
  symbol: string;
  generated_at: string;
  summary_text: string;
  model_used: string;
}

/**
 * Fetch the latest AI-generated market summary.
 * Returns null if no summary has been generated yet (404 from the API).
 * Throws on other errors (network failure, 5xx, etc.).
 */
export async function fetchLatestAnalysis(): Promise<AnalysisSummary | null> {
  const response = await fetch(`${BASE_URL}/analysis/latest`);
  if (response.status === 404) return null;  // worker hasn't run yet
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<AnalysisSummary>;
}

export interface Alert {
  id:             number;
  name:           string;
  symbol:         string;
  condition_type: string;
  threshold:      number;
  window_minutes: number | null;
  trigger_mode:   string;   // 'once' | 'rearm'
  is_active:      boolean;
  webhook_url:    string | null;
  triggered_at:   string | null;
  created_at:     string;
}

export interface AlertCreate {
  name:            string;
  symbol?:         string;
  condition_type:  string;
  threshold:       number;
  window_minutes?: number | null;
  trigger_mode?:   string;  // defaults to 'once' on the backend
  webhook_url?:    string | null;
}

/** Fetch all alert rules. */
export function fetchAlerts(): Promise<Alert[]> {
  return apiFetch<Alert[]>('/alerts/');
}

/** Create a new alert rule. */
export async function createAlert(body: AlertCreate): Promise<Alert> {
  const response = await fetch(`${BASE_URL}/alerts/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<Alert>;
}

/** Delete an alert by ID. No-ops silently on 404. */
export async function deleteAlert(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/alerts/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
}

// ── Chart analysis (Phase 23) ─────────────────────────────────────────────────

export interface ChartAnalysis {
  trend:             'bullish' | 'bearish' | 'sideways';
  direction:         'long' | 'short';
  support_levels:    number[];
  resistance_levels: number[];
  entry_zone:        { low: number; high: number };
  stop_loss:         number;
  take_profit:       number[];
  reasoning:         string;
  timeframe:         string;
  current_price:     number;
}

export async function requestChartAnalysis(
  timeframe: string,
  userBias = '',
  activeIndicators: string[] = ['rsi', 'macd', 'ema', 'price_levels'],
  symbol = 'BTCUSDT',
  traderStyle = 'swing',
  riskPerTrade = 1.0,
  targetRR = 2.0,
): Promise<ChartAnalysis> {
  const response = await fetch(`${BASE_URL}/analysis/chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeframe, user_bias: userBias, active_indicators: activeIndicators, symbol,
      trader_style: traderStyle, risk_per_trade: riskPerTrade, target_rr: targetRR,
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { detail?: string })?.detail ?? `API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<ChartAnalysis>;
}

/** Fetch the last N AI-generated market summaries, newest first. */
export function fetchAnalysisHistory(limit = 5): Promise<AnalysisSummary[]> {
  return apiFetch<AnalysisSummary[]>(`/analysis/history?limit=${limit}`);
}

// ── Liquidation stats (Phase 26) ──────────────────────────────────────────────

export interface LiquidationWindow {
  count:      number;
  buy_count:  number;
  sell_count: number;
  total_usd:  number;
  buy_usd:    number;
  sell_usd:   number;
}

export interface LiquidationStats {
  symbol:  string;
  windows: Record<string, LiquidationWindow>;
}

/** Fetch rolling liquidation aggregates (5m / 15m / 1H) for a symbol. */
export function fetchLiquidationStats(symbol = 'BTCUSDT'): Promise<LiquidationStats> {
  return apiFetch<LiquidationStats>(`/liquidations/stats?symbol=${symbol}`);
}

// ── Strategy ───────────────────────────────────────────────────────────────────

export interface StrategyResult {
  valid: boolean;
  reason?: string;
  name?: string;
  entry_condition?: string;
  exit_condition?: string;
  timeframe?: string;
  stop_loss?: string;
  take_profit?: string;
  summary?: string;
}

/** Validate a trading strategy description via OpenAI → Claude pipeline. */
export async function validateStrategy(description: string): Promise<StrategyResult> {
  const response = await fetch(`${BASE_URL}/strategy/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<StrategyResult>;
}

// ── Chat ───────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply:      string;
  session_id: number;
}

/**
 * Send a message to the AI chatbot. Returns the reply and the session ID.
 * Pass sessionId on subsequent messages to continue the same persisted session.
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  model = 'claude',
  sessionId?: number,
  symbol = 'BTCUSDT',
): Promise<ChatResponse> {
  const response = await fetch(`${BASE_URL}/chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, model, session_id: sessionId ?? null, symbol }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<ChatResponse>;
}

// ── Chat history ───────────────────────────────────────────────────────────────

export interface ChatSessionSummary {
  id:             number;
  platform:       string;
  model:          string;
  title:          string | null;
  created_at:     string;
  last_active_at: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[];
}

/** List recent sessions (newest first). */
export function fetchChatSessions(limit = 50): Promise<ChatSessionSummary[]> {
  return apiFetch<ChatSessionSummary[]>(`/chat-history/sessions?limit=${limit}`);
}

/** Load a full session with all messages. */
export function fetchChatSession(id: number): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>(`/chat-history/sessions/${id}`);
}

/** Manually save a session to a .md file. */
export async function saveChatSession(id: number): Promise<{ saved_to: string }> {
  const response = await fetch(`${BASE_URL}/chat-history/sessions/${id}/save`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<{ saved_to: string }>;
}

/** Delete a chat session. */
export async function deleteChatSession(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/chat-history/sessions/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
}

// ── Service health (Phase 25) ──────────────────────────────────────────────────

export type ServiceStatus = 'ok' | 'stale' | 'dead';

export interface ServiceInfo {
  last_seen: string | null;
  status:    ServiceStatus;
}

export interface ServiceHealthResponse {
  services: Record<string, ServiceInfo>;
}

/** Fetch collector health — last data timestamp and status per service. */
export function fetchServiceHealth(): Promise<ServiceHealthResponse> {
  return apiFetch<ServiceHealthResponse>('/health/services');
}

// ── Derivatives context (Phase 27) ────────────────────────────────────────────

export interface FundingRateData {
  symbol:       string;
  timestamp:    string;
  funding_rate: number;
  mark_price:   number | null;
  index_price:  number | null;
  premium_pct:  number;
  sentiment:    'bullish' | 'bearish' | 'neutral';
}

export interface OpenInterestData {
  symbol:    string;
  timestamp: string;
  oi_value:  number;
  delta_1h:  number | null;
  delta_4h:  number | null;
  trend:     'expanding' | 'contracting' | 'stable';
}

export interface LSRatioEntry {
  long_pct:   number;
  short_pct:  number;
  updated_at: string;
}

export interface LSRatioData {
  symbol:         string;
  top_account:    LSRatioEntry | null;
  global_account: LSRatioEntry | null;
}

export async function fetchFundingRate(symbol = 'BTCUSDT'): Promise<FundingRateData | null> {
  const r = await fetch(`${BASE_URL}/derivatives/funding?symbol=${symbol}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json() as Promise<FundingRateData>;
}

export async function fetchOpenInterest(symbol = 'BTCUSDT'): Promise<OpenInterestData | null> {
  const r = await fetch(`${BASE_URL}/derivatives/oi?symbol=${symbol}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json() as Promise<OpenInterestData>;
}

export async function fetchLSRatio(symbol = 'BTCUSDT'): Promise<LSRatioData | null> {
  const r = await fetch(`${BASE_URL}/derivatives/ls-ratio?symbol=${symbol}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json() as Promise<LSRatioData>;
}

export interface FundingHistoryPoint {
  timestamp:    string;
  funding_rate: number;
}

export interface OIHistoryPoint {
  timestamp: string;
  oi_value:  number;
}

/** Fetch time-series funding rate snapshots for sparkline display. */
export function fetchFundingHistory(symbol = 'BTCUSDT', hours = 24): Promise<FundingHistoryPoint[]> {
  return apiFetch<FundingHistoryPoint[]>(`/derivatives/funding-history?symbol=${symbol}&hours=${hours}`);
}

/** Fetch time-series open interest snapshots for sparkline display. */
export function fetchOIHistory(symbol = 'BTCUSDT', hours = 24): Promise<OIHistoryPoint[]> {
  return apiFetch<OIHistoryPoint[]>(`/derivatives/oi-history?symbol=${symbol}&hours=${hours}`);
}

// ── Symbol registry + relative strength (Phase 28) ────────────────────────────

export interface SymbolInfo {
  symbol:            string;
  okx_instrument_id: string | null;
  binance_symbol:    string | null;
  display_name:      string;
  is_active:         boolean;
  sort_order:        number;
}

export interface RelativeStrengthEntry {
  symbol:         string;
  display_name:   string;
  last_price:     number;
  open_24h:       number;
  change_pct_24h: number;
}

/** Fetch all active tracked symbols. */
export function fetchSymbols(): Promise<SymbolInfo[]> {
  return apiFetch<SymbolInfo[]>('/symbols/');
}

/** Fetch 24H % change for all active symbols from OKX tickers. */
export function fetchRelativeStrength(): Promise<RelativeStrengthEntry[]> {
  return apiFetch<RelativeStrengthEntry[]>('/symbols/relative-strength');
}

// ── Event log (Phase 29) ──────────────────────────────────────────────────────

export interface EventLogEntry {
  id:         number;
  timestamp:  string;
  service:    string;
  event_type: string;
  symbol:     string | null;
  message:    string;
}

/** Fetch recent platform events, newest first. */
export function fetchEvents(limit = 100, sinceId = 0): Promise<EventLogEntry[]> {
  return apiFetch<EventLogEntry[]>(`/events/?limit=${limit}&since_id=${sinceId}`);
}

/** Fetch alert-service events (triggered / rearmed), newest first. */
export function fetchAlertEvents(limit = 50): Promise<EventLogEntry[]> {
  return apiFetch<EventLogEntry[]>(`/events/?service=alert&limit=${limit}`);
}

// ── Scanner (Phase 30) ────────────────────────────────────────────────────────

export interface ScannerSignal {
  type:       string;
  label:      string;
  severity:   'info' | 'warning' | 'alert';
  direction:  'bullish' | 'bearish' | 'neutral';
  value:      number;
  timeframe?: string;   // "1m" | "15m" | "1H" | undefined (legacy signals)
}

export interface SymbolScanResult {
  symbol:       string;
  signals:      ScannerSignal[];
  bull_score:   number;
  bear_score:   number;
  composite:    number;   // -1.0 (fully bearish) to +1.0 (fully bullish)
  bias:         'bullish' | 'bearish' | 'neutral';
  signal_count: number;
  error?:       string;
}

export interface ScannerResponse {
  symbols:    SymbolScanResult[];
  scanned_at: string;
}

/** Fetch signal scanner results for all tracked symbols. */
export function fetchScannerSignals(): Promise<ScannerResponse> {
  return apiFetch<ScannerResponse>('/scanner/signals');
}

export interface ScannerWorkerStatus {
  worker_running:        boolean;
  last_scan_at:          string | null;
  notifications_sent:    number;
  telegram_enabled:      boolean;
  scan_interval_seconds: number;
  composite_threshold:   number;
}

/** Fetch the status of the background scanner worker. */
export function fetchScannerStatus(): Promise<ScannerWorkerStatus> {
  return apiFetch<ScannerWorkerStatus>('/scanner/status');
}

export interface TradeSetup {
  symbol:       string;
  generated_at: string;
  scanner_bias: string;
  bias:         'long' | 'short';
  entry_zone:   { low: number; high: number };
  stop_loss:    number;
  take_profit:  number[];
  risk_reward:  number;
  reasoning:    string;
  key_risks:    string;
}

/** Request an AI-generated trade setup for the given symbol + scanner signals. */
export async function requestTradeSetup(
  symbol:  string,
  signals: ScannerSignal[],
  bias:    string,
): Promise<TradeSetup> {
  const response = await fetch(`${BASE_URL}/scanner/setup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ symbol, signals, bias }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { detail?: string })?.detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<TradeSetup>;
}

// ── Trade Journal (Phase 32) ──────────────────────────────────────────────────

export type JournalOutcome = 'pending' | 'tp1' | 'tp2' | 'tp3' | 'sl' | 'expired';

export interface JournalEntry {
  id:           number;
  created_at:   string;
  symbol:       string;
  bias:         'long' | 'short';
  entry_low:    number;
  entry_high:   number;
  stop_loss:    number;
  take_profit1: number;
  take_profit2: number;
  take_profit3: number;
  risk_reward:  number;
  reasoning:    string;
  key_risks:    string;
  scanner_bias: string | null;
  notes:        string | null;
  outcome:      JournalOutcome;
}

/** Fetch all journal entries with auto-computed outcomes. */
export function fetchJournal(): Promise<JournalEntry[]> {
  return apiFetch<JournalEntry[]>('/journal');
}

/** Save an AI trade setup to the journal. */
export async function saveToJournal(setup: TradeSetup, notes?: string | null): Promise<{ id: number }> {
  const response = await fetch(`${BASE_URL}/journal`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      symbol:       setup.symbol,
      bias:         setup.bias,
      entry_low:    setup.entry_zone.low,
      entry_high:   setup.entry_zone.high,
      stop_loss:    setup.stop_loss,
      take_profit:  setup.take_profit,
      risk_reward:  setup.risk_reward,
      reasoning:    setup.reasoning,
      key_risks:    setup.key_risks,
      scanner_bias: setup.scanner_bias,
      notes:        notes || null,
    }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { detail?: string })?.detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<{ id: number }>;
}

/** Delete a journal entry by ID. */
export async function deleteJournalEntry(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/journal/${id}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
}

// ── Journal Stats (Phase 34) ──────────────────────────────────────────────────

export interface JournalStats {
  total:      number;
  closed:     number;
  pending:    number;
  expired:    number;
  wins:       number;
  losses:     number;
  win_rate:   number | null;
  avg_rr:     number | null;
  expectancy: number | null;
  streak:     number;
  by_outcome: Record<JournalOutcome, number>;
  by_symbol:  Record<string, { wins: number; losses: number }>;
  by_bias:    { long: { wins: number; losses: number }; short: { wins: number; losses: number } };
}

/** Fetch aggregated performance statistics from all journal entries. */
export function fetchJournalStats(): Promise<JournalStats> {
  return apiFetch<JournalStats>('/journal/stats');
}

export interface JournalNotifierStatus {
  last_check_at:          string | null;
  notifications_sent:     number;
  check_interval_seconds: number;
  initialized:            boolean;
  telegram_enabled:       boolean;
}

/** Fetch the background journal-close notifier worker status. */
export function fetchJournalNotifierStatus(): Promise<JournalNotifierStatus> {
  return apiFetch<JournalNotifierStatus>('/journal/notifier-status');
}

export interface JournalInsights {
  summary:     string;
  patterns:    string[];
  biases:      string[];
  suggestions: string[];
}

/** Ask Claude to analyze trade journal patterns and return improvement suggestions. */
export function fetchJournalInsights(): Promise<JournalInsights> {
  return apiFetch<JournalInsights>('/journal/insights', { method: 'POST' });
}

// ── Price Levels (Phase 37) ───────────────────────────────────────────────────

export interface PriceLevel {
  price:          number;
  touches:        number;
  pct_from_price: number;
}

export interface PriceLevelsData {
  support:       PriceLevel[];
  resistance:    PriceLevel[];
  current_price: number | null;
}

/** Fetch key support and resistance levels for a symbol. */
export function fetchPriceLevels(symbol = 'BTCUSDT'): Promise<PriceLevelsData> {
  return apiFetch<PriceLevelsData>(`/price/levels?symbol=${symbol}`);
}

// ── Fear & Greed Index (Phase 49) ─────────────────────────────────────────────

export interface FearGreedData {
  value:      number;
  label:      string;
  updated_at: string;
}

/** Fetch the Crypto Fear & Greed Index (proxied from alternative.me). */
export function fetchFearGreed(): Promise<FearGreedData> {
  return apiFetch<FearGreedData>('/price/fear-greed');
}

// ── Global Market Stats (Phase 51) ────────────────────────────────────────────

export interface MarketGlobalData {
  btc_dominance:        number;
  eth_dominance:        number;
  total_market_cap_usd: number;
  market_cap_change_24h: number;
}

/** Fetch global crypto market stats (BTC/ETH dominance, total mcap) from CoinGecko. */
export function fetchMarketGlobal(): Promise<MarketGlobalData> {
  return apiFetch<MarketGlobalData>('/price/market-global');
}

// ── News Feed (Phase 52) ──────────────────────────────────────────────────────

export interface NewsItem {
  title:     string;
  url:       string;
  published: string;
  summary:   string;
  source:    string;
}

/** Fetch merged crypto news from CoinTelegraph + CoinDesk RSS feeds. */
export function fetchNewsFeed(limit = 40): Promise<NewsItem[]> {
  return apiFetch<NewsItem[]>(`/news/feed?limit=${limit}`);
}

// ── Factor Scoring (Phase 79) ─────────────────────────────────────────────────

export interface FactorObservation {
  factor_name:      string;
  symbol:           string | null;
  raw_value:        number | null;
  normalized_score: number;   // -1.0 to +1.0 (positive = bullish)
  direction:        'bullish' | 'bearish' | 'neutral';
  confidence:       number;   // 0.0 to 1.0
  source:           string;
}

export interface FactorSnapshot {
  symbol:                string;
  computed_at:           string;
  crypto_score:          number;   // -100 to +100
  regime:                string;   // "risk_on"|"neutral"|"fragile"|"risk_off"|"crowded_long"|"crowded_short"
  trade_environment:     string;   // "Favorable"|"Caution"|"Avoid"
  primary_driver:        string;   // "Derivatives"|"Liquidity"|"Sentiment"|"Momentum"
  derivatives_pressure:  number;   // -1.0 to +1.0
  liquidity_pressure:    number;   // -1.0 to +1.0
  factors:               FactorObservation[];
}

/** Compute and return the latest crypto factor snapshot for a symbol. */
export function fetchFactorSnapshot(symbol = 'BTCUSDT'): Promise<FactorSnapshot> {
  return apiFetch<FactorSnapshot>(`/factors/snapshot?symbol=${symbol}`);
}

// ── Macro Factor Scoring (Phase 81) ──────────────────────────────────────────

export interface MacroFactor {
  factor_name:      string;
  raw_value:        number | null;
  normalized_score: number;   // -1.0 to +1.0
  direction:        'bullish' | 'bearish' | 'neutral';
  confidence:       number;
  source:           string;
  as_of:            string | null;
}

export interface MacroSnapshot {
  computed_at:       string;
  macro_score:       number;  // -100 to +100
  macro_regime:      string;  // macro_bullish|macro_neutral|macro_cautious|macro_bearish
  trade_environment: string;  // Favorable|Caution|Avoid
  primary_driver:    string;
  fomc_days:         number | null;
  factors:           MacroFactor[];
}

/** Compute (or return cached) macro factor snapshot. First call may take ~5s. */
export function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  return apiFetch<MacroSnapshot>('/macro/snapshot');
}

// ── Context Scoring Engine (Phase 82) ────────────────────────────────────────

export interface ContextScore {
  computed_at:       string;
  symbol:            string;
  context_score:     number;           // -100..+100
  regime:            string;           // risk_on|neutral_bullish|neutral|neutral_bearish|risk_off
  trade_environment: string;           // Favorable|Cautious-Positive|Neutral|Caution|Avoid
  consensus:         'long' | 'short' | 'neutral';
  confidence:        number;           // 0..1
  crypto_score:      number | null;
  macro_score:       number | null;
  weights:           { crypto: number; macro: number };
  weights_version:   number;
}

/** Compute (or return cached) unified Context Score. 15-min cache. */
export function fetchContextScore(symbol: string = 'BTCUSDT'): Promise<ContextScore> {
  return apiFetch<ContextScore>(`/context/score?symbol=${symbol}`);
}

export interface ContextEvent {
  name:      string;
  date:      string;      // ISO date string e.g. "2026-06-17"
  days_away: number;
  type:      'fomc' | 'cpi' | 'nfp';
  impact:    'high' | 'medium' | 'low';
}

export interface ContextAiSummary {
  symbol:       string;
  summary:      string;
  generated_at: string;
}

/** Fetch the next N upcoming economic events (FOMC / CPI / NFP). */
export function fetchContextEvents(count: number = 6): Promise<ContextEvent[]> {
  return apiFetch<ContextEvent[]>(`/context/events?count=${count}`);
}

/** Fetch (or generate) AI market context narrative. Pass refresh=true to bypass 30-min cache. */
export function fetchContextAiSummary(
  symbol: string = 'BTCUSDT',
  refresh: boolean = false,
): Promise<ContextAiSummary> {
  return apiFetch<ContextAiSummary>(`/context/ai-summary?symbol=${symbol}&refresh=${refresh}`);
}

// ── Signal queue (Phase 85) ───────────────────────────────────────────────────

export type SignalStatus =
  | 'candidate' | 'active' | 'hit_tp' | 'hit_sl' | 'invalidated' | 'expired';

export interface Signal {
  id:            number;
  symbol:        string;
  timeframe:     string;
  direction:     'long' | 'short';
  status:        SignalStatus;
  source:        string;
  scanner_score: number | null;
  signal_count:  number;
  context_score: number | null;
  crypto_score:  number | null;
  macro_score:   number | null;
  regime:        string | null;
  entry_low:     number | null;
  entry_high:    number | null;
  stop_loss:     number | null;
  tp1:           number | null;
  tp2:           number | null;
  tp3:           number | null;
  risk_reward:   number | null;
  signal_labels: string[];
  created_at:    string;
  activated_at:  string | null;
  closed_at:     string | null;
  expires_at:    string | null;
  close_reason:  string | null;
  notes:         string | null;
}

export interface SignalListResponse {
  signals: Signal[];
  total:   number;
}

export function fetchSignals(
  status?: string,   // e.g. 'candidate,active'
  symbol?: string,
  limit = 50,
): Promise<SignalListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  if (symbol) params.set('symbol', symbol);
  return apiFetch<SignalListResponse>(`/signals/?${params}`);
}

export async function activateSignal(id: number, price?: number): Promise<Signal> {
  const response = await fetch(`${BASE_URL}/signals/${id}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: price ?? null }),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<Signal>;
}

export async function invalidateSignal(id: number, notes?: string): Promise<Signal> {
  const response = await fetch(`${BASE_URL}/signals/${id}/invalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: notes ?? null }),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<Signal>;
}

// ── Account state (Phase 86) ──────────────────────────────────────────────────

export interface AccountPosition {
  id:           number;
  symbol:       string;
  direction:    'long' | 'short';
  entry_price:  number;
  size_usd:     number;
  stop_loss:    number | null;
  tp1:          number | null;
  tp2:          number | null;
  tp3:          number | null;
  signal_id:    number | null;
  status:       string;
  opened_at:    string;
  closed_at:    string | null;
  close_price:  number | null;
  realized_pnl: number | null;
  notes:        string | null;
}

export interface AccountState {
  starting_capital:       number;
  currency:               string;
  current_equity:         number;
  realized_pnl:           number;
  open_count:             number;
  open_risk_usd:          number;
  open_risk_pct:          number;
  max_risk_per_trade_pct: number;
  max_risk_per_trade_usd: number;
  max_open_risk_pct:      number;
  daily_loss_limit_pct:   number;
  kill_switch_active:     boolean;
  positions:              AccountPosition[];
}

export interface AccountConfig {
  starting_capital:       number;
  currency:               string;
  max_risk_per_trade_pct: number;
  max_open_risk_pct:      number;
  daily_loss_limit_pct:   number;
  updated_at:             string | null;
}

export function fetchAccountState(): Promise<AccountState> {
  return apiFetch<AccountState>('/account/state');
}

export function fetchAccountConfig(): Promise<AccountConfig> {
  return apiFetch<AccountConfig>('/account/config');
}

export async function updateAccountConfig(patch: Partial<Omit<AccountConfig, 'currency' | 'updated_at'>>): Promise<AccountConfig> {
  const response = await fetch(`${BASE_URL}/account/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<AccountConfig>;
}

export async function openPosition(body: {
  symbol: string; direction: string; entry_price: number; size_usd: number;
  stop_loss?: number; tp1?: number; tp2?: number; tp3?: number;
  signal_id?: number; notes?: string;
}): Promise<AccountPosition> {
  const response = await fetch(`${BASE_URL}/account/positions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<AccountPosition>;
}

export async function closePosition(id: number, closePrice: number): Promise<AccountPosition> {
  const response = await fetch(`${BASE_URL}/account/positions/${id}/close`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ close_price: closePrice }),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<AccountPosition>;
}

export async function cancelPosition(id: number): Promise<AccountPosition> {
  const response = await fetch(`${BASE_URL}/account/positions/${id}/cancel`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<AccountPosition>;
}

// ── Risk Engine (Phase 87) ────────────────────────────────────────────────────

export interface RiskAssessment {
  verdict:               'approved' | 'blocked' | 'warning';
  reasons:               string[];
  warnings:              string[];
  suggested_size_usd:    number;
  max_allowed_usd:       number;
  risk_usd:              number;
  risk_pct_of_equity:    number;
  kill_switch_active:    boolean;
  current_equity:        number;
  open_risk_usd:         number;
  open_risk_pct:         number;
  max_open_risk_pct:     number;
  max_risk_per_trade_pct: number;
  daily_loss_limit_pct:  number;
}

export interface RiskSummary {
  kill_switch_active:     boolean;
  current_equity:         number;
  open_risk_usd:          number;
  open_risk_pct:          number;
  max_open_risk_pct:      number;
  open_risk_traffic:      'green' | 'orange' | 'red';
  daily_loss_pct:         number;
  daily_loss_limit_pct:   number;
  daily_loss_traffic:     'green' | 'orange' | 'red';
  max_risk_per_trade_pct: number;
  open_count:             number;
  realized_pnl:           number;
}

export function getRiskSummary(): Promise<RiskSummary> {
  return apiFetch<RiskSummary>('/risk/summary');
}

export async function assessTrade(params: {
  entry_price:        number;
  stop_loss:          number;
  size_usd?:          number;
  override_risk_pct?: number;
}): Promise<RiskAssessment> {
  const response = await fetch(`${BASE_URL}/risk/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json() as Promise<RiskAssessment>;
}

export async function toggleKillSwitch(active: boolean): Promise<{ kill_switch_active: boolean; message: string }> {
  const response = await fetch(`${BASE_URL}/risk/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (!response.ok) {
    const d = await response.json().catch(() => ({}));
    throw new Error((d as { detail?: string }).detail ?? `API error ${response.status}`);
  }
  return response.json();
}
