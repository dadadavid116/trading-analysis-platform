import React, { useState } from 'react';
import { runBacktest, BacktestResult, BacktestTrade } from '../api';

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace',
  fontSize: 13, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const bodyStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: 14 };

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
  padding: '10px 14px', marginBottom: 12,
};

const secHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 8,
};

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', fontSize: 12,
  padding: '3px 0', borderBottom: '1px solid #21262d',
};

const lbl: React.CSSProperties = { color: '#8b949e' };

const inputSt: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', fontSize: 12, padding: '4px 8px', width: '100%',
};

const selectSt: React.CSSProperties = { ...inputSt, cursor: 'pointer' };

const btnRun: React.CSSProperties = {
  background: '#1f6feb', border: 'none', borderRadius: 4, color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '8px 20px',
  marginTop: 8, width: '100%',
};

function pnlColor(v: number) { return v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#8b949e'; }

// ── Equity curve SVG ──────────────────────────────────────────────────────────

function EquityCurve({ data, startEquity }: { data: { index: number; equity: number }[]; startEquity: number }) {
  if (data.length < 2) return null;
  const W = 500, H = 90, P = 4;
  const equities = data.map(d => d.equity);
  const minE = Math.min(...equities);
  const maxE = Math.max(...equities);
  const range = maxE - minE || 1;
  const toX = (i: number) => P + (i / (data.length - 1)) * (W - P * 2);
  const toY = (e: number) => H - P - ((e - minE) / range) * (H - P * 2);
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.equity).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(data.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`;
  const last = data[data.length - 1].equity;
  const color = last >= startEquity ? '#3fb950' : '#f85149';
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={P} y1={toY(startEquity)} x2={W - P} y2={toY(startEquity)}
        stroke="#30363d" strokeWidth="1" strokeDasharray="4 3" />
      <path d={areaD} fill="url(#btGrad)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── R-distribution bars ───────────────────────────────────────────────────────

const R_BUCKET_ORDER = [
  '<-1.5', '-1.5 to -1', '-1 to -0.5', '-0.5 to 0',
  '0 to 1', '1 to 2', '2 to 3', '3 to 5', '>5',
];

function RDistribution({ dist }: { dist: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(dist));
  return (
    <div>
      {R_BUCKET_ORDER.map(b => {
        const count = dist[b] ?? 0;
        const pct   = count / max * 100;
        const isWin = b.startsWith('0') || b.startsWith('1') || b.startsWith('2') || b.startsWith('3') || b.startsWith('>');
        const color = isWin ? '#3fb950' : '#f85149';
        return (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#8b949e', width: 80, textAlign: 'right', flexShrink: 0 }}>{b}</span>
            <div style={{ flex: 1, background: '#21262d', borderRadius: 2, height: 10 }}>
              <div style={{ background: color, width: `${pct}%`, height: '100%', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: count ? color : '#3d444d', width: 20 }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Trades table ──────────────────────────────────────────────────────────────

function TradeRow({ t }: { t: BacktestTrade }) {
  const outcomeColor = t.outcome === 'sl' ? '#f85149' : t.outcome === 'expired' ? '#8b949e' : '#3fb950';
  return (
    <tr style={{ borderBottom: '1px solid #21262d', fontSize: 11 }}>
      <td style={{ padding: '3px 6px', color: t.direction === 'long' ? '#3fb950' : '#f85149' }}>{t.direction}</td>
      <td style={{ padding: '3px 6px' }}>{t.symbol.replace('USDT', '')}</td>
      <td style={{ padding: '3px 6px' }}>{t.entry_price.toFixed(2)}</td>
      <td style={{ padding: '3px 6px', color: outcomeColor, fontWeight: 700 }}>{t.tp_level || t.outcome}</td>
      <td style={{ padding: '3px 6px', color: pnlColor(t.r) }}>{t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}R</td>
      <td style={{ padding: '3px 6px', color: pnlColor(t.pnl) }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(0)}</td>
      <td style={{ padding: '3px 6px', color: '#555' }}>{t.regime?.replace('_', ' ') ?? '—'}</td>
    </tr>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({ r }: { r: BacktestResult }) {
  const [showTrades, setShowTrades] = useState(false);

  const statGroups: [string, string | number, string?][][] = [
    [
      ['Signals Tested', r.signals_tested],
      ['Filled', r.filled],
      ['Expired', r.expired],
    ],
    [
      ['Win Rate', `${r.win_rate.toFixed(1)}%`],
      ['Wins', r.wins],
      ['Losses', r.losses],
    ],
    [
      ['Profit Factor', r.profit_factor === 99.9 ? '∞' : r.profit_factor.toFixed(2)],
      ['Expectancy', `${r.expectancy_r >= 0 ? '+' : ''}${r.expectancy_r.toFixed(3)}R`],
      ['Total R', `${r.total_r >= 0 ? '+' : ''}${r.total_r.toFixed(2)}R`],
    ],
    [
      ['Start Equity',  `$${r.params.start_equity.toLocaleString()}`],
      ['Final Equity',  `$${r.final_equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
      ['Total Return',  `${r.total_return_pct >= 0 ? '+' : ''}${r.total_return_pct.toFixed(2)}%`],
    ],
    [
      ['Max Drawdown', `${r.max_drawdown.toFixed(2)}%`],
    ],
  ];

  return (
    <>
      <div style={card}>
        <div style={secHeader}>Results — {r.params.symbol ?? 'All Symbols'} {r.params.direction ? `· ${r.params.direction}` : ''}</div>
        {statGroups.map((group, gi) => (
          <div key={gi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 4px' }}>
            {group.map(([label, value, extra]) => (
              <div key={label as string} style={row}>
                <span style={lbl}>{label}</span>
                <span style={{
                  fontWeight: 700,
                  color: label === 'Win Rate'    ? (r.win_rate    >= 50 ? '#3fb950' : '#f85149')
                       : label === 'Total Return' ? pnlColor(r.total_return_pct)
                       : label === 'Max Drawdown' ? (r.max_drawdown < -15 ? '#f85149' : r.max_drawdown < -5 ? '#e3b341' : '#3fb950')
                       : label === 'Expectancy'   ? pnlColor(r.expectancy_r)
                       : '#e6edf3',
                }}>{value as string}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={secHeader}>Equity Curve ({r.equity_curve.length} points)</div>
        <EquityCurve data={r.equity_curve} startEquity={r.params.start_equity} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginTop: 2 }}>
          <span>Start ${r.params.start_equity.toLocaleString()}</span>
          <span style={{ color: pnlColor(r.total_return_pct) }}>
            End ${r.final_equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      <div style={card}>
        <div style={secHeader}>R-Multiple Distribution</div>
        <RDistribution dist={r.r_distribution} />
      </div>

      {r.trades.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={secHeader}>Trade Log ({r.trades.length} shown)</div>
            <button
              onClick={() => setShowTrades(s => !s)}
              style={{ background: 'none', border: '1px solid #30363d', borderRadius: 4, color: '#8b949e', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
            >
              {showTrades ? 'Hide' : 'Show'}
            </button>
          </div>
          {showTrades && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ fontSize: 10, color: '#555', borderBottom: '1px solid #30363d' }}>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>Dir</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>Sym</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>Entry</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>Exit</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>R</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>PnL</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left' }}>Regime</th>
                  </tr>
                </thead>
                <tbody>
                  {r.trades.map((t, i) => <TradeRow key={i} t={t} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function BacktestPanel() {
  const [symbol,    setSymbol]    = useState('');
  const [direction, setDirection] = useState('');
  const [since,     setSince]     = useState('');
  const [until,     setUntil]     = useState('');
  const [riskPct,   setRiskPct]   = useState('1');
  const [startEq,   setStartEq]   = useState('10000');
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await runBacktest({
        symbol:       symbol       || undefined,
        direction:    direction    || undefined,
        since:        since        || undefined,
        until:        until        || undefined,
        risk_pct:     parseFloat(riskPct)  || 1.0,
        start_equity: parseFloat(startEq) || 10000,
      });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Backtest</span>
      </div>
      <div style={bodyStyle}>
        {/* Params form */}
        <div style={card}>
          <div style={secHeader}>Parameters</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Symbol (blank = all)</div>
              <select style={selectSt} value={symbol} onChange={e => setSymbol(e.target.value)}>
                <option value="">All symbols</option>
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="ETHUSDT">ETHUSDT</option>
                <option value="SOLUSDT">SOLUSDT</option>
              </select>
            </div>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Direction</div>
              <select style={selectSt} value={direction} onChange={e => setDirection(e.target.value)}>
                <option value="">Both</option>
                <option value="long">Long only</option>
                <option value="short">Short only</option>
              </select>
            </div>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Since (date)</div>
              <input style={inputSt} type="date" value={since} onChange={e => setSince(e.target.value)} />
            </div>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Until (date)</div>
              <input style={inputSt} type="date" value={until} onChange={e => setUntil(e.target.value)} />
            </div>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Risk per trade (%)</div>
              <input style={inputSt} type="number" step="0.1" min="0.1" max="10"
                value={riskPct} onChange={e => setRiskPct(e.target.value)} />
            </div>
            <div>
              <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>Starting equity ($)</div>
              <input style={inputSt} type="number" step="1000" min="100"
                value={startEq} onChange={e => setStartEq(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 6 }}>{error}</div>}
          <button style={btnRun} disabled={loading} onClick={handleRun}>
            {loading ? 'Running backtest…' : '▶ Run Backtest'}
          </button>
          {loading && (
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>
              Scanning price candles for all signals — this may take a few seconds…
            </div>
          )}
        </div>

        {result && !loading && <Results r={result} />}

        {!result && !loading && (
          <div style={{ color: '#8b949e', fontSize: 12 }}>
            Configure parameters above and click Run to replay historical signals against price candles.
            <br /><br />
            Requires signals in the database (created by the scanner worker). SL/TP outcomes are
            determined by 1-minute candle data.
          </div>
        )}
      </div>
    </div>
  );
}
