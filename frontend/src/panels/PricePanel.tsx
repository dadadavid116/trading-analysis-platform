import { useState, useEffect } from 'react';
import { fetchLatestPrice, PriceCandle } from '../api';
import { panelStyles } from './panelStyles';

/**
 * PricePanel — displays the latest BTC price candle.
 *
 * Phase 3: fetches from the backend API stub.
 * In Phase 5 (mock data flow) this will render against real data.
 * A Recharts line chart can be added here [Later] using fetchPriceHistory().
 */
function PricePanel() {
  const [candle, setCandle] = useState<PriceCandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetchLatestPrice()
        .then((data) => {
          setCandle(data);
          setError(null);   // clear any previous error on success
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message);
          setLoading(false);
        });
    };

    fetchData();                                  // fetch immediately on mount
    const interval = setInterval(fetchData, 15_000); // then re-fetch every 15 s
    return () => clearInterval(interval);         // clean up on unmount
  }, []);

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>Price — BTC/USDT</h2>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {error && (
        <p style={panelStyles.error}>
          Could not load price data — check that the API is running.
        </p>
      )}

      {candle && !loading && (
        <div style={panelStyles.dataGrid}>
          <DataRow label="Close"  value={`$${candle.close.toLocaleString()}`} highlight />
          <DataRow label="Open"   value={`$${candle.open.toLocaleString()}`} />
          <DataRow label="High"   value={`$${candle.high.toLocaleString()}`} />
          <DataRow label="Low"    value={`$${candle.low.toLocaleString()}`} />
          <DataRow label="Volume" value={candle.volume.toLocaleString()} />
          <DataRow label="Time"   value={new Date(candle.timestamp).toLocaleTimeString()} />
        </div>
      )}

      {/* [Later] Add a Recharts LineChart here using fetchPriceHistory() */}
    </div>
  );
}

export default PricePanel;

// ── Tiny helper component ─────────────────────────────────────────────────────

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={panelStyles.row}>
      <span style={panelStyles.label}>{label}</span>
      <span style={highlight ? panelStyles.valueHighlight : panelStyles.value}>{value}</span>
    </div>
  );
}
