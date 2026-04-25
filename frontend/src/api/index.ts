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
async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// ── Endpoint functions ─────────────────────────────────────────────────────────

/** Fetch the latest BTC price candle. */
export function fetchLatestPrice(): Promise<PriceCandle> {
  return apiFetch<PriceCandle>('/price/latest');
}

/** Fetch paginated BTC candle history. */
export function fetchPriceHistory(limit = 60): Promise<PriceCandle[]> {
  return apiFetch<PriceCandle[]>(`/price/history?limit=${limit}`);
}

export interface KlineCandle {
  time: number;   // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Fetch OHLCV candles for a given interval from Binance (via the backend). */
export function fetchKlines(interval: string, limit = 100): Promise<KlineCandle[]> {
  return apiFetch<KlineCandle[]>(`/price/klines?interval=${interval}&limit=${limit}`);
}

/** Fetch recent liquidation events. */
export function fetchRecentLiquidations(limit = 20): Promise<LiquidationEvent[]> {
  return apiFetch<LiquidationEvent[]>(`/liquidations/recent?limit=${limit}`);
}

/** Fetch the latest order book snapshot. */
export function fetchOrderBookSnapshot(): Promise<OrderBookSnapshot> {
  return apiFetch<OrderBookSnapshot>('/orderbook/snapshot');
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

export async function requestChartAnalysis(timeframe: string, userBias = ''): Promise<ChartAnalysis> {
  const response = await fetch(`${BASE_URL}/analysis/chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeframe, user_bias: userBias }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { detail?: string })?.detail ?? `API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<ChartAnalysis>;
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
): Promise<ChatResponse> {
  const response = await fetch(`${BASE_URL}/chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, model, session_id: sessionId ?? null }),
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
