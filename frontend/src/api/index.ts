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

// ── Chat ───────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
}

/**
 * Send a message to the AI chatbot. Returns Claude's reply.
 * history is the prior turns in the conversation (not including the new message).
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  model = 'claude',
): Promise<ChatResponse> {
  const response = await fetch(`${BASE_URL}/chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, model }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<ChatResponse>;
}
