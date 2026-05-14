import { useState, useEffect, CSSProperties } from 'react';
import { fetchKlines, KlineCandle } from '../api';
import { panelStyles } from './panelStyles';

// ── Symbols & timeframes ──────────────────────────────────────────────────────

const SYMBOLS = [
  { key: 'BTCUSDT', label: 'BTC' },
  { key: 'ETHUSDT', label: 'ETH' },
  { key: 'SOLUSDT', label: 'SOL' },
];

const TIMEFRAMES = [
  { interval: '15m', label: '15m' },
  { interval: '1h',  label: '1H'  },
  { interval: '4h',  label: '4H'  },
  { interval: '1d',  label: '1D'  },
];

// ── Indicator math ────────────────────────────────────────────────────────────

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

// ── Signal types ──────────────────────────────────────────────────────────────

interface Signal {
  rsi:   number;
  trend: 'bull' | 'bear' | 'flat';
}

function getSignal(candles: KlineCandle[]): Signal {
  if (candles.length < 15) return { rsi: 50, trend: 'flat' };
  const closes = candles.map((c) => c.close);
  const rsi    = computeRSI(closes);
  const ema20  = computeEMA(closes, 20);
  const price  = closes[closes.length - 1];
  const pctDiff = (price - ema20) / ema20 * 100;
  const trend: Signal['trend'] = pctDiff > 0.3 ? 'bull' : pctDiff < -0.3 ? 'bear' : 'flat';
  return { rsi, trend };
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function rsiBg(rsi: number): string {
  if (rsi >= 75) return 'rgba(239,83,80,0.55)';
  if (rsi >= 60) return 'rgba(239,83,80,0.20)';
  if (rsi <= 25) return 'rgba(38,166,154,0.55)';
  if (rsi <= 40) return 'rgba(38,166,154,0.20)';
  return '#131316';
}

function rsiColor(rsi: number): string {
  if (rsi >= 60) return '#ef5350';
  if (rsi <= 40) return '#26a69a';
  return '#888';
}

function trendArrow(t: Signal['trend']): string {
  return t === 'bull' ? '↑' : t === 'bear' ? '↓' : '→';
}

function trendColor(t: Signal['trend']): string {
  return t === 'bull' ? '#66bb6a' : t === 'bear' ? '#ef5350' : '#555';
}

// ── Component ─────────────────────────────────────────────────────────────────

type MatrixData = Record<string, Record<string, Signal>>;

export default function SignalMatrixPanel() {
  const [matrix,    setMatrix]    = useState<MatrixData>({});
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    try {
      const result: MatrixData = {};
      await Promise.all(
        SYMBOLS.map(async ({ key }) => {
          result[key] = {};
          await Promise.all(
            TIMEFRAMES.map(async ({ interval }) => {
              const candles = await fetchKlines(interval, 25, key).catch(() => [] as KlineCandle[]);
              result[key][interval] = getSignal(candles);
            }),
          );
        }),
      );
      setMatrix(result);
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

  return (
    <div style={panelStyles.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Signal Matrix
        </h2>
        {updatedAt && (
          <span style={{ fontSize: '9px', color: '#444' }}>{updatedAt.toLocaleTimeString()}</span>
        )}
      </div>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {!loading && (
        <>
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
              <thead>
                <tr>
                  <th style={thStyle} />
                  {TIMEFRAMES.map(({ label }) => (
                    <th key={label} style={thStyle}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYMBOLS.map(({ key, label }) => (
                  <tr key={key}>
                    <td style={symCellStyle}>{label}</td>
                    {TIMEFRAMES.map(({ interval }) => {
                      const sig = matrix[key]?.[interval];
                      if (!sig) return <td key={interval} style={emptyCellStyle}>—</td>;
                      return (
                        <td
                          key={interval}
                          style={{ ...sigCellStyle, backgroundColor: rsiBg(sig.rsi) }}
                        >
                          <span style={{ color: rsiColor(sig.rsi), fontSize: '13px', fontWeight: 700 }}>
                            {sig.rsi.toFixed(0)}
                          </span>
                          <span style={{ color: trendColor(sig.trend), fontSize: '11px', marginLeft: '4px' }}>
                            {trendArrow(sig.trend)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={legendStyle}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { color: '#ef5350', label: 'RSI ≥ 60 (overbought)' },
                { color: '#26a69a', label: 'RSI ≤ 40 (oversold)'   },
                { color: '#888',    label: 'RSI 40–60 (neutral)'    },
              ].map(({ color, label }) => (
                <span key={label} style={{ fontSize: '9px', color, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
              {[
                { sym: '↑', color: '#66bb6a', label: 'Price > EMA20' },
                { sym: '↓', color: '#ef5350', label: 'Price < EMA20' },
                { sym: '→', color: '#555',    label: 'Flat'          },
              ].map(({ sym, color, label }) => (
                <span key={label} style={{ fontSize: '9px', color: '#555' }}>
                  <span style={{ color }}>{sym}</span> {label}
                </span>
              ))}
            </div>
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
  textAlign:     'center',
  padding:       '3px 6px',
  borderBottom:  '1px solid #1e1e22',
};

const symCellStyle: CSSProperties = {
  fontSize:        '11px',
  fontWeight:      700,
  color:           '#c0c0c0',
  padding:         '8px 10px',
  whiteSpace:      'nowrap',
  backgroundColor: '#111114',
  border:          '1px solid #1e1e22',
  borderRadius:    '3px',
  textAlign:       'left',
};

const sigCellStyle: CSSProperties = {
  padding:      '8px 10px',
  textAlign:    'center',
  borderRadius: '4px',
  whiteSpace:   'nowrap',
  transition:   'background-color 0.3s ease',
  fontFamily:   'monospace',
};

const emptyCellStyle: CSSProperties = {
  ...sigCellStyle,
  backgroundColor: '#111114',
  color:           '#333',
};

const legendStyle: CSSProperties = {
  marginTop:  '10px',
  paddingTop: '8px',
  borderTop:  '1px solid #1e1e22',
};
