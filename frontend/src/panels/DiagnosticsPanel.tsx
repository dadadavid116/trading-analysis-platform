import React, { useEffect, useState } from 'react';
import {
  fetchFactorIC, fetchRegimeHeatmap, fetchScoreQuartiles, fetchTradeAttribution,
  FactorIC, RegimeHeatmap, ScoreQuartiles, TradeAttribution,
} from '../api';

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
  padding: '10px 14px', marginBottom: 12,
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 8,
};

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontSize: 12, padding: '4px 0', borderBottom: '1px solid #21262d',
};

function pnlColor(v: number) { return v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#8b949e'; }
function rateColor(r: number) { return r >= 55 ? '#3fb950' : r >= 45 ? '#e3b341' : '#f85149'; }

function icColor(ic: number | null): string {
  if (ic === null) return '#555';
  const a = Math.abs(ic);
  if (a >= 0.35) return ic > 0 ? '#3fb950' : '#f85149';
  if (a >= 0.20) return ic > 0 ? '#7ee787' : '#ff7b72';
  if (a >= 0.08) return '#e3b341';
  return '#555';
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ ...card, color: '#8b949e', fontSize: 12 }}>{text}</div>;
}

// ── IC Table ──────────────────────────────────────────────────────────────────

function ICTable({ data }: { data: FactorIC }) {
  if (!data.factors.length || data.n === 0) {
    return <EmptyNote text={data.note ?? 'No closed signal trades yet. IC tracking requires closed positions linked to signals.'} />;
  }
  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={sectionHeader}>Information Coefficient (IC)</div>
          <span style={{ fontSize: 11, color: '#8b949e' }}>n = {data.n} trades</span>
        </div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
          Pearson correlation between factor score at signal time and realized P&amp;L.
          Positive IC = higher score predicts better outcome.
        </div>
        {data.factors.map(f => (
          <div key={f.factor} style={row}>
            <span style={{ fontWeight: 600 }}>{f.factor}</span>
            <span style={{ color: '#555', fontSize: 11 }}>{f.n} samples</span>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#555' }}>IC</div>
                <div style={{ color: icColor(f.ic), fontWeight: 700 }}>
                  {f.ic !== null ? f.ic.toFixed(3) : 'N/A'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#555' }}>Rank IC</div>
                <div style={{ color: icColor(f.rank_ic), fontWeight: 700 }}>
                  {f.rank_ic !== null ? f.rank_ic.toFixed(3) : 'N/A'}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div style={{ fontSize: 10, color: '#555' }}>Signal</div>
                <div style={{ fontSize: 11, color: icColor(f.ic) }}>{f.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.context_terciles.length > 0 && (
        <div style={card}>
          <div style={sectionHeader}>Context Score Terciles</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {data.context_terciles.map(t => (
              <div key={t.label} style={{ background: '#0d1117', borderRadius: 4, padding: '6px 8px', border: '1px solid #21262d' }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{t.label} Score</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: rateColor(t.win_rate) }}>
                  {t.win_rate.toFixed(1)}%
                </div>
                <div style={{ fontSize: 10, color: '#8b949e' }}>WR · n={t.n}</div>
                <div style={{ fontSize: 11, color: pnlColor(t.avg_pnl), marginTop: 2 }}>
                  avg {t.avg_pnl >= 0 ? '+' : ''}${t.avg_pnl.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Regime Heatmap ────────────────────────────────────────────────────────────

function HeatmapGrid({ data }: { data: RegimeHeatmap }) {
  if (!data.regimes.length) {
    return <EmptyNote text={data.note ?? 'No closed trades yet for regime heatmap.'} />;
  }

  const cellMap: Record<string, RegimeHeatmap['cells'][0]> = {};
  for (const c of data.cells) cellMap[`${c.regime}|${c.period}`] = c;

  function cellBg(wr: number | undefined, n: number): string {
    if (!n || wr === undefined) return '#0d1117';
    if (wr >= 65)  return '#0d3321';
    if (wr >= 55)  return '#0d2215';
    if (wr >= 45)  return '#1a2020';
    if (wr >= 35)  return '#221510';
    return '#330d0d';
  }

  return (
    <div style={card}>
      <div style={sectionHeader}>Regime × Month Heatmap — Win Rate %</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: '#555', fontWeight: 400, whiteSpace: 'nowrap' }}>
                Regime
              </th>
              {data.periods.map(p => (
                <th key={p} style={{ padding: '4px 6px', color: '#555', fontWeight: 400, whiteSpace: 'nowrap' }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.regimes.map(regime => (
              <tr key={regime}>
                <td style={{ padding: '4px 8px', color: '#8b949e', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                  {regime.replace(/_/g, ' ')}
                </td>
                {data.periods.map(period => {
                  const cell = cellMap[`${regime}|${period}`];
                  return (
                    <td
                      key={period}
                      style={{
                        padding: '4px 6px', textAlign: 'center',
                        background: cellBg(cell?.win_rate, cell?.total ?? 0),
                        color: cell ? rateColor(cell.win_rate) : '#333',
                        border: '1px solid #21262d',
                        minWidth: 52,
                      }}
                      title={cell ? `${cell.total} trades · $${cell.total_pnl.toFixed(0)} PnL` : undefined}
                    >
                      {cell ? `${cell.win_rate.toFixed(0)}%` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: '#555', marginTop: 6 }}>Hover cells for trade count and P&L detail.</div>
    </div>
  );
}

// ── Score Quartile Analysis ───────────────────────────────────────────────────

function QuartileChart({ data }: { data: ScoreQuartiles }) {
  if (!data.quartiles.length) {
    return <EmptyNote text={data.note ?? 'Need at least 4 closed signal trades for quartile analysis.'} />;
  }
  const maxWR = 100;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={sectionHeader}>Score Quartile Analysis</div>
        <span style={{ fontSize: 11, color: '#8b949e' }}>n = {data.n} trades</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {data.quartiles.map(q => {
          const barH = Math.round(q.win_rate / maxWR * 60);
          const c    = rateColor(q.win_rate);
          return (
            <div key={q.quartile} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', marginBottom: 4 }}>
                <div style={{ width: 28, height: barH, background: c, borderRadius: '3px 3px 0 0', opacity: 0.9 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{q.win_rate.toFixed(1)}%</div>
              <div style={{ fontSize: 10, color: '#8b949e' }}>{q.quartile} · {q.label}</div>
              <div style={{ fontSize: 10, color: '#555' }}>{q.score_lo.toFixed(0)}–{q.score_hi.toFixed(0)}</div>
              <div style={{ fontSize: 11, color: pnlColor(q.avg_pnl), marginTop: 2 }}>
                {q.avg_pnl >= 0 ? '+' : ''}${q.avg_pnl.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>{q.n} trades</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
        Trades sorted by Context Score and split into equal-sized quartiles (Q1=lowest, Q4=highest).
      </div>
    </div>
  );
}

// ── Trade Attribution Table ───────────────────────────────────────────────────

function AttributionTable({ data }: { data: TradeAttribution[] }) {
  const withScore = data.filter(t => t.context_score !== null);
  if (!data.length) {
    return <EmptyNote text="No closed trades yet. Attribution appears once positions linked to signals are closed." />;
  }

  function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
    if (value === null) return <span style={{ color: '#555' }}>—</span>;
    const pct  = Math.min(100, Math.max(0, (value + max) / (max * 2) * 100));
    const color = value > 20 ? '#3fb950' : value < -20 ? '#f85149' : '#e3b341';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 36, height: 4, background: '#21262d', borderRadius: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', left: `${pct}%`, top: -2, width: 4, height: 8, background: color, borderRadius: 2 }} />
        </div>
        <span style={{ color, fontSize: 11 }}>{value.toFixed(0)}</span>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={sectionHeader}>Recent Trade Attribution</div>
        <span style={{ fontSize: 11, color: '#555' }}>{withScore.length}/{data.length} have signal scores</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d', color: '#555' }}>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Symbol</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Dir</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>TF</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Regime</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>PnL</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Context</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Crypto</th>
              <th style={{ padding: '3px 6px', textAlign: 'left' }}>Macro</th>
            </tr>
          </thead>
          <tbody>
            {data.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>{t.symbol.replace('USDT', '')}</td>
                <td style={{ padding: '4px 6px', color: t.direction === 'long' ? '#3fb950' : '#f85149' }}>
                  {t.direction}
                </td>
                <td style={{ padding: '4px 6px', color: '#555' }}>{t.timeframe ?? '—'}</td>
                <td style={{ padding: '4px 6px', color: '#8b949e', textTransform: 'capitalize' }}>
                  {t.regime ? t.regime.replace(/_/g, ' ') : '—'}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: pnlColor(t.realized_pnl), fontWeight: 700 }}>
                  {t.realized_pnl >= 0 ? '+' : ''}${t.realized_pnl.toFixed(2)}
                </td>
                <td style={{ padding: '4px 6px' }}><ScoreBar value={t.context_score} /></td>
                <td style={{ padding: '4px 6px' }}><ScoreBar value={t.crypto_score}  /></td>
                <td style={{ padding: '4px 6px' }}><ScoreBar value={t.macro_score}   /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Tab = 'ic' | 'heatmap' | 'quartiles' | 'attribution';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ic',          label: 'Factor IC'      },
  { id: 'heatmap',     label: 'Regime Heatmap' },
  { id: 'quartiles',   label: 'Score Quartiles'},
  { id: 'attribution', label: 'Attribution'    },
];

const tabBarStyle: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #21262d', padding: '0 12px',
  flexShrink: 0,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: 'none', border: 'none',
  borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
  color: active ? '#e6edf3' : '#8b949e', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, padding: '8px 12px', marginRight: 2,
});

const bodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 14,
};

export default function DiagnosticsPanel() {
  const [tab, setTab] = useState<Tab>('ic');

  const [ic,       setIc]       = useState<FactorIC | null>(null);
  const [heatmap,  setHeatmap]  = useState<RegimeHeatmap | null>(null);
  const [quartiles, setQuartiles] = useState<ScoreQuartiles | null>(null);
  const [attrib,   setAttrib]   = useState<TradeAttribution[] | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchFactorIC().then(setIc),
      fetchRegimeHeatmap().then(setHeatmap),
      fetchScoreQuartiles().then(setQuartiles),
      fetchTradeAttribution().then(setAttrib),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading && !ic) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', color: '#8b949e', fontSize: 12 }}>
        <div style={{ padding: 14 }}>Loading diagnostics…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', fontSize: 13, overflow: 'hidden' }}>
      <div style={tabBarStyle}>
        {TABS.map(t => (
          <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={bodyStyle}>
        {tab === 'ic'          && ic          && <ICTable      data={ic}          />}
        {tab === 'heatmap'     && heatmap     && <HeatmapGrid  data={heatmap}     />}
        {tab === 'quartiles'   && quartiles   && <QuartileChart data={quartiles}  />}
        {tab === 'attribution' && attrib      && <AttributionTable data={attrib} />}
        {tab === 'ic'          && !ic          && <EmptyNote text="Loading…" />}
        {tab === 'heatmap'     && !heatmap     && <EmptyNote text="Loading…" />}
        {tab === 'quartiles'   && !quartiles   && <EmptyNote text="Loading…" />}
        {tab === 'attribution' && !attrib      && <EmptyNote text="Loading…" />}
      </div>
    </div>
  );
}
