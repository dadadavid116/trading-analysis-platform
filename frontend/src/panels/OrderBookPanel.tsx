import { useState, useEffect, CSSProperties } from 'react';
import { fetchOrderBookSnapshot, OrderBookSnapshot } from '../api';
import { panelStyles } from './panelStyles';

/**
 * OrderBookPanel — BTC/USDT order book with visual depth chart.
 *
 * Layout:
 *   - Top: imbalance indicator (bid vs ask total volume ratio)
 *   - Middle: visual depth chart — cumulative bid (green, left) and ask
 *     (red, right) volume bars for the top 10 levels
 *   - Bottom: raw price/qty table (top 5 each side)
 *
 * The bar width is proportional to cumulative quantity so you can
 * immediately see where large liquidity walls sit.
 */
interface OrderBookPanelProps { symbol?: string; }

function OrderBookPanel({ symbol = 'BTCUSDT' }: OrderBookPanelProps) {
  const [snapshot, setSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetchOrderBookSnapshot(symbol)
        .then((data) => { setSnapshot(data); setError(null); setLoading(false); })
        .catch((err: Error) => { setError(err.message); setLoading(false); });
    };
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, [symbol]);

  const title = `Order Book — ${symbol.replace('USDT', '')}/USDT`;
  if (loading) return <div style={panelStyles.card}><h2 style={panelStyles.title}>{title}</h2><p style={panelStyles.muted}>Loading…</p></div>;
  if (error)   return <div style={panelStyles.card}><h2 style={panelStyles.title}>{title}</h2><p style={panelStyles.error}>Could not load order book data.</p></div>;
  if (!snapshot) return null;

  const DEPTH_LEVELS = 10;
  const TABLE_LEVELS = 5;

  // Compute cumulative quantities for depth bars
  const bidsCumulative: [number, number, number][] = []; // [price, qty, cumQty]
  const asksCumulative: [number, number, number][] = [];
  let cumBid = 0, cumAsk = 0;

  snapshot.bids.slice(0, DEPTH_LEVELS).forEach(([price, qty]) => {
    cumBid += qty;
    bidsCumulative.push([price, qty, cumBid]);
  });
  snapshot.asks.slice(0, DEPTH_LEVELS).forEach(([price, qty]) => {
    cumAsk += qty;
    asksCumulative.push([price, qty, cumAsk]);
  });

  const maxCum = Math.max(cumBid, cumAsk);

  // Imbalance: bid % of total top-10 volume
  const totalVol   = cumBid + cumAsk;
  const bidPct     = totalVol > 0 ? (cumBid / totalVol) * 100 : 50;
  const askPct     = 100 - bidPct;
  const imbalance  = bidPct > 55 ? 'bid heavy' : askPct > 55 ? 'ask heavy' : 'balanced';
  const imbalColor = bidPct > 55 ? '#4caf50' : askPct > 55 ? '#f44336' : '#aaa';

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>{title}</h2>

      {/* Imbalance indicator */}
      <div style={imbalRowStyle}>
        <span style={{ fontSize: '10px', color: '#666' }}>Imbalance</span>
        <div style={imbalTrackStyle}>
          <div style={{ width: `${bidPct}%`, height: '100%', backgroundColor: '#4caf50', borderRadius: '2px 0 0 2px' }} />
          <div style={{ width: `${askPct}%`, height: '100%', backgroundColor: '#f44336', borderRadius: '0 2px 2px 0' }} />
        </div>
        <span style={{ fontSize: '10px', color: imbalColor, fontWeight: 600 }}>
          {imbalance} ({bidPct.toFixed(0)}% / {askPct.toFixed(0)}%)
        </span>
      </div>

      {/* Depth chart */}
      <div style={depthChartStyle}>
        {/* Bids — left column, bars grow rightward from price column */}
        <div style={depthColStyle}>
          {bidsCumulative.map(([price, , cumQty], i) => {
            const pct = maxCum > 0 ? (cumQty / maxCum) * 100 : 0;
            return (
              <div key={i} style={depthRowStyle} title={`$${price.toLocaleString()} — cumulative ${cumQty.toFixed(2)} BTC`}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: `${pct}%`, height: '14px', backgroundColor: 'rgba(76,175,80,0.25)', borderRight: '2px solid #4caf50', transition: 'width 0.3s' }} />
                </div>
                <span style={depthPriceStyle}>${price.toLocaleString()}</span>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={depthDividerStyle} />

        {/* Asks — right column, bars grow leftward from price column */}
        <div style={depthColStyle}>
          {asksCumulative.map(([price, , cumQty], i) => {
            const pct = maxCum > 0 ? (cumQty / maxCum) * 100 : 0;
            return (
              <div key={i} style={depthRowStyle} title={`$${price.toLocaleString()} — cumulative ${cumQty.toFixed(2)} BTC`}>
                <span style={depthPriceStyle}>${price.toLocaleString()}</span>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ width: `${pct}%`, height: '14px', backgroundColor: 'rgba(244,67,54,0.25)', borderLeft: '2px solid #f44336', transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Raw table — top 5 each side */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <p style={{ ...panelStyles.label, color: '#4caf50', marginBottom: '4px' }}>BIDS</p>
          {snapshot.bids.slice(0, TABLE_LEVELS).map(([price, qty], i) => (
            <div key={i} style={panelStyles.row}>
              <span style={{ ...panelStyles.value, color: '#4caf50', fontSize: '11px' }}>${price.toLocaleString()}</span>
              <span style={{ ...panelStyles.label, fontSize: '10px' }}>{qty.toFixed(3)}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ ...panelStyles.label, color: '#f44336', marginBottom: '4px' }}>ASKS</p>
          {snapshot.asks.slice(0, TABLE_LEVELS).map(([price, qty], i) => (
            <div key={i} style={panelStyles.row}>
              <span style={{ ...panelStyles.value, color: '#f44336', fontSize: '11px' }}>${price.toLocaleString()}</span>
              <span style={{ ...panelStyles.label, fontSize: '10px' }}>{qty.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OrderBookPanel;

// ── Styles ────────────────────────────────────────────────────────────────────

const imbalRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
  flexShrink: 0,
};

const imbalTrackStyle: CSSProperties = {
  flex: 1,
  height: '6px',
  borderRadius: '3px',
  display: 'flex',
  overflow: 'hidden',
  backgroundColor: '#222',
};

const depthChartStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  flexShrink: 0,
};

const depthColStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
};

const depthRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: '16px',
};

const depthPriceStyle: CSSProperties = {
  fontSize: '9px',
  color: '#888',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  width: '68px',
};

const depthDividerStyle: CSSProperties = {
  width: '1px',
  backgroundColor: '#2a2a2e',
  flexShrink: 0,
  alignSelf: 'stretch',
};
