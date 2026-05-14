import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { fetchLatestPrice } from '../api';
import { panelStyles } from './panelStyles';

// ── Types ─────────────────────────────────────────────────────────────────────

type Symbol    = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';
type Direction = 'long' | 'short';

interface Position {
  id:         string;
  symbol:     Symbol;
  direction:  Direction;
  entryPrice: number;
  sizeUsd:    number;
  label:      string;
}

const SYMBOLS: Symbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const STORAGE_KEY = 'portfolio_positions_v1';

function symLabel(s: Symbol) {
  return s.replace('USDT', '/USDT');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadPositions(): Position[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePositions(positions: Position[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortfolioPanel() {
  const [positions,    setPositions]    = useState<Position[]>(loadPositions);
  const [prices,       setPrices]       = useState<Record<string, number>>({});
  const [showForm,     setShowForm]     = useState(false);

  // Form state
  const [fSymbol,    setFSymbol]    = useState<Symbol>('BTCUSDT');
  const [fDir,       setFDir]       = useState<Direction>('long');
  const [fEntry,     setFEntry]     = useState('');
  const [fSize,      setFSize]      = useState('');
  const [fLabel,     setFLabel]     = useState('');

  // Fetch live prices for every unique symbol in the portfolio
  const refreshPrices = useCallback(async () => {
    const syms = Array.from(new Set(positions.map((p) => p.symbol)));
    if (syms.length === 0) return;
    const results = await Promise.allSettled(syms.map((s) => fetchLatestPrice(s)));
    const updated: Record<string, number> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') updated[syms[i]] = r.value.close;
    });
    setPrices((prev) => ({ ...prev, ...updated }));
  }, [positions]);

  useEffect(() => {
    refreshPrices();
    const id = setInterval(refreshPrices, 5_000);
    return () => clearInterval(id);
  }, [refreshPrices]);

  // Persist on change
  useEffect(() => { savePositions(positions); }, [positions]);

  const addPosition = () => {
    const entry = parseFloat(fEntry);
    const size  = parseFloat(fSize);
    if (!entry || !size || entry <= 0 || size <= 0) return;
    const pos: Position = {
      id:         uid(),
      symbol:     fSymbol,
      direction:  fDir,
      entryPrice: entry,
      sizeUsd:    size,
      label:      fLabel.trim() || '',
    };
    setPositions((prev) => [...prev, pos]);
    setFEntry(''); setFSize(''); setFLabel('');
    setShowForm(false);
  };

  const removePosition = (id: string) =>
    setPositions((prev) => prev.filter((p) => p.id !== id));

  // P&L helpers
  const pnlPct = (p: Position): number | null => {
    const cur = prices[p.symbol];
    if (!cur) return null;
    const raw = (cur - p.entryPrice) / p.entryPrice * 100;
    return p.direction === 'long' ? raw : -raw;
  };

  const pnlUsd = (p: Position): number | null => {
    const pct = pnlPct(p);
    return pct === null ? null : p.sizeUsd * pct / 100;
  };

  const totalPnl = positions.reduce((sum, p) => {
    const u = pnlUsd(p);
    return u === null ? sum : sum + u;
  }, 0);

  const hasPrices = positions.some((p) => prices[p.symbol] !== undefined);

  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const fmtUsd = (v: number) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
  const fmtPrice = (v: number) =>
    v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v.toFixed(4);

  return (
    <div style={panelStyles.card}>
      {/* Header */}
      <div style={headerRowStyle}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Portfolio
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasPrices && positions.length > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: totalPnl >= 0 ? '#66bb6a' : '#ef5350' }}>
              {fmtUsd(totalPnl)}
            </span>
          )}
          <button style={addBtnStyle} onClick={() => setShowForm((v) => !v)}>
            {showForm ? '✕' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Add position form */}
      {showForm && (
        <div style={formStyle}>
          <div style={formRowStyle}>
            <label style={labelStyle}>Symbol</label>
            <select style={selectStyle} value={fSymbol} onChange={(e) => setFSymbol(e.target.value as Symbol)}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{symLabel(s)}</option>)}
            </select>
          </div>
          <div style={formRowStyle}>
            <label style={labelStyle}>Direction</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['long', 'short'] as Direction[]).map((d) => (
                <button
                  key={d}
                  style={{ ...dirBtnStyle, backgroundColor: fDir === d ? (d === 'long' ? '#1a3a1a' : '#3a1a1a') : '#111114',
                    color: fDir === d ? (d === 'long' ? '#66bb6a' : '#ef5350') : '#555',
                    borderColor: fDir === d ? (d === 'long' ? '#66bb6a' : '#ef5350') : '#2a2a2e' }}
                  onClick={() => setFDir(d)}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={formRowStyle}>
            <label style={labelStyle}>Entry $</label>
            <input
              style={inputStyle}
              type="number"
              placeholder="e.g. 65000"
              value={fEntry}
              onChange={(e) => setFEntry(e.target.value)}
            />
          </div>
          <div style={formRowStyle}>
            <label style={labelStyle}>Size $</label>
            <input
              style={inputStyle}
              type="number"
              placeholder="e.g. 1000"
              value={fSize}
              onChange={(e) => setFSize(e.target.value)}
            />
          </div>
          <div style={formRowStyle}>
            <label style={labelStyle}>Note</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="optional label"
              value={fLabel}
              onChange={(e) => setFLabel(e.target.value)}
              maxLength={40}
            />
          </div>
          <button style={submitBtnStyle} onClick={addPosition}>Add Position</button>
        </div>
      )}

      {/* Positions list */}
      {positions.length === 0 && !showForm && (
        <p style={panelStyles.muted}>No positions. Click + Add to track one.</p>
      )}

      {positions.length > 0 && (
        <div style={{ overflowY: 'auto', flex: 1, marginTop: '8px' }}>
          {positions.map((p) => {
            const pct = pnlPct(p);
            const usd = pnlUsd(p);
            const cur = prices[p.symbol];
            const isPos = pct !== null && pct >= 0;
            return (
              <div key={p.id} style={posCardStyle}>
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#c0c0c0' }}>
                      {symLabel(p.symbol)}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, marginLeft: '6px',
                      color: p.direction === 'long' ? '#66bb6a' : '#ef5350',
                    }}>
                      {p.direction.toUpperCase()}
                    </span>
                    {p.label && (
                      <span style={{ fontSize: '9px', color: '#555', marginLeft: '6px' }}>{p.label}</span>
                    )}
                  </div>
                  <button style={removeBtnStyle} onClick={() => removePosition(p.id)}>✕</button>
                </div>

                {/* Price row */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '5px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={statLabelStyle}>Entry</div>
                    <div style={statValueStyle}>${fmtPrice(p.entryPrice)}</div>
                  </div>
                  <div>
                    <div style={statLabelStyle}>Current</div>
                    <div style={statValueStyle}>{cur ? `$${fmtPrice(cur)}` : '…'}</div>
                  </div>
                  <div>
                    <div style={statLabelStyle}>Size</div>
                    <div style={statValueStyle}>${p.sizeUsd.toLocaleString()}</div>
                  </div>
                  {pct !== null && (
                    <div>
                      <div style={statLabelStyle}>PnL</div>
                      <div style={{ ...statValueStyle, color: isPos ? '#66bb6a' : '#ef5350' }}>
                        {fmtPct(pct)} {usd !== null ? `(${fmtUsd(usd)})` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Total row */}
          {hasPrices && positions.length > 1 && (
            <div style={totalRowStyle}>
              <span style={{ fontSize: '10px', color: '#555', fontWeight: 700 }}>TOTAL P&amp;L</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: totalPnl >= 0 ? '#66bb6a' : '#ef5350' }}>
                {fmtUsd(totalPnl)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const headerRowStyle: CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  borderBottom:   '1px solid #2a2a2e',
  paddingBottom:  '8px',
  flexShrink:     0,
};

const formStyle: CSSProperties = {
  backgroundColor: '#111114',
  border:          '1px solid #2a2a2e',
  borderRadius:    '6px',
  padding:         '10px',
  marginTop:       '8px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '8px',
  flexShrink:      0,
};

const formRowStyle: CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         '8px',
};

const labelStyle: CSSProperties = {
  fontSize:  '9px',
  fontWeight: 700,
  color:     '#555',
  width:     '52px',
  flexShrink: 0,
  letterSpacing: '0.05em',
};

const inputStyle: CSSProperties = {
  flex:            1,
  backgroundColor: '#0d0d10',
  border:          '1px solid #2a2a2e',
  borderRadius:    '4px',
  color:           '#d0d0d0',
  fontSize:        '11px',
  padding:         '4px 8px',
  outline:         'none',
};

const selectStyle: CSSProperties = {
  ...{} as CSSProperties,
  flex:            1,
  backgroundColor: '#0d0d10',
  border:          '1px solid #2a2a2e',
  borderRadius:    '4px',
  color:           '#d0d0d0',
  fontSize:        '11px',
  padding:         '4px 6px',
};

const dirBtnStyle: CSSProperties = {
  border:       '1px solid',
  borderRadius: '4px',
  cursor:       'pointer',
  fontSize:     '11px',
  fontWeight:   700,
  padding:      '3px 12px',
};

const submitBtnStyle: CSSProperties = {
  backgroundColor: '#1a2a4a',
  border:          '1px solid #2a4a8a',
  borderRadius:    '4px',
  color:           '#90b8e0',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      700,
  padding:         '5px 12px',
  alignSelf:       'flex-end',
};

const addBtnStyle: CSSProperties = {
  backgroundColor: '#1a2a4a',
  border:          '1px solid #2a4a8a',
  borderRadius:    '4px',
  color:           '#90b8e0',
  cursor:          'pointer',
  fontSize:        '10px',
  fontWeight:      700,
  padding:         '3px 8px',
};

const posCardStyle: CSSProperties = {
  backgroundColor: '#111114',
  border:          '1px solid #2a2a2e',
  borderRadius:    '5px',
  padding:         '8px 10px',
  marginBottom:    '6px',
};

const removeBtnStyle: CSSProperties = {
  background:   'transparent',
  border:       'none',
  color:        '#444',
  cursor:       'pointer',
  fontSize:     '11px',
  padding:      '0 2px',
  lineHeight:   1,
};

const statLabelStyle: CSSProperties = {
  fontSize:      '8px',
  color:         '#555',
  fontWeight:    700,
  letterSpacing: '0.05em',
  marginBottom:  '1px',
};

const statValueStyle: CSSProperties = {
  fontSize:   '11px',
  fontWeight: 700,
  color:      '#c0c0c0',
  fontFamily: 'monospace',
};

const totalRowStyle: CSSProperties = {
  display:         'flex',
  justifyContent:  'space-between',
  alignItems:      'center',
  borderTop:       '1px solid #2a2a2e',
  paddingTop:      '8px',
  marginTop:       '4px',
};
