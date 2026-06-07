import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchAccountState, fetchTradeStats, fetchEquityCurve, fetchOrders,
  fetchAccountConfig, updateAccountConfig, closePosition, cancelPosition,
  fillOrder, cancelOrder, toggleKillSwitch, getRiskSummary,
  AccountState, TradeStats, EquityCurvePoint, PaperOrder, AccountConfig, RiskSummary,
} from '../api';

// ── Base styles ────────────────────────────────────────────────────────────────

const ws: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', fontSize: 13, overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #21262d', padding: '0 12px', flexShrink: 0,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: 'none', border: 'none', borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
  color: active ? '#e6edf3' : '#8b949e', cursor: 'pointer', fontSize: 12, fontWeight: 700,
  padding: '8px 12px', marginRight: 4,
});

const body: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
};

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px',
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 8,
};

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '3px 0', borderBottom: '1px solid #21262d',
};

const lbl: React.CSSProperties = { color: '#8b949e', fontSize: 12 };

const inputSt: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', fontSize: 12, padding: '3px 7px', width: 95,
};

const btnSm = (bg: string): React.CSSProperties => ({
  background: bg, border: 'none', borderRadius: 4, color: '#fff',
  cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '4px 9px',
});

function pnlColor(v: number) { return v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#8b949e'; }

function BarMeter({ pct, max, color }: { pct: number; max: number; color: string }) {
  const fill = max > 0 ? Math.min(100, pct / max * 100) : 0;
  return (
    <div style={{ background: '#21262d', borderRadius: 3, height: 5, marginTop: 3 }}>
      <div style={{ background: color, width: `${fill}%`, height: '100%', borderRadius: 3 }} />
    </div>
  );
}

// ── Equity Curve SVG ─────────────────────────────────────────────────────────

function EquityCurve({ points }: { points: EquityCurvePoint[] }) {
  if (points.length < 2) {
    return <div style={{ color: '#8b949e', fontSize: 11, padding: 12 }}>No snapshot data yet. Snapshots are recorded automatically when positions open/close.</div>;
  }
  const W = 480, H = 100, PAD = 4;
  const equities = points.map(p => p.equity);
  const minE = Math.min(...equities);
  const maxE = Math.max(...equities);
  const range = maxE - minE || 1;

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = (e: number) => H - PAD - ((e - minE) / range) * (H - PAD * 2);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.equity).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(points.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`;
  const lastEquity = points[points.length - 1].equity;
  const firstEquity = points[0].equity;
  const curveColor = lastEquity >= firstEquity ? '#3fb950' : '#f85149';

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: 200 }}>
        <defs>
          <linearGradient id="ecGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={curveColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={curveColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#ecGrad)" />
        <path d={pathD} fill="none" stroke={curveColor} strokeWidth="1.5" />
        <text x={W - PAD} y={PAD + 8} fill={curveColor} fontSize="9" textAnchor="end">
          ${lastEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginTop: 2 }}>
        <span>{new Date(points[0].timestamp).toLocaleDateString()}</span>
        <span>{points.length} snapshots</span>
        <span>{new Date(points[points.length - 1].timestamp).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ state, curve, stats, riskSummary }: {
  state: AccountState | null;
  curve: EquityCurvePoint[];
  stats: TradeStats | null;
  riskSummary: RiskSummary | null;
}) {
  if (!state) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;

  const returnPct = state.starting_capital > 0
    ? ((state.current_equity - state.starting_capital) / state.starting_capital * 100)
    : 0;
  const peakEquity = curve.length ? Math.max(...curve.map(p => p.equity)) : state.current_equity;
  const drawdown   = peakEquity > 0 ? ((state.current_equity - peakEquity) / peakEquity * 100) : 0;
  const openColor  = riskSummary?.open_risk_traffic === 'red' ? '#f85149' : riskSummary?.open_risk_traffic === 'orange' ? '#e3b341' : '#3fb950';

  return (
    <div style={body}>
      {/* Equity summary */}
      <div style={card}>
        <div style={sectionHeader}>Account Summary</div>
        <div style={row}>
          <span style={lbl}>Starting Capital</span>
          <span>${state.starting_capital.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={row}>
          <span style={lbl}>Current Equity</span>
          <span style={{ fontWeight: 700 }}>${state.current_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div style={row}>
          <span style={lbl}>Return</span>
          <span style={{ color: pnlColor(returnPct) }}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</span>
        </div>
        <div style={row}>
          <span style={lbl}>Net Realized P&L</span>
          <span style={{ color: pnlColor(state.realized_pnl) }}>
            {state.realized_pnl >= 0 ? '+' : ''}${state.realized_pnl.toFixed(2)}
          </span>
        </div>
        <div style={row}>
          <span style={lbl}>Drawdown (from peak)</span>
          <span style={{ color: drawdown < -5 ? '#f85149' : '#8b949e' }}>{drawdown.toFixed(2)}%</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={lbl}>Open Risk</span>
            <span style={{ color: openColor }}>
              ${state.open_risk_usd.toFixed(0)} ({state.open_risk_pct.toFixed(1)}%)
            </span>
          </div>
          <BarMeter pct={state.open_risk_pct} max={state.max_open_risk_pct} color={openColor} />
        </div>
      </div>

      {/* Equity curve */}
      <div style={card}>
        <div style={sectionHeader}>Equity Curve</div>
        <EquityCurve points={curve} />
      </div>

      {/* Trade stats */}
      {stats && (
        <div style={card}>
          <div style={sectionHeader}>Trade Statistics</div>
          {(['all_time', 'month', 'today'] as const).map(period => {
            const s = stats[period];
            const label = period === 'all_time' ? 'All Time' : period === 'month' ? 'This Month' : 'Today';
            return (
              <div key={period} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#58a6ff', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
                  <div style={row}><span style={lbl}>Trades</span><span>{s.total}</span></div>
                  <div style={row}><span style={lbl}>Win Rate</span><span style={{ color: s.win_rate >= 50 ? '#3fb950' : '#f85149' }}>{s.win_rate.toFixed(1)}%</span></div>
                  <div style={row}><span style={lbl}>Net PnL</span><span style={{ color: pnlColor(s.total_pnl) }}>{s.total_pnl >= 0 ? '+' : ''}${s.total_pnl.toFixed(2)}</span></div>
                  <div style={row}><span style={lbl}>Expectancy</span><span style={{ color: pnlColor(s.expectancy) }}>${s.expectancy.toFixed(2)}</span></div>
                  <div style={row}><span style={lbl}>Avg Win</span><span style={{ color: '#3fb950' }}>${s.avg_win.toFixed(2)}</span></div>
                  <div style={row}><span style={lbl}>Avg Loss</span><span style={{ color: '#f85149' }}>${s.avg_loss.toFixed(2)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Positions ────────────────────────────────────────────────────────────

function PositionsTab({ state, onRefresh }: { state: AccountState | null; onRefresh: () => void }) {
  const [closeInputs, setCloseInputs] = useState<Record<number, string>>({});

  if (!state) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;

  const open   = state.positions.filter(p => p.status === 'open');
  const closed = state.positions.filter(p => p.status === 'closed').slice(0, 10);

  const handleClose = async (id: number) => {
    const price = parseFloat(closeInputs[id] || '');
    if (!price) { alert('Enter close price'); return; }
    try { await closePosition(id, price); onRefresh(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('Cancel this position?')) return;
    try { await cancelPosition(id); onRefresh(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  return (
    <div style={body}>
      <div style={card}>
        <div style={sectionHeader}>Open Positions ({open.length})</div>
        {open.length === 0 && <div style={{ color: '#8b949e', fontSize: 12 }}>No open positions.</div>}
        {open.map(p => (
          <div key={p.id} style={{ borderBottom: '1px solid #21262d', paddingBottom: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{p.symbol}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                background: p.direction === 'long' ? '#1a4a2e' : '#4a1a1a',
                color: p.direction === 'long' ? '#3fb950' : '#f85149',
              }}>{p.direction.toUpperCase()}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 12 }}>
              <span style={lbl}>Entry: <span style={{ color: '#e6edf3' }}>{p.entry_price?.toFixed(2)}</span></span>
              <span style={lbl}>Size: <span style={{ color: '#e6edf3' }}>${p.size_usd?.toFixed(0)}</span></span>
              {p.stop_loss && <span style={lbl}>SL: <span style={{ color: '#f85149' }}>{p.stop_loss.toFixed(2)}</span></span>}
              {p.tp1      && <span style={lbl}>TP1: <span style={{ color: '#3fb950' }}>{p.tp1.toFixed(2)}</span></span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                style={{ ...inputSt, width: 90 }}
                placeholder="close price"
                value={closeInputs[p.id] || ''}
                onChange={e => setCloseInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
              />
              <button style={btnSm('#238636')} onClick={() => handleClose(p.id)}>Close</button>
              <button style={btnSm('#6e7681')} onClick={() => handleCancel(p.id)}>Cancel</button>
            </div>
          </div>
        ))}
      </div>

      {closed.length > 0 && (
        <div style={card}>
          <div style={sectionHeader}>Recently Closed</div>
          {closed.map(p => (
            <div key={p.id} style={{ ...row, fontSize: 12 }}>
              <span>{p.symbol} <span style={{ color: p.direction === 'long' ? '#3fb950' : '#f85149' }}>{p.direction}</span></span>
              <span style={{ color: '#8b949e' }}>{p.entry_price?.toFixed(2)} → {p.close_price?.toFixed(2)}</span>
              <span style={{ color: pnlColor(p.realized_pnl ?? 0), fontWeight: 700 }}>
                {(p.realized_pnl ?? 0) >= 0 ? '+' : ''}${p.realized_pnl?.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Orders ───────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [filter, setFilter] = useState<'pending' | 'filled' | 'cancelled'>('pending');
  const [fillPrices, setFillPrices] = useState<Record<number, string>>({});
  const [newOrder, setNewOrder] = useState({ symbol: 'BTCUSDT', direction: 'long', size_usd: '', requested_price: '', stop_loss: '', tp1: '' });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await fetchOrders(filter)); } catch { /* */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleFill = async (id: number) => {
    const price = parseFloat(fillPrices[id] || '');
    if (!price) { alert('Enter fill price'); return; }
    try { await fillOrder(id, price); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('Cancel order?')) return;
    try { await cancelOrder(id); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  const handleCreate = async () => {
    const size = parseFloat(newOrder.size_usd);
    if (!size) { alert('Enter size'); return; }
    try {
      const { createOrder } = await import('../api');
      await createOrder({
        symbol:          newOrder.symbol,
        direction:       newOrder.direction,
        size_usd:        size,
        requested_price: newOrder.requested_price ? parseFloat(newOrder.requested_price) : undefined,
        stop_loss:       newOrder.stop_loss       ? parseFloat(newOrder.stop_loss)       : undefined,
        tp1:             newOrder.tp1             ? parseFloat(newOrder.tp1)             : undefined,
      });
      setShowForm(false);
      setNewOrder({ symbol: 'BTCUSDT', direction: 'long', size_usd: '', requested_price: '', stop_loss: '', tp1: '' });
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  const filterStyle = (active: boolean): React.CSSProperties => ({
    ...btnSm(active ? '#1f6feb' : '#21262d'), marginRight: 4,
  });

  return (
    <div style={body}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {(['pending', 'filled', 'cancelled'] as const).map(f => (
          <button key={f} style={filterStyle(filter === f)} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button style={{ ...btnSm('#238636'), marginLeft: 'auto' }} onClick={() => setShowForm(s => !s)}>
          + New Order
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <div style={sectionHeader}>New Paper Order</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Symbol', 'symbol'], ['Direction (long/short)', 'direction'],
              ['Size USD', 'size_usd'], ['Requested Price', 'requested_price'],
              ['Stop Loss', 'stop_loss'], ['TP1', 'tp1'],
            ].map(([label, key]) => (
              <div key={key}>
                <div style={{ ...lbl, marginBottom: 2 }}>{label}</div>
                <input
                  style={{ ...inputSt, width: '100%' }}
                  value={(newOrder as Record<string, string>)[key]}
                  onChange={e => setNewOrder(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={btnSm('#238636')} onClick={handleCreate}>Submit</button>
            <button style={btnSm('#6e7681')} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={sectionHeader}>{filter.charAt(0).toUpperCase() + filter.slice(1)} Orders ({orders.length})</div>
        {orders.length === 0 && <div style={{ color: '#8b949e', fontSize: 12 }}>No {filter} orders.</div>}
        {orders.map(o => (
          <div key={o.id} style={{ borderBottom: '1px solid #21262d', paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontWeight: 700 }}>{o.symbol}</span>
              <span style={{ fontSize: 11, color: '#8b949e' }}>#{o.id} · {o.order_type}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 12 }}>
              <span style={lbl}>Dir: <span style={{ color: o.direction === 'long' ? '#3fb950' : '#f85149' }}>{o.direction}</span></span>
              <span style={lbl}>Size: <span style={{ color: '#e6edf3' }}>${o.size_usd.toFixed(0)}</span></span>
              {o.requested_price && <span style={lbl}>Price: <span style={{ color: '#e6edf3' }}>{o.requested_price.toFixed(2)}</span></span>}
              {o.filled_price    && <span style={lbl}>Filled: <span style={{ color: '#3fb950' }}>{o.filled_price.toFixed(2)}</span></span>}
            </div>
            {filter === 'pending' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <input
                  style={{ ...inputSt, width: 90 }}
                  placeholder="fill price"
                  value={fillPrices[o.id] || ''}
                  onChange={e => setFillPrices(prev => ({ ...prev, [o.id]: e.target.value }))}
                />
                <button style={btnSm('#238636')} onClick={() => handleFill(o.id)}>Fill</button>
                <button style={btnSm('#6e7681')} onClick={() => handleCancel(o.id)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Risk ─────────────────────────────────────────────────────────────────

function RiskTab({ state, riskSummary, onRefresh }: {
  state: AccountState | null;
  riskSummary: RiskSummary | null;
  onRefresh: () => void;
}) {
  if (!state || !riskSummary) return <div style={{ padding: 14, color: '#8b949e' }}>Loading…</div>;

  const ks = riskSummary.kill_switch_active;
  const openColor  = riskSummary.open_risk_traffic  === 'red' ? '#f85149' : riskSummary.open_risk_traffic  === 'orange' ? '#e3b341' : '#3fb950';
  const dailyColor = riskSummary.daily_loss_traffic === 'red' ? '#f85149' : riskSummary.daily_loss_traffic === 'orange' ? '#e3b341' : '#3fb950';

  const handleKillSwitch = async () => {
    if (!window.confirm(ks ? 'DEACTIVATE kill switch?' : 'ACTIVATE kill switch? All new trades blocked.')) return;
    try { await toggleKillSwitch(!ks); onRefresh(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  };

  // Group open positions by symbol for per-symbol risk
  const bySymbol: Record<string, { risk_usd: number; count: number }> = {};
  for (const p of state.positions) {
    if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { risk_usd: 0, count: 0 };
    bySymbol[p.symbol].count++;
    if (p.entry_price && p.stop_loss && p.size_usd) {
      const riskPct = Math.abs(p.entry_price - p.stop_loss) / p.entry_price;
      bySymbol[p.symbol].risk_usd += riskPct * p.size_usd;
    }
  }

  const rules = [
    { label: 'Kill switch off',         ok: !ks },
    { label: 'Open risk within limit',  ok: riskSummary.open_risk_pct  < riskSummary.max_open_risk_pct  },
    { label: 'Daily loss within limit', ok: riskSummary.daily_loss_pct < riskSummary.daily_loss_limit_pct },
    { label: 'Per-trade limit set',     ok: riskSummary.max_risk_per_trade_pct > 0 },
  ];

  return (
    <div style={body}>
      <div style={{
        ...card,
        border: ks ? '1px solid #f85149' : '1px solid #30363d',
        background: ks ? '#1a0a0a' : '#161b22',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ ...sectionHeader, color: ks ? '#f85149' : '#8b949e', marginBottom: 2 }}>Kill Switch</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>{ks ? 'All new trades are blocked.' : 'Trading is enabled.'}</div>
          </div>
          <button style={btnSm(ks ? '#238636' : '#b62324')} onClick={handleKillSwitch}>
            {ks ? 'Resume' : 'Kill'}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={sectionHeader}>Exposure Summary</div>
        <div style={row}><span style={lbl}>Open Positions</span><span>{state.open_count}</span></div>
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={lbl}>Open Risk</span>
            <span style={{ color: openColor }}>${riskSummary.open_risk_usd.toFixed(0)} ({riskSummary.open_risk_pct.toFixed(1)}% / {riskSummary.max_open_risk_pct}%)</span>
          </div>
          <BarMeter pct={riskSummary.open_risk_pct} max={riskSummary.max_open_risk_pct} color={openColor} />
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={lbl}>Daily Drawdown</span>
            <span style={{ color: dailyColor }}>{riskSummary.daily_loss_pct.toFixed(2)}% / {riskSummary.daily_loss_limit_pct}%</span>
          </div>
          <BarMeter pct={riskSummary.daily_loss_pct} max={riskSummary.daily_loss_limit_pct} color={dailyColor} />
        </div>
      </div>

      {Object.keys(bySymbol).length > 0 && (
        <div style={card}>
          <div style={sectionHeader}>Risk by Symbol</div>
          {Object.entries(bySymbol).map(([sym, data]) => (
            <div key={sym} style={row}>
              <span>{sym}</span>
              <span style={lbl}>{data.count} position{data.count !== 1 ? 's' : ''}</span>
              <span>${data.risk_usd.toFixed(0)} at risk</span>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={sectionHeader}>Rule Adherence</div>
        {rules.map((r, i) => (
          <div key={i} style={row}>
            <span style={lbl}>{r.label}</span>
            <span style={{ color: r.ok ? '#3fb950' : '#f85149', fontWeight: 700 }}>
              {r.ok ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionHeader}>Risk Parameters</div>
        <div style={row}><span style={lbl}>Per-Trade Max Risk</span><span>{state.max_risk_per_trade_pct}%</span></div>
        <div style={row}><span style={lbl}>Max Open Risk</span><span>{state.max_open_risk_pct}%</span></div>
        <div style={row}><span style={lbl}>Daily Loss Limit</span><span>{state.daily_loss_limit_pct}%</span></div>
      </div>
    </div>
  );
}

// ── Tab: Config ───────────────────────────────────────────────────────────────

function ConfigTab({ onRefresh }: { onRefresh: () => void }) {
  const [cfg, setCfg]   = useState<AccountConfig | null>(null);
  const [form, setForm] = useState({ starting_capital: '', max_risk_per_trade_pct: '', max_open_risk_pct: '', daily_loss_limit_pct: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAccountConfig().then(c => {
      setCfg(c);
      setForm({
        starting_capital:       String(c.starting_capital),
        max_risk_per_trade_pct: String(c.max_risk_per_trade_pct),
        max_open_risk_pct:      String(c.max_open_risk_pct),
        daily_loss_limit_pct:   String(c.daily_loss_limit_pct),
      });
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await updateAccountConfig({
        starting_capital:       parseFloat(form.starting_capital)       || undefined,
        max_risk_per_trade_pct: parseFloat(form.max_risk_per_trade_pct) || undefined,
        max_open_risk_pct:      parseFloat(form.max_open_risk_pct)      || undefined,
        daily_loss_limit_pct:   parseFloat(form.daily_loss_limit_pct)   || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Save failed'); }
  };

  const fields: [string, keyof typeof form][] = [
    ['Starting Capital ($)', 'starting_capital'],
    ['Max Risk per Trade (%)', 'max_risk_per_trade_pct'],
    ['Max Open Risk (%)', 'max_open_risk_pct'],
    ['Daily Loss Limit (%)', 'daily_loss_limit_pct'],
  ];

  return (
    <div style={body}>
      <div style={card}>
        <div style={sectionHeader}>Account Configuration</div>
        {fields.map(([label, key]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ ...lbl, marginBottom: 3 }}>{label}</div>
            <input
              style={{ ...inputSt, width: 140 }}
              value={form[key]}
              onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
        <button
          style={{ ...btnSm(saved ? '#238636' : '#1f6feb'), marginTop: 4, padding: '6px 16px' }}
          onClick={handleSave}
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {cfg && (
        <div style={{ ...card, fontSize: 11, color: '#8b949e' }}>
          Last updated: {cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : 'unknown'}
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'positions' | 'orders' | 'risk' | 'config';

export default function AccountWorkspace() {
  const [tab, setTab] = useState<Tab>('overview');
  const [state,       setState]       = useState<AccountState | null>(null);
  const [curve,       setCurve]       = useState<EquityCurvePoint[]>([]);
  const [stats,       setStats]       = useState<TradeStats | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, c, t, r] = await Promise.all([
        fetchAccountState(),
        fetchEquityCurve(),
        fetchTradeStats(),
        getRiskSummary(),
      ]);
      setState(s);
      setCurve(c);
      setStats(t);
      setRiskSummary(r);
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview'   },
    { id: 'positions',  label: 'Positions'  },
    { id: 'orders',     label: 'Orders'     },
    { id: 'risk',       label: 'Risk'       },
    { id: 'config',     label: 'Config'     },
  ];

  return (
    <div style={ws}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px 0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Account</span>
        <span style={{ fontSize: 11, color: '#8b949e' }}>{lastRefresh ? `Updated ${lastRefresh}` : ''}</span>
      </div>
      <div style={tabBarStyle}>
        {TABS.map(t => (
          <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab  state={state} curve={curve} stats={stats} riskSummary={riskSummary} />}
      {tab === 'positions' && <PositionsTab state={state} onRefresh={load} />}
      {tab === 'orders'    && <OrdersTab />}
      {tab === 'risk'      && <RiskTab state={state} riskSummary={riskSummary} onRefresh={load} />}
      {tab === 'config'    && <ConfigTab onRefresh={load} />}
    </div>
  );
}
