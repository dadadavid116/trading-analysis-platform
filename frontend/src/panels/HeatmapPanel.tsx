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

function toReturns(candles: KlineCandle[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close !== 0)
      ret.push(candles[i].close / candles[i - 1].close - 1);
  }
  return ret;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = sumA / n, mB = sumB / n;
  let num = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - mA, db = b[i] - mB;
    num += da * db; varA += da * da; varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : num / denom;
}

function corrBg(v: number): string {
  const a = Math.min(Math.abs(v), 1) * 0.6 + 0.08;
  return v > 0.1
    ? `rgba(38,166,154,${a.toFixed(2)})`
    : v < -0.1
    ? `rgba(239,83,80,${a.toFixed(2)})`
    : '#111114';
}

function corrColor(v: number): string {
  if (v > 0.1)  return '#66bb6a';
  if (v < -0.1) return '#ef5350';
  return '#555';
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
  const [rows,       setRows]       = useState<Record<string, RowData>>({});
  const [corrMatrix, setCorrMatrix] = useState<number[][]>([]);
  const [loading,    setLoading]    = useState(true);
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(null);

  const load = async () => {
    try {
      const result: Record<string, RowData> = {};

      // Fetch heatmap columns + 30D daily candles for correlation in parallel
      const [, dailyCandles] = await Promise.all([
        Promise.all(
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
        ),
        Promise.all(
          SYMBOLS.map(({ key }) =>
            fetchKlines('1d', 31, key).catch(() => [] as KlineCandle[]),
          ),
        ),
      ]);

      setRows(result);

      const returns = dailyCandles.map(toReturns);
      setCorrMatrix(
        SYMBOLS.map((_, i) => SYMBOLS.map((_, j) => pearson(returns[i], returns[j]))),
      );

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

          {/* Correlation matrix */}
          {corrMatrix.length === SYMBOLS.length && (
            <div style={{ marginTop: '12px', borderTop: '1px solid #1e1e22', paddingTop: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#555', letterSpacing: '0.06em', marginBottom: '6px' }}>
                30D RETURN CORRELATION
              </div>
              <table style={{ borderCollapse: 'separate', borderSpacing: '3px' }}>
                <thead>
                  <tr>
                    <th style={corrThStyle} />
                    {SYMBOLS.map(({ label }) => (
                      <th key={label} style={corrThStyle}>{label.split('/')[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SYMBOLS.map(({ label }, i) => (
                    <tr key={i}>
                      <td style={corrLabelStyle}>{label.split('/')[0]}</td>
                      {SYMBOLS.map((_, j) => {
                        const v = corrMatrix[i]?.[j] ?? 0;
                        const diag = i === j;
                        return (
                          <td
                            key={j}
                            style={{
                              ...corrCellStyle,
                              backgroundColor: diag ? '#1a1a1e' : corrBg(v),
                              color:           diag ? '#333'   : corrColor(v),
                            }}
                          >
                            {diag ? '—' : v.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: '9px', color: '#333', marginTop: '6px' }}>
                Pearson ρ on daily log-returns · −1 (inverse) → 0 (none) → +1 (perfect)
              </div>
            </div>
          )}

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

const corrThStyle: CSSProperties = {
  fontSize:      '9px',
  fontWeight:    700,
  color:         '#555',
  padding:       '2px 8px',
  textAlign:     'center',
  whiteSpace:    'nowrap',
};

const corrLabelStyle: CSSProperties = {
  fontSize:        '10px',
  fontWeight:      700,
  color:           '#888',
  padding:         '5px 8px',
  whiteSpace:      'nowrap',
  backgroundColor: '#111114',
  borderRadius:    '3px',
};

const corrCellStyle: CSSProperties = {
  padding:      '5px 10px',
  textAlign:    'center',
  fontSize:     '11px',
  fontWeight:   700,
  fontFamily:   'monospace',
  borderRadius: '3px',
  whiteSpace:   'nowrap',
  minWidth:     '48px',
  transition:   'background-color 0.3s ease',
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
