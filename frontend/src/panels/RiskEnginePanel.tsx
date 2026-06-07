import React, { useEffect, useState, useCallback } from 'react';
import {
  getRiskSummary, assessTrade,
  toggleKillSwitch,
  RiskSummary, RiskAssessment,
} from '../api';

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace',
  fontSize: 13, padding: 16, overflowY: 'auto',
};

const sectionStyle: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
  padding: '12px 14px', marginBottom: 12,
};

const headerStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  color: '#8b949e', textTransform: 'uppercase', marginBottom: 10,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '4px 0', borderBottom: '1px solid #21262d',
};

const labelStyle: React.CSSProperties = { color: '#8b949e', fontSize: 12 };

const inputStyle: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', fontSize: 12, padding: '4px 8px', width: 110,
};

const btnBase: React.CSSProperties = {
  border: 'none', borderRadius: 4, cursor: 'pointer',
  fontSize: 12, fontWeight: 700, padding: '6px 12px',
};

function trafficColor(t: 'green' | 'orange' | 'red'): string {
  return t === 'red' ? '#f85149' : t === 'orange' ? '#e3b341' : '#3fb950';
}

function verdictColor(v: string): string {
  if (v === 'approved') return '#3fb950';
  if (v === 'warning')  return '#e3b341';
  return '#f85149';
}

function BarMeter({ pct, max, color }: { pct: number; max: number; color: string }) {
  const fill = Math.min(100, (pct / (max || 1)) * 100);
  return (
    <div style={{ background: '#21262d', borderRadius: 3, height: 6, width: '100%', marginTop: 4 }}>
      <div style={{ background: color, width: `${fill}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Kill Switch ───────────────────────────────────────────────────────────────

function KillSwitchSection({ summary, onToggle }: {
  summary: RiskSummary | null;
  onToggle: () => void;
}) {
  const active = summary?.kill_switch_active ?? false;
  return (
    <div style={{
      ...sectionStyle,
      border: active ? '1px solid #f85149' : '1px solid #30363d',
      background: active ? '#1a0a0a' : '#161b22',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ ...headerStyle, color: active ? '#f85149' : '#8b949e', marginBottom: 2 }}>
            Kill Switch
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            {active ? 'All new trades are blocked.' : 'Trading is enabled.'}
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            ...btnBase,
            background: active ? '#238636' : '#b62324',
            color: '#fff',
            minWidth: 80,
          }}
        >
          {active ? 'Resume' : 'Kill'}
        </button>
      </div>
    </div>
  );
}

// ── Risk Status ───────────────────────────────────────────────────────────────

function RiskStatusSection({ summary }: { summary: RiskSummary | null }) {
  if (!summary) return null;
  const openColor  = trafficColor(summary.open_risk_traffic);
  const dailyColor = trafficColor(summary.daily_loss_traffic);

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>Risk Status</div>
      <div style={rowStyle}>
        <span style={labelStyle}>Equity</span>
        <span style={{ fontWeight: 700 }}>
          ${summary.current_equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Realized P&L</span>
        <span style={{ color: summary.realized_pnl >= 0 ? '#3fb950' : '#f85149', fontWeight: 700 }}>
          {summary.realized_pnl >= 0 ? '+' : ''}${summary.realized_pnl.toFixed(2)}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Open Positions</span>
        <span>{summary.open_count}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={labelStyle}>Open Risk</span>
          <span style={{ color: openColor }}>
            ${summary.open_risk_usd.toFixed(0)} ({summary.open_risk_pct.toFixed(1)}% / {summary.max_open_risk_pct}% max)
          </span>
        </div>
        <BarMeter pct={summary.open_risk_pct} max={summary.max_open_risk_pct} color={openColor} />
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={labelStyle}>Daily Drawdown</span>
          <span style={{ color: dailyColor }}>
            {summary.daily_loss_pct.toFixed(2)}% / {summary.daily_loss_limit_pct}% limit
          </span>
        </div>
        <BarMeter pct={summary.daily_loss_pct} max={summary.daily_loss_limit_pct} color={dailyColor} />
      </div>
    </div>
  );
}

// ── Trade Sizer ───────────────────────────────────────────────────────────────

function TradeSizerSection({ summary }: { summary: RiskSummary | null }) {
  const [entry,    setEntry]    = useState('');
  const [sl,       setSl]       = useState('');
  const [sizeUsd,  setSizeUsd]  = useState('');
  const [riskPct,  setRiskPct]  = useState('');
  const [result,   setResult]   = useState<RiskAssessment | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleAssess = async () => {
    const ep = parseFloat(entry);
    const sp = parseFloat(sl);
    if (!ep || !sp) { setError('Enter entry and stop-loss prices.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await assessTrade({
        entry_price:        ep,
        stop_loss:          sp,
        size_usd:           sizeUsd  ? parseFloat(sizeUsd)  : undefined,
        override_risk_pct:  riskPct  ? parseFloat(riskPct)  : undefined,
      });
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assessment failed');
    } finally {
      setLoading(false);
    }
  };

  const slDistPct = entry && sl
    ? (Math.abs(parseFloat(entry) - parseFloat(sl)) / parseFloat(entry) * 100).toFixed(2)
    : null;

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>Trade Sizer</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Entry Price</div>
          <input style={inputStyle} value={entry} onChange={e => setEntry(e.target.value)} placeholder="e.g. 67500" />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Stop Loss</div>
          <input style={inputStyle} value={sl} onChange={e => setSl(e.target.value)} placeholder="e.g. 66000" />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Size USD (opt)</div>
          <input style={inputStyle} value={sizeUsd} onChange={e => setSizeUsd(e.target.value)} placeholder="auto" />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Risk % (opt)</div>
          <input style={inputStyle} value={riskPct} onChange={e => setRiskPct(e.target.value)}
            placeholder={summary ? `${summary.max_risk_per_trade_pct}%` : '2%'} />
        </div>
      </div>

      {slDistPct && (
        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
          SL distance: {slDistPct}%
        </div>
      )}

      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 6 }}>{error}</div>}

      <button
        onClick={handleAssess}
        disabled={loading}
        style={{ ...btnBase, background: '#1f6feb', color: '#fff', width: '100%', marginBottom: result ? 10 : 0 }}
      >
        {loading ? 'Assessing…' : 'Assess Trade'}
      </button>

      {result && (
        <div style={{
          marginTop: 8, border: `1px solid ${verdictColor(result.verdict)}22`,
          background: `${verdictColor(result.verdict)}11`, borderRadius: 4, padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: verdictColor(result.verdict), textTransform: 'uppercase' }}>
              {result.verdict}
            </span>
            <span style={{ fontSize: 12, color: '#8b949e' }}>
              Risk: ${result.risk_usd.toFixed(0)} ({result.risk_pct_of_equity.toFixed(2)}%)
            </span>
          </div>

          <div style={{ ...rowStyle, borderBottom: 'none', paddingBottom: 0 }}>
            <span style={labelStyle}>Suggested Size</span>
            <span style={{ fontWeight: 700 }}>${result.suggested_size_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none', paddingBottom: 0 }}>
            <span style={labelStyle}>Max Allowed</span>
            <span>${result.max_allowed_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

          {result.reasons.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {result.reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: '#f85149', marginBottom: 2 }}>⊘ {r}</div>
              ))}
            </div>
          )}
          {result.warnings.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: '#e3b341', marginBottom: 2 }}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function RiskEnginePanel() {
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await getRiskSummary();
      setSummary(s);
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const handleToggleKillSwitch = async () => {
    if (!summary) return;
    const next = !summary.kill_switch_active;
    const confirm = window.confirm(
      next
        ? 'ACTIVATE kill switch? All new trades will be blocked.'
        : 'DEACTIVATE kill switch? Trading will be re-enabled.'
    );
    if (!confirm) return;
    try {
      await toggleKillSwitch(next);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to toggle kill switch');
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Risk Engine</span>
        <span style={{ fontSize: 11, color: '#8b949e' }}>
          {lastRefresh ? `Updated ${lastRefresh}` : 'Loading…'}
        </span>
      </div>

      <KillSwitchSection summary={summary} onToggle={handleToggleKillSwitch} />
      <RiskStatusSection summary={summary} />
      <TradeSizerSection summary={summary} />
    </div>
  );
}
