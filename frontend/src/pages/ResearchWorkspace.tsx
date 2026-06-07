import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchDailyReview, fetchRegimeStats, fetchRuleAdherence, fetchSetupStats,
  DailyReview, RegimeStat, RuleAdherence, SetupStat,
} from '../api';
import JournalPanel     from '../panels/JournalPanel';
import PerformancePanel from '../panels/PerformancePanel';
import BacktestPanel    from '../panels/BacktestPanel';

// ── Shared styles ─────────────────────────────────────────────────────────────

const ws: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', fontSize: 13, overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #21262d', padding: '0 12px',
  flexShrink: 0, overflowX: 'auto',
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: 'none', border: 'none',
  borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
  color: active ? '#e6edf3' : '#8b949e', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, padding: '8px 12px', marginRight: 2, whiteSpace: 'nowrap',
});

const body: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 14,
};

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
  padding: '10px 14px', marginBottom: 12,
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 8,
};

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', fontSize: 12,
  padding: '3px 0', borderBottom: '1px solid #21262d',
};

const lbl: React.CSSProperties = { color: '#8b949e' };

function pnlColor(v: number) { return v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#8b949e'; }
function rateColor(r: number) { return r >= 55 ? '#3fb950' : r >= 45 ? '#e3b341' : '#f85149'; }

// ── Daily Review Tab ──────────────────────────────────────────────────────────

function DailyReviewTab() {
  const [data, setData]       = useState<DailyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try { setData(await fetchDailyReview()); }
    catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;
  if (!data)   return <div style={{ padding: 14, color: '#f85149' }}>Failed to load daily review.</div>;

  return (
    <div style={body}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionHeader}>Today — {data.date}</div>
          <span style={{ fontSize: 11, color: '#8b949e' }}>Equity: ${data.current_equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 4px' }}>
          <div style={row}><span style={lbl}>Trades</span><span>{data.total}</span></div>
          <div style={row}><span style={lbl}>Win Rate</span><span style={{ color: rateColor(data.win_rate) }}>{data.win_rate.toFixed(1)}%</span></div>
          <div style={row}><span style={lbl}>Net P&L</span><span style={{ color: pnlColor(data.total_pnl), fontWeight: 700 }}>{data.total_pnl >= 0 ? '+' : ''}${data.total_pnl.toFixed(2)}</span></div>
          <div style={row}><span style={lbl}>Avg Win</span><span style={{ color: '#3fb950' }}>${data.avg_win.toFixed(2)}</span></div>
          <div style={row}><span style={lbl}>Avg Loss</span><span style={{ color: '#f85149' }}>${data.avg_loss.toFixed(2)}</span></div>
          <div style={row}><span style={lbl}>Open Risk</span><span>{data.open_risk_pct.toFixed(1)}%</span></div>
        </div>
      </div>

      {data.recent_trades.length > 0 && (
        <div style={card}>
          <div style={sectionHeader}>Today's Trades</div>
          {data.recent_trades.map((t, i) => (
            <div key={i} style={row}>
              <span style={{ color: t.direction === 'long' ? '#3fb950' : '#f85149' }}>{t.direction.toUpperCase()}</span>
              <span>{t.symbol}</span>
              <span style={{ color: pnlColor(t.realized_pnl), fontWeight: 700 }}>
                {t.realized_pnl >= 0 ? '+' : ''}${t.realized_pnl.toFixed(2)}
              </span>
              <span style={{ color: '#555', fontSize: 11 }}>
                {t.closed_at ? new Date(t.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionHeader}>AI Coaching Note</div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: 4, color: '#8b949e', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
          >
            {refreshing ? '…' : '↻ Refresh'}
          </button>
        </div>
        {data.ai_coaching ? (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#c9d1d9', whiteSpace: 'pre-wrap' }}>
            {data.ai_coaching}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#8b949e' }}>
            {data.total === 0
              ? 'No trades closed today yet — coaching note will appear once you have closed positions.'
              : 'AI coaching unavailable — check ANTHROPIC_API_KEY on the server.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Regime Stats Tab ──────────────────────────────────────────────────────────

function RegimeStatsTab() {
  const [data,    setData]    = useState<RegimeStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRegimeStats().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const maxPnl = Math.max(1, ...data.map(r => Math.abs(r.total_pnl)));

  if (loading) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;

  return (
    <div style={body}>
      {data.length === 0 ? (
        <div style={{ ...card, color: '#8b949e' }}>
          No closed trades with regime data yet. Regime is captured from scanner signals.
        </div>
      ) : (
        <div style={card}>
          <div style={sectionHeader}>Performance by Market Regime</div>
          {data.map(r => {
            const barPct = Math.abs(r.total_pnl) / maxPnl * 100;
            const barColor = r.total_pnl >= 0 ? '#3fb950' : '#f85149';
            return (
              <div key={r.regime} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{r.regime.replace(/_/g, ' ')}</span>
                  <span style={{ color: pnlColor(r.total_pnl), fontWeight: 700 }}>
                    {r.total_pnl >= 0 ? '+' : ''}${r.total_pnl.toFixed(2)}
                  </span>
                </div>
                <div style={{ background: '#21262d', borderRadius: 3, height: 6, marginBottom: 4 }}>
                  <div style={{ background: barColor, width: `${barPct}%`, height: '100%', borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8b949e' }}>
                  <span>{r.total} trades</span>
                  <span style={{ color: rateColor(r.win_rate) }}>{r.win_rate.toFixed(1)}% WR</span>
                  <span>avg ${r.avg_pnl.toFixed(2)}</span>
                  <span style={{ color: '#3fb950' }}>{r.wins}W</span>
                  <span style={{ color: '#f85149' }}>{r.losses}L</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Rule Adherence Tab ────────────────────────────────────────────────────────

function RuleAdherenceTab() {
  const [data,    setData]    = useState<RuleAdherence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuleAdherence().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;
  if (!data)   return <div style={{ padding: 14, color: '#f85149' }}>Failed to load.</div>;

  const scoreColor = data.score >= 80 ? '#3fb950' : data.score >= 60 ? '#e3b341' : '#f85149';

  return (
    <div style={body}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={sectionHeader}>Rule Adherence Score</div>
          <span style={{ fontSize: 24, fontWeight: 700, color: scoreColor }}>{data.score}%</span>
        </div>
        <div style={{ background: '#21262d', borderRadius: 4, height: 8, marginBottom: 12 }}>
          <div style={{ background: scoreColor, width: `${data.score}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10 }}>
          {data.passing} of {data.total} rules passing
        </div>

        {data.rules.map((r, i) => (
          <div key={i} style={{ ...row, alignItems: 'flex-start', paddingTop: 6, paddingBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>{r.rule}</div>
              <div style={{ fontSize: 11, color: '#555' }}>{r.detail}</div>
            </div>
            <span style={{ fontSize: 16, color: r.pass ? '#3fb950' : '#f85149', flexShrink: 0, marginLeft: 8 }}>
              {r.pass ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionHeader}>Account Snapshot</div>
        <div style={row}><span style={lbl}>Equity</span><span>${data.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
        <div style={row}>
          <span style={lbl}>Daily Drawdown</span>
          <span style={{ color: pnlColor(-Math.abs(data.daily_drawdown_pct)) }}>
            {data.daily_drawdown_pct.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Setup Stats Tab ───────────────────────────────────────────────────────────

function SetupStatsTab() {
  const [data,    setData]    = useState<SetupStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSetupStats().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;

  return (
    <div style={body}>
      {data.length === 0 ? (
        <div style={{ ...card, color: '#8b949e' }}>
          No closed trades with signal data yet. Setup stats appear once signals have been executed and closed.
        </div>
      ) : (
        <div style={card}>
          <div style={sectionHeader}>Performance by Setup Type</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d', color: '#555', fontSize: 11 }}>
                <th style={{ padding: '3px 6px', textAlign: 'left' }}>TF</th>
                <th style={{ padding: '3px 6px', textAlign: 'left' }}>Dir</th>
                <th style={{ padding: '3px 6px', textAlign: 'right' }}>Trades</th>
                <th style={{ padding: '3px 6px', textAlign: 'right' }}>Win%</th>
                <th style={{ padding: '3px 6px', textAlign: 'right' }}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '4px 6px' }}>{s.timeframe}</td>
                  <td style={{ padding: '4px 6px', color: s.direction === 'long' ? '#3fb950' : '#f85149' }}>{s.direction}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.total}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: rateColor(s.win_rate) }}>{s.win_rate.toFixed(1)}%</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: pnlColor(s.total_pnl), fontWeight: 700 }}>
                    {s.total_pnl >= 0 ? '+' : ''}${s.total_pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Passthrough tabs (panels that render themselves) ──────────────────────────

function PanelTab({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Tab = 'daily' | 'regime' | 'rules' | 'setups' | 'journal' | 'performance' | 'backtest';

const TABS: { id: Tab; label: string }[] = [
  { id: 'daily',       label: 'Daily Review' },
  { id: 'regime',      label: 'By Regime'    },
  { id: 'rules',       label: 'Rules'        },
  { id: 'setups',      label: 'By Setup'     },
  { id: 'journal',     label: 'Journal'      },
  { id: 'performance', label: 'Performance'  },
  { id: 'backtest',    label: 'Backtest'     },
];

export default function ResearchWorkspace() {
  const [tab, setTab] = useState<Tab>('daily');

  return (
    <div style={ws}>
      <div style={{ padding: '6px 14px 0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Review & Research</span>
      </div>
      <div style={tabBarStyle}>
        {TABS.map(t => (
          <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'daily'       && <DailyReviewTab />}
        {tab === 'regime'      && <RegimeStatsTab />}
        {tab === 'rules'       && <RuleAdherenceTab />}
        {tab === 'setups'      && <SetupStatsTab />}
        {tab === 'journal'     && <PanelTab><JournalPanel /></PanelTab>}
        {tab === 'performance' && <PanelTab><PerformancePanel /></PanelTab>}
        {tab === 'backtest'    && <PanelTab><BacktestPanel /></PanelTab>}
      </div>
    </div>
  );
}
