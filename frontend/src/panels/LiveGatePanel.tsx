import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

// ── API types ──────────────────────────────────────────────────────────────────

interface GateCheck {
  name: string;
  pass: boolean;
  note: string;
}

interface GateStatus {
  all_pass:          boolean;
  live_mode_enabled: boolean;
  kill_switch_active: boolean;
  okx_sandbox:       boolean;
  keys_configured:   boolean;
  gates:             GateCheck[];
}

interface LiveOrder {
  id:           number;
  symbol:       string;
  direction:    string;
  order_type:   string;
  size_usd:     number;
  entry_price:  number | null;
  stop_loss:    number | null;
  tp1:          number | null;
  okx_order_id: string | null;
  okx_status:   string | null;
  created_at:   string;
  fill_price:   number | null;
  error_msg:    string | null;
  notes:        string | null;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

// ── Main component ─────────────────────────────────────────────────────────────

export default function LiveGatePanel() {
  const [gate,       setGate]       = useState<GateStatus | null>(null);
  const [orders,     setOrders]     = useState<LiveOrder[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Enable flow state
  const [enableStep, setEnableStep] = useState<0 | 1 | 2 | 3>(0);
  const [confirmText, setConfirmText] = useState('');
  const [enableError, setEnableError] = useState('');
  const [enableBusy,  setEnableBusy]  = useState(false);

  // Order form state
  const [form, setForm] = useState({
    symbol:      'BTCUSDT',
    direction:   'long',
    size_usd:    '500',
    entry_price: '',
    stop_loss:   '',
    tp1:         '',
    order_type:  'limit',
    notes:       '',
  });
  const [orderBusy,  setOrderBusy]  = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderOk,    setOrderOk]    = useState('');

  const load = useCallback(async () => {
    try {
      const [gResp, oResp] = await Promise.all([
        fetch('/api/live/gate'),
        fetch('/api/live/orders?limit=20'),
      ]);
      if (gResp.ok) setGate(await gResp.json());
      if (oResp.ok) setOrders(await oResp.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function handleTestKeys() {
    setTestResult('Testing…');
    const resp = await fetch('/api/live/test');
    const data = await resp.json();
    setTestResult(data.ok ? `✓ ${data.message}` : `✗ ${data.error}`);
    setTimeout(() => setTestResult(null), 8000);
  }

  async function handleEnable() {
    if (confirmText.trim() !== 'ENABLE LIVE TRADING') {
      setEnableError('Type exactly: ENABLE LIVE TRADING');
      return;
    }
    setEnableBusy(true);
    setEnableError('');
    try {
      const resp = await fetch('/api/live/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirmText.trim() }),
      });
      if (resp.ok) {
        setEnableStep(0);
        setConfirmText('');
        await load();
      } else {
        const j = await resp.json().catch(() => ({}));
        setEnableError(j.detail ?? 'Enable failed');
      }
    } finally {
      setEnableBusy(false);
    }
  }

  async function handleDisable() {
    const resp = await fetch('/api/live/disable', { method: 'POST' });
    if (resp.ok) await load();
  }

  async function handlePlaceOrder() {
    setOrderBusy(true);
    setOrderError('');
    setOrderOk('');
    try {
      const body: Record<string, unknown> = {
        symbol:    form.symbol,
        direction: form.direction,
        size_usd:  parseFloat(form.size_usd) || 0,
        order_type: form.order_type,
        notes:     form.notes || null,
      };
      if (form.entry_price) body.entry_price = parseFloat(form.entry_price);
      if (form.stop_loss)   body.stop_loss   = parseFloat(form.stop_loss);
      if (form.tp1)         body.tp1         = parseFloat(form.tp1);

      const resp = await fetch('/api/live/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const order = await resp.json();
        setOrderOk(`Order placed — OKX ID: ${order.okx_order_id ?? 'pending'}`);
        setForm(f => ({ ...f, entry_price: '', stop_loss: '', tp1: '', notes: '' }));
        await load();
      } else {
        const j = await resp.json().catch(() => ({}));
        setOrderError(j.detail ?? 'Order failed');
      }
    } finally {
      setOrderBusy(false);
    }
  }

  async function handleCancel(orderId: number) {
    try {
      await fetch(`/api/live/orders/${orderId}/cancel`, { method: 'POST' });
      await load();
    } catch {
      // ignore
    }
  }

  if (loading) return <div style={wrap}>Loading…</div>;
  if (!gate)   return <div style={wrap}>Failed to load gate status.</div>;

  const liveEnabled = gate.live_mode_enabled;

  return (
    <div style={wrap}>

      {/* ── Status header ── */}
      <div style={statusBar(liveEnabled)}>
        <span style={statusDot(liveEnabled)} />
        <strong>{liveEnabled ? 'LIVE MODE ACTIVE' : 'PAPER MODE'}</strong>
        {gate.okx_sandbox && <span style={sandboxBadge}>SANDBOX</span>}
        {liveEnabled && !gate.okx_sandbox && <span style={realBadge}>REAL MONEY</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b949e' }}>
          OKX Perpetual Swaps
        </span>
      </div>

      {/* ── Gate checklist ── */}
      <Section title="Live Mode Requirements">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gate.gates.map((g) => (
            <div key={g.name} style={gateRow}>
              <span style={gateDot(g.pass)}>{g.pass ? '✓' : '✗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: g.pass ? '#3fb950' : '#f85149', fontSize: 12, fontWeight: 700 }}>
                  {g.name}
                </div>
                {!g.pass && <div style={{ color: '#8b949e', fontSize: 11 }}>{g.note}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button style={btnSm('#21262d')} onClick={handleTestKeys}>
            Test OKX Keys
          </button>
          {testResult && (
            <span style={{ fontSize: 11, color: testResult.startsWith('✓') ? '#3fb950' : '#f85149' }}>
              {testResult}
            </span>
          )}
        </div>
      </Section>

      {/* ── Enable / disable ── */}
      <Section title={liveEnabled ? 'Disable Live Mode' : 'Enable Live Mode'}>
        {liveEnabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={warn}>
              Disabling live mode stops new live orders. Existing open positions on OKX
              are not automatically closed — manage them directly on OKX.
            </p>
            <button style={btnDanger} onClick={handleDisable}>Disable Live Mode</button>
          </div>
        ) : enableStep === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ color: '#8b949e', fontSize: 12, margin: 0 }}>
              {gate.all_pass
                ? 'All requirements are met. Proceed through the confirmation steps to enable live trading.'
                : 'Complete all requirements above before enabling live mode.'}
            </p>
            <button
              style={gate.all_pass ? btnPrimary : { ...btnPrimary, opacity: 0.4, cursor: 'not-allowed' }}
              onClick={() => gate.all_pass && setEnableStep(1)}
              disabled={!gate.all_pass}
            >
              Enable Live Mode →
            </button>
          </div>
        ) : enableStep === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={disclaimerStyle}>
              ⚠ IMPORTANT — READ BEFORE CONTINUING
            </p>
            <ul style={{ color: '#e6edf3', fontSize: 12, paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
              <li>Live mode places real orders on OKX{gate.okx_sandbox ? ' (SANDBOX — simulated)' : ' with real money'}.</li>
              <li>All orders require explicit submission from this UI — no autonomous trading.</li>
              <li>Every order goes through the Phase 87 risk engine before placement.</li>
              <li>The kill switch immediately blocks all new live orders when active.</li>
              <li>Open positions are NOT automatically closed if you disable live mode.</li>
              <li>You are fully responsible for positions opened via this platform.</li>
            </ul>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={btnSm('#21262d')} onClick={() => setEnableStep(0)}>← Back</button>
              <button style={btnPrimary} onClick={() => setEnableStep(2)}>I Understand →</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#e6edf3', fontSize: 12, margin: 0 }}>
              Type <strong style={{ color: '#f0a020' }}>ENABLE LIVE TRADING</strong> to confirm:
            </p>
            <input
              style={inputSt}
              placeholder="ENABLE LIVE TRADING"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            {enableError && <span style={{ color: '#f85149', fontSize: 11 }}>{enableError}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnSm('#21262d')} onClick={() => { setEnableStep(1); setConfirmText(''); setEnableError(''); }}>
                ← Back
              </button>
              <button
                style={enableBusy ? { ...btnDanger, opacity: 0.6 } : btnDanger}
                onClick={handleEnable}
                disabled={enableBusy}
              >
                {enableBusy ? 'Enabling…' : 'Confirm Enable Live Mode'}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Order form — only shown when live is enabled ── */}
      {liveEnabled && (
        <Section title="Place Live Order">
          <p style={warn}>
            This places a real {gate.okx_sandbox ? 'SIMULATED (sandbox)' : 'REAL MONEY'} order on OKX.
            Verify all fields before submitting.
          </p>
          <div style={formGrid}>
            <FormRow label="Symbol">
              <select style={inputSt} value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <FormRow label="Direction">
              <select style={inputSt} value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                <option value="long">Long (Buy)</option>
                <option value="short">Short (Sell)</option>
              </select>
            </FormRow>
            <FormRow label="Order Type">
              <select style={inputSt} value={form.order_type} onChange={e => setForm(f => ({ ...f, order_type: e.target.value }))}>
                <option value="limit">Limit</option>
                <option value="market">Market</option>
              </select>
            </FormRow>
            <FormRow label="Size (USD)">
              <input style={inputSt} type="number" value={form.size_usd} onChange={e => setForm(f => ({ ...f, size_usd: e.target.value }))} />
            </FormRow>
            {form.order_type === 'limit' && (
              <FormRow label="Entry Price">
                <input style={inputSt} type="number" placeholder="Required for limit" value={form.entry_price} onChange={e => setForm(f => ({ ...f, entry_price: e.target.value }))} />
              </FormRow>
            )}
            <FormRow label="Stop Loss">
              <input style={inputSt} type="number" placeholder="Optional" value={form.stop_loss} onChange={e => setForm(f => ({ ...f, stop_loss: e.target.value }))} />
            </FormRow>
            <FormRow label="TP1">
              <input style={inputSt} type="number" placeholder="Optional" value={form.tp1} onChange={e => setForm(f => ({ ...f, tp1: e.target.value }))} />
            </FormRow>
            <FormRow label="Notes">
              <input style={inputSt} placeholder="Optional" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </FormRow>
          </div>

          {orderError && <div style={{ color: '#f85149', fontSize: 11, margin: '8px 0' }}>{orderError}</div>}
          {orderOk    && <div style={{ color: '#3fb950', fontSize: 11, margin: '8px 0' }}>{orderOk}</div>}

          <button
            style={orderBusy ? { ...btnDanger, marginTop: 8, opacity: 0.6 } : { ...btnDanger, marginTop: 8 }}
            onClick={handlePlaceOrder}
            disabled={orderBusy}
          >
            {orderBusy ? 'Placing Order…' : `Submit ${gate.okx_sandbox ? 'Simulated' : 'LIVE'} Order`}
          </button>
        </Section>
      )}

      {/* ── Live order history ── */}
      <Section title="Live Order History">
        {orders.length === 0 ? (
          <span style={{ color: '#8b949e', fontSize: 12 }}>No live orders placed yet.</span>
        ) : (
          <table style={tbl}>
            <thead>
              <tr>
                {['Symbol', 'Dir', 'Type', 'Size', 'Entry', 'Status', 'OKX ID', 'Time', ''].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={td}>{o.symbol}</td>
                  <td style={{ ...td, color: o.direction === 'long' ? '#3fb950' : '#f85149' }}>
                    {o.direction.toUpperCase()}
                  </td>
                  <td style={td}>{o.order_type}</td>
                  <td style={td}>${o.size_usd.toFixed(0)}</td>
                  <td style={td}>{o.entry_price ? o.entry_price.toLocaleString() : '—'}</td>
                  <td style={{ ...td, color: statusColor(o.okx_status) }}>{o.okx_status ?? '—'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 10 }}>
                    {o.okx_order_id ? o.okx_order_id.slice(0, 10) + '…' : '—'}
                  </td>
                  <td style={td}>{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td style={td}>
                    {o.okx_status === 'live' && (
                      <button style={btnSm('#c9222222')} onClick={() => handleCancel(o.id)}>Cancel</button>
                    )}
                    {o.error_msg && (
                      <span title={o.error_msg} style={{ color: '#f85149', cursor: 'help' }}>⚠</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={sectionHeader}>{title}</div>
      {children}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function statusColor(s: string | null): string {
  if (!s) return '#8b949e';
  if (s === 'live')      return '#58a6ff';
  if (s === 'filled')    return '#3fb950';
  if (s === 'cancelled') return '#8b949e';
  if (s === 'failed')    return '#f85149';
  return '#e6edf3';
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrap: CSSProperties = {
  height: '100%', overflowY: 'auto', padding: 14,
  display: 'flex', flexDirection: 'column', gap: 12,
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', fontSize: 12,
};

const card: CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px',
};

const sectionHeader: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 10,
};

const statusBar = (live: boolean): CSSProperties => ({
  background: live ? '#0f2a0f' : '#16161a',
  border: `1px solid ${live ? '#3fb950' : '#30363d'}`,
  borderRadius: 6, padding: '8px 14px',
  display: 'flex', alignItems: 'center', gap: 8,
});

const statusDot = (live: boolean): CSSProperties => ({
  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: live ? '#3fb950' : '#666',
  boxShadow: live ? '0 0 6px #3fb950' : 'none',
});

const sandboxBadge: CSSProperties = {
  background: '#1e3a5f', border: '1px solid #3a6aaf', borderRadius: 3,
  color: '#90b8e0', fontSize: 9, fontWeight: 700, padding: '1px 5px',
  letterSpacing: '0.06em',
};

const realBadge: CSSProperties = {
  ...sandboxBadge,
  background: '#3a0000', border: '1px solid #f85149', color: '#f85149',
};

const gateRow: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  padding: '4px 0', borderBottom: '1px solid #21262d',
};

const gateDot = (pass: boolean): CSSProperties => ({
  fontSize: 13, color: pass ? '#3fb950' : '#f85149', flexShrink: 0, lineHeight: 1.4,
});

const warn: CSSProperties = {
  color: '#f0a020', fontSize: 11, margin: '0 0 8px',
  padding: '6px 10px', background: '#2a1a00', border: '1px solid #f0a02044',
  borderRadius: 4, lineHeight: 1.5,
};

const disclaimerStyle: CSSProperties = {
  color: '#f0a020', fontSize: 12, fontWeight: 700, margin: 0,
};

const btnPrimary: CSSProperties = {
  background: '#1a2440', border: '1px solid #3a6aaf', borderRadius: 4,
  color: '#90b8e0', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '5px 14px',
};

const btnDanger: CSSProperties = {
  background: '#3a0000', border: '1px solid #f85149', borderRadius: 4,
  color: '#f85149', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '5px 14px',
};

const btnSm = (bg: string): CSSProperties => ({
  background: bg, border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', cursor: 'pointer', fontSize: 11, padding: '3px 9px',
});

const inputSt: CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', fontSize: 12, padding: '4px 8px', width: '100%',
};

const formGrid: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 10, marginBottom: 8,
};

const tbl: CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 11,
};

const th: CSSProperties = {
  textAlign: 'left', color: '#8b949e', fontSize: 10, fontWeight: 700,
  padding: '4px 6px', borderBottom: '1px solid #30363d', textTransform: 'uppercase',
};

const td: CSSProperties = {
  padding: '4px 6px', color: '#e6edf3',
};
