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
 * When VITE_DASHBOARD_API_KEY is set (production), every request includes an
 * ``X-API-Key`` header. In local development the env var is left empty and the
 * backend skips key validation automatically.
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

// ── Auth helpers ───────────────────────────────────────────────────────────────

const _API_KEY = import.meta.env.VITE_DASHBOARD_API_KEY as string | undefined;

/**
 * Returns an object with the X-API-Key header when the env var is set,
 * or an empty object for local development (auth disabled).
 */
function authHeader(): Record<string, string> {
  return _API_KEY ? { 'X-API-Key': _API_KEY } : {};
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_URL = '/api';

/**
 * Generic fetch wrapper. Throws an error if the response is not OK.
 */
async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: authHeader(),
  });
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
  const response = await fetch(`${BASE_URL}/analysis/latest`, {
    headers: authHeader(),
  });
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
    headers: { 'Content-Type': 'application/json', ...authHeader() },
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
    headers: authHeader(),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
}
