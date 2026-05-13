import { useState, useEffect, CSSProperties } from 'react';
import { fetchKlines, KlineCandle } from '../api';
import { panelStyles } from './panelStyles';

const SYMBOLS = [
  { key: 'BTCUSDT', label: 'BTC/USDT' },
  { key: 'ETHUSDT', label: 'ETH/USDT' },
  { key: 'SOLUSDT', label: 'SOL/USDT' },
];

const COLS: { key: string; label: string; interval: string }[] = [
  { key: '5m',  label: '5m',  interval: '5m'  },
  { key: '15m', label: '15m', interval: '15m' },
  { key: '1h',  label: '1H',  interval: '1h'  },
  { key: '4h',  label: '4H',  interval: '4h'  },
  { key: '1d',  label: '24H', interval: '1d'  },
];

interface RowData {
  price: number;
  pct:   Record<string, number>;
}

function pctChange(candles: KlineCandle[]): number {
  if (candles.length < 2) return 0;
  const prev = candles[0];
  const curr = candles[candles.length - 1];
  return prev.close === 0 ? 0 : (curr.close - prev.close) / prev.close * 100;
}

function heatBg(pct: number): string {
  if (Math.abs(pct) < 0.05) return '#111114';
  const alpha = Math.min(Math.abs(pct) / 3, 1) * 0.65 + 0.1;
  return pct > 0
    ? `rgba(38,166,154,${alpha.toFixed(2)})`
    : `rgba(239,83,80,${alpha.toFixed(2)})`;
}

function heatColor(pct: number): string {
  if (Math.abs(pct) < 0.05) return '#444';
  return pct > 0 ? '#66bb6a' : '#ef5350';
}

export default function HeatmapPanel() {
  const [rows,      setRows]      = useState<Record<string, RowData>>({});
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    try {
      const result: Record<string, RowData> = {};
      await Promise.all(
        SYMBOLS.map(async ({ key }) => {
          const colData = await Promise.all(
            COLS.map(({ key: colKey, interval }) =>
              fetchKlines(interval, 2, key)
                .then((c) => ({ colKey, pct: pctChange(c), last: c[c.length - 1] }))
                .catch(() => ({ colKey, pct: 0, last: null as KlineCandle | null })),
            ),
          );
          const ref5m = colData.find((r) => r.colKey === '5m');
          result[key] = {
            price: ref5m?.last?.close ?? 0,
            pct:   Object.fromEntries(colData.map(({ colKey, pct }) => [colKey, pct])),
          };
        }),
      );
      setRows(result);
      setUpdatedAt(new Date());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const fmtPct   = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  const fmtPrice = (p: number) =>
    p >= 1000
      ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${p.toFixed(2)}`;

  return (
    <div style={panelStyles.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Market Heatmap
        </h2>
        {updatedAt && (
          <span style={{ fontSize: '9px', color: '#444' }}>{updatedAt.toLocaleTimeString()}</span>
        )}
      </div>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {!loading && (
        <>
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Asset</th>
                  <th style={thStyle}>Price</th>
                  {COLS.map(({ key, label }) => (
                    <th key={key} style={thStyle}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYMBOLS.map(({ key, label }) => {
                  const row = rows[key];
                  return (
                    <tr key={key}>
                      <td style={assetCellStyle}>{label}</td>
                      <td style={priceCellStyle}>
                        {row ? fmtPrice(row.price) : '—'}
                      </td>
                      {COLS.map(({ key: colKey }) => {
                        const pct = row?.pct[colKey] ?? 0;
                        return (
                          <td
                            key={colKey}
                            style={{
                              ...baseCellStyle,
                              backgroundColor: heatBg(pct),
                              color:           heatColor(pct),
                            }}
                          >
                            {row ? fmtPct(pct) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={legendStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {[-3, -1.5, -0.5, 0, 0.5, 1.5, 3].map((v) => (
                <div
                  key={v}
                  style={{
                    width: '18px', height: '10px', borderRadius: '2px',
                    backgroundColor: Math.abs(v) < 0.05 ? '#111114' : heatBg(v),
                    border: '1px solid #1e1e22',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '9px', color: '#333' }}>
              −3% → 0 → +3% · % change since previous period close · refreshes every 60 s
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const thStyle: CSSProperties = {
  fontSize:      '9px',
  fontWeight:    700,
  color:         '#555',
  letterSpacing: '0.06em',
  textAlign:     'right',
  padding:       '3px 6px',
  borderBottom:  '1px solid #1e1e22',
  whiteSpace:    'nowrap',
};

const baseCellStyle: CSSProperties = {
  padding:      '7px 10px',
  textAlign:    'right',
  fontSize:     '11px',
  fontWeight:   700,
  fontFamily:   'monospace',
  border:       '1px solid #1e1e2200',
  borderRadius: '3px',
  whiteSpace:   'nowrap',
  transition:   'background-color 0.3s ease',
};

const assetCellStyle: CSSProperties = {
  fontSize:        '11px',
  fontWeight:      700,
  color:           '#c0c0c0',
  padding:         '7px 10px',
  whiteSpace:      'nowrap',
  backgroundColor: '#111114',
  border:          '1px solid #1e1e22',
  borderRadius:    '3px',
};

const priceCellStyle: CSSProperties = {
  fontSize:        '11px',
  fontFamily:      'monospace',
  fontWeight:      600,
  color:           '#e0e0e0',
  padding:         '7px 10px',
  textAlign:       'right',
  whiteSpace:      'nowrap',
  backgroundColor: '#111114',
  border:          '1px solid #1e1e22',
  borderRadius:    '3px',
};

const legendStyle: CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         '8px',
  marginTop:   '10px',
  paddingTop:  '8px',
  borderTop:   '1px solid #1e1e22',
  flexWrap:    'wrap',
};
