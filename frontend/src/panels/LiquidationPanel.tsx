import { useState, useEffect, CSSProperties } from 'react';
import { fetchRecentLiquidations, fetchLiquidationStats, LiquidationEvent, LiquidationStats } from '../api';
import { panelStyles } from './panelStyles';

/**
 * LiquidationPanel — recent BTC liquidation events plus rolling window stats.
 *
 * Stats bar: count and total USD liquidated in the last 5m / 15m / 1H,
 * with buy (long liq) vs sell (short liq) breakdown shown as a colour bar.
 *
 * Event table: last 10 individual events, newest first.
 */
function LiquidationPanel() {
  const [events, setEvents] = useState<LiquidationEvent[]>([]);
  const [stats, setStats]   = useState<LiquidationStats | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      Promise.all([fetchRecentLiquidations(10), fetchLiquidationStats()])
        .then(([evs, s]) => {
          setEvents(evs);
          setStats(s);
          setError(null);
          setLoading(false);
        })
        .catch((err: Error) => { setError(err.message); setLoading(false); });
    };
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, []);

  const fmtUsd = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>Liquidations — BTC/USDT</h2>

      {/* Rolling stats bar */}
      {stats && (
        <div style={statsBarStyle}>
          {(['5m', '15m', '1h'] as const).map((w) => {
            const d = stats.windows[w];
            if (!d) return null;
            const buyPct  = d.total_usd > 0 ? (d.buy_usd  / d.total_usd) * 100 : 50;
            const sellPct = 100 - buyPct;
            return (
              <div key={w} style={statsCellStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '9px', color: '#666', fontWeight: 600 }}>{w.toUpperCase()}</span>
                  <span style={{ fontSize: '9px', color: '#aaa' }}>{d.count} events</span>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#ddd', marginBottom: '3px' }}>
                  {fmtUsd(d.total_usd)}
                </div>
                {/* Buy / sell fill bar */}
                <div style={fillBarTrackStyle} title={`Buy liq: ${fmtUsd(d.buy_usd)} | Sell liq: ${fmtUsd(d.sell_usd)}`}>
                  <div style={{ width: `${buyPct}%`,  height: '100%', backgroundColor: '#4caf50' }} />
                  <div style={{ width: `${sellPct}%`, height: '100%', backgroundColor: '#f44336' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontSize: '9px', color: '#4caf50' }}>↑{d.buy_count}</span>
                  <span style={{ fontSize: '9px', color: '#f44336' }}>{d.sell_count}↓</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event table */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && <p style={panelStyles.muted}>Loading…</p>}
        {error && <p style={panelStyles.error}>Could not load liquidation data.</p>}
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
                <th style={panelStyles.th}>USD</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td style={panelStyles.td}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                  <td style={{ ...panelStyles.td, color: ev.side === 'buy' ? '#4caf50' : '#f44336' }}>
                    {ev.side === 'buy' ? '↑ LONG' : '↓ SHORT'}
                  </td>
                  <td style={panelStyles.td}>${ev.price.toLocaleString()}</td>
                  <td style={panelStyles.td}>{fmtUsd(ev.price * ev.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default LiquidationPanel;

// ── Styles ────────────────────────────────────────────────────────────────────

const statsBarStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  marginBottom: '8px',
  flexShrink: 0,
};

const statsCellStyle: CSSProperties = {
  flex: 1,
  backgroundColor: '#111114',
  border: '1px solid #2a2a2e',
  borderRadius: '5px',
  padding: '5px 6px',
};

const fillBarTrackStyle: CSSProperties = {
  display: 'flex',
  height: '4px',
  borderRadius: '2px',
  overflow: 'hidden',
  backgroundColor: '#222',
};
