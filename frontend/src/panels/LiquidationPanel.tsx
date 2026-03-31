import { useState, useEffect } from 'react';
import { fetchRecentLiquidations, LiquidationEvent } from '../api';
import { panelStyles } from './panelStyles';

/**
 * LiquidationPanel — displays recent BTC/USDT liquidation events.
 *
 * Data source: live Binance Futures forceOrder stream via the liquidation collector (Phase 6).
 * Polls the API every 10 seconds. Events appear as they occur on Binance Futures.
 */
function LiquidationPanel() {
  const [events, setEvents] = useState<LiquidationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetchRecentLiquidations(10)
        .then((data) => {
          setEvents(data);
          setError(null);   // clear any previous error on success
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message);
          setLoading(false);
        });
    };

    fetchData();                                  // fetch immediately on mount
    const interval = setInterval(fetchData, 10_000); // then re-fetch every 10 s
    return () => clearInterval(interval);         // clean up on unmount
  }, []);

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>Liquidations — BTC/USDT</h2>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {error && (
        <p style={panelStyles.error}>
          Could not load liquidation data — check that the API is running.
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p style={panelStyles.muted}>No recent liquidations.</p>
      )}

      {events.length > 0 && (
        <table style={panelStyles.table}>
          <thead>
            <tr>
              <th style={panelStyles.th}>Time</th>
              <th style={panelStyles.th}>Side</th>
              <th style={panelStyles.th}>Price</th>
              <th style={panelStyles.th}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id}>
                <td style={panelStyles.td}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                <td style={{ ...panelStyles.td, color: ev.side === 'buy' ? '#4caf50' : '#f44336' }}>
                  {ev.side.toUpperCase()}
                </td>
                <td style={panelStyles.td}>${ev.price.toLocaleString()}</td>
                <td style={panelStyles.td}>{ev.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default LiquidationPanel;
