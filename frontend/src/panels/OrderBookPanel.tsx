import { useState, useEffect } from 'react';
import { fetchOrderBookSnapshot, OrderBookSnapshot } from '../api';
import { panelStyles } from './panelStyles';

/**
 * OrderBookPanel — displays the latest BTC order book snapshot.
 *
 * Phase 3: fetches from the backend API stub.
 * Shows the top 5 bid and ask levels.
 * In Phase 5 (mock data flow) this will render against real data.
 */
function OrderBookPanel() {
  const [snapshot, setSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetchOrderBookSnapshot()
        .then((data) => {
          setSnapshot(data);
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

  // Show top N levels
  const LEVELS = 5;

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>Order Book — BTC/USDT</h2>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {error && (
        <p style={panelStyles.error}>
          Could not load order book data — check that the API is running.
        </p>
      )}

      {snapshot && !loading && (
        <div style={{ display: 'flex', gap: '16px' }}>
          {/* Asks (sell side) */}
          <div style={{ flex: 1 }}>
            <p style={{ ...panelStyles.label, color: '#f44336', marginBottom: '6px' }}>ASKS (Sell)</p>
            {snapshot.asks.slice(0, LEVELS).map(([price, qty], i) => (
              <div key={i} style={panelStyles.row}>
                <span style={{ ...panelStyles.value, color: '#f44336' }}>${price.toLocaleString()}</span>
                <span style={panelStyles.label}>{qty.toFixed(4)}</span>
              </div>
            ))}
          </div>

          {/* Bids (buy side) */}
          <div style={{ flex: 1 }}>
            <p style={{ ...panelStyles.label, color: '#4caf50', marginBottom: '6px' }}>BIDS (Buy)</p>
            {snapshot.bids.slice(0, LEVELS).map(([price, qty], i) => (
              <div key={i} style={panelStyles.row}>
                <span style={{ ...panelStyles.value, color: '#4caf50' }}>${price.toLocaleString()}</span>
                <span style={panelStyles.label}>{qty.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderBookPanel;
