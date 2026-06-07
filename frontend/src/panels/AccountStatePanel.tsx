import { useState, useEffect, useCallback, CSSProperties } from 'react';
import {
  fetchAccountState, updateAccountConfig, closePosition, cancelPosition,
} from '../api';
import type { AccountState, AccountPosition } from '../api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtUsd(n: number): string {
  return `$${fmt(n, 0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function pnlColor(n: number): string {
  return n > 0 ? '#26a69a' : n < 0 ? '#ef5350' : '#aaa';
}

function riskColor(pct: number, max: number): string {
  const ratio = pct / max;
  if (ratio >= 0.9) return '#ef5350';
  if (ratio >= 0.6) return '#f5a623';
  return '#26a69a';
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: '10px', color: '#666' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: color ?? '#d0d0d0', fontFamily: 'monospace' }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: '9px', color: '#555', marginLeft: '4px' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ── Position row ───────────────────────────────────────────────────────────────

function PositionRow({
  pos, onClose, onCancel, busy,
}: {
  pos:      AccountPosition;
  onClose:  (id: number) => void;
  onCancel: (id: number) => void;
  busy:     boolean;
}) {
  const [closeInput, setCloseInput] = useState('');
  const [showClose,  setShowClose]  = useState(false);
  const isLong  = pos.direction === 'long';
  const color   = isLong ? '#26a69a' : '#ef5350';
  const base    = pos.symbol.replace('USDT', '');

  return (
    <div style={posCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            backgroundColor: `${color}22`, border: `1px solid ${color}55`,
            borderRadius: '3px', color, fontSize: '9px', fontWeight: 700, padding: '1px 5px',
          }}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <span style={{ fontSize: '11px', color: '#ccc', fontWeight: 600 }}>{base}/USDT</span>
        </div>
        <span style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>
          {fmtUsd(pos.size_usd)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#888', fontFamily: 'monospace', marginTop: '2px' }}>
        <span>Entry <span style={{ color: '#ccc' }}>${fmt(pos.entry_price, 0)}</span></span>
        {pos.stop_loss && <span>SL <span style={{ color: '#ef5350' }}>${fmt(pos.stop_loss, 0)}</span></span>}
        {pos.tp1 && <span>TP <span style={{ color: '#26a69a' }}>${fmt(pos.tp1, 0)}</span></span>}
      </div>

      {showClose ? (
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <input
            type="number"
            value={closeInput}
            onChange={(e) => setCloseInput(e.target.value)}
            placeholder="Close price"
            style={inputStyle}
          />
          <button
            onClick={() => { if (closeInput) onClose(pos.id); setShowClose(false); }}
            disabled={!closeInput || busy}
            style={{ ...smallBtnStyle, borderColor: '#26a69a44', color: '#26a69a' }}
          >
            Close
          </button>
          <button onClick={() => setShowClose(false)} style={{ ...smallBtnStyle, borderColor: '#333', color: '#666' }}>
            ✕
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <button onClick={() => setShowClose(true)} style={{ ...smallBtnStyle, borderColor: '#26a69a44', color: '#26a69a' }}>
            Close
          </button>
          <button onClick={() => onCancel(pos.id)} disabled={busy} style={{ ...smallBtnStyle, borderColor: '#3a2a2a', color: '#7a4a4a' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Config modal ───────────────────────────────────────────────────────────────

function ConfigModal({ state, onSave, onClose }: {
  state:   AccountState;
  onSave:  (patch: { starting_capital?: number; max_risk_per_trade_pct?: number; max_open_risk_pct?: number; daily_loss_limit_pct?: number }) => void;
  onClose: () => void;
}) {
  const [capital, setCapital] = useState(String(state.starting_capital));
  const [rpt,     setRpt]     = useState(String(state.max_risk_per_trade_pct));
  const [total,   setTotal]   = useState(String(state.max_open_risk_pct));
  const [daily,   setDaily]   = useState(String(state.daily_loss_limit_pct));

  const handleSave = () => {
    onSave({
      starting_capital:       parseFloat(capital)  || undefined,
      max_risk_per_trade_pct: parseFloat(rpt)      || undefined,
      max_open_risk_pct:      parseFloat(total)    || undefined,
      daily_loss_limit_pct:   parseFloat(daily)    || undefined,
    });
    onClose();
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalBoxStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#d0d0d0' }}>Account Configuration</span>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>
        <ConfigField label="Starting Capital ($)" value={capital} onChange={setCapital} />
        <ConfigField label="Max Risk / Trade (%)" value={rpt}     onChange={setRpt}    />
        <ConfigField label="Max Open Risk (%)"    value={total}   onChange={setTotal}  />
        <ConfigField label="Daily Loss Limit (%)" value={daily}   onChange={setDaily}  />
        <button onClick={handleSave} style={saveBtnStyle}>Save</button>
      </div>
    </div>
  );
}

function ConfigField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '9px', color: '#888', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function AccountStatePanel() {
  const [state,       setState]       = useState<AccountState | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showConfig,  setShowConfig]  = useState(false);
  const [busyId,      setBusyId]      = useState<number | null>(null);
  const [lastUpdate,  setLastUpdate]  = useState('');

  const load = useCallback(async () => {
    try {
      const s = await fetchAccountState();
      setState(s);
      setError(null);
      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  const handleSaveConfig = async (patch: Parameters<typeof updateAccountConfig>[0]) => {
    try { await updateAccountConfig(patch); await load(); } catch (e) { setError((e as Error).message); }
  };

  const handleClose = async (id: number) => {
    const price = parseFloat(
      // eslint-disable-next-line no-alert
      window.prompt('Close price:') ?? ''
    );
    if (!price) return;
    setBusyId(id);
    try { await closePosition(id, price); await load(); } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  };

  const handleCancel = async (id: number) => {
    setBusyId(id);
    try { await cancelPosition(id); await load(); } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  };

  if (loading && !state) {
    return <div style={wrapStyle}><span style={{ fontSize: '11px', color: '#555', padding: '16px' }}>Loading…</span></div>;
  }

  if (error && !state) {
    return <div style={wrapStyle}><span style={{ fontSize: '11px', color: '#ef5350', padding: '16px' }}>{error}</span></div>;
  }

  if (!state) return null;

  const equityPnlPct = state.starting_capital > 0
    ? (state.realized_pnl / state.starting_capital) * 100
    : 0;

  return (
    <div style={wrapStyle}>
      {showConfig && (
        <ConfigModal state={state} onSave={handleSaveConfig} onClose={() => setShowConfig(false)} />
      )}

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#d0d0d0' }}>
          Account · {state.currency}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', color: '#444' }}>
            {loading ? 'updating…' : lastUpdate ? `updated ${lastUpdate}` : ''}
          </span>
          <button onClick={() => setShowConfig(true)} style={configBtnStyle} title="Configure account">
            ⚙
          </button>
        </div>
      </div>

      <div style={scrollStyle}>
        {/* Equity summary */}
        <section style={sectionStyle}>
          <div style={sectionLabelStyle}>Equity</div>
          <MetricRow label="Starting capital" value={fmtUsd(state.starting_capital)} />
          <MetricRow
            label="Current equity"
            value={fmtUsd(state.current_equity)}
            sub={equityPnlPct !== 0 ? fmtPct(equityPnlPct) : undefined}
            color={state.current_equity >= state.starting_capital ? '#26a69a' : '#ef5350'}
          />
          <MetricRow
            label="Realized PnL"
            value={`${state.realized_pnl >= 0 ? '+' : ''}${fmtUsd(state.realized_pnl)}`}
            color={pnlColor(state.realized_pnl)}
          />
        </section>

        {/* Exposure */}
        <section style={sectionStyle}>
          <div style={sectionLabelStyle}>Open Exposure</div>
          <MetricRow
            label="Open positions"
            value={String(state.open_count)}
          />
          <MetricRow
            label="Open risk"
            value={fmtUsd(state.open_risk_usd)}
            sub={`${state.open_risk_pct.toFixed(1)}% of equity`}
            color={riskColor(state.open_risk_pct, state.max_open_risk_pct)}
          />
          {/* Risk bar */}
          <div style={{ marginTop: '4px', height: '4px', backgroundColor: '#1a1a1e', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: '2px',
              width: `${Math.min(100, state.open_risk_pct / state.max_open_risk_pct * 100)}%`,
              backgroundColor: riskColor(state.open_risk_pct, state.max_open_risk_pct),
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span style={{ fontSize: '9px', color: '#555' }}>0%</span>
            <span style={{ fontSize: '9px', color: '#555' }}>max {state.max_open_risk_pct}%</span>
          </div>
        </section>

        {/* Risk parameters */}
        <section style={sectionStyle}>
          <div style={sectionLabelStyle}>Risk Limits</div>
          <MetricRow
            label="Max risk / trade"
            value={`${state.max_risk_per_trade_pct}%`}
            sub={`= ${fmtUsd(state.max_risk_per_trade_usd)}`}
          />
          <MetricRow label="Max open risk"      value={`${state.max_open_risk_pct}%`} />
          <MetricRow label="Daily loss limit"   value={`${state.daily_loss_limit_pct}%`} />
        </section>

        {/* Open positions */}
        {state.positions.length > 0 && (
          <section style={sectionStyle}>
            <div style={sectionLabelStyle}>Open Positions ({state.positions.length})</div>
            {state.positions.map((p) => (
              <PositionRow
                key={p.id}
                pos={p}
                onClose={handleClose}
                onCancel={handleCancel}
                busy={busyId === p.id}
              />
            ))}
          </section>
        )}

        {state.positions.length === 0 && (
          <div style={{ fontSize: '10px', color: '#444', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
            No open positions
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrapStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  height:        '100%',
  overflow:      'hidden',
  backgroundColor: '#111115',
  position:      'relative',
};

const headerStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'space-between',
  padding:         '8px 12px',
  borderBottom:    '1px solid #1e1e22',
  flexShrink:      0,
};

const scrollStyle: CSSProperties = {
  flex:      1,
  overflowY: 'auto',
  padding:   '8px 12px',
  display:   'flex',
  flexDirection: 'column',
  gap:       '6px',
};

const sectionStyle: CSSProperties = {
  backgroundColor: '#16161a',
  border:          '1px solid #1e1e22',
  borderRadius:    '6px',
  padding:         '8px 10px',
};

const sectionLabelStyle: CSSProperties = {
  fontSize:      '9px',
  color:         '#555',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom:  '4px',
};

const posCardStyle: CSSProperties = {
  backgroundColor: '#1a1a22',
  border:          '1px solid #222',
  borderRadius:    '5px',
  padding:         '6px 8px',
  marginTop:       '4px',
};

const inputStyle: CSSProperties = {
  background:   '#0e0e12',
  border:       '1px solid #333',
  borderRadius: '3px',
  color:        '#d0d0d0',
  fontSize:     '10px',
  padding:      '3px 6px',
  outline:      'none',
};

const smallBtnStyle: CSSProperties = {
  background:   'none',
  border:       '1px solid',
  borderRadius: '3px',
  cursor:       'pointer',
  fontSize:     '9px',
  fontWeight:   600,
  padding:      '2px 7px',
  transition:   'all 0.12s',
};

const configBtnStyle: CSSProperties = {
  background:   'none',
  border:       '1px solid #2a2a2e',
  borderRadius: '3px',
  color:        '#555',
  cursor:       'pointer',
  fontSize:     '12px',
  padding:      '2px 5px',
  lineHeight:   1,
};

const modalOverlayStyle: CSSProperties = {
  position:        'absolute',
  inset:           0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  zIndex:          30,
};

const modalBoxStyle: CSSProperties = {
  backgroundColor: '#16161a',
  border:          '1px solid #2a2a2e',
  borderRadius:    '8px',
  padding:         '14px 16px',
  width:           '240px',
  boxShadow:       '0 8px 32px rgba(0,0,0,0.7)',
};

const closeBtnStyle: CSSProperties = {
  background:   'none',
  border:       'none',
  color:        '#666',
  cursor:       'pointer',
  fontSize:     '16px',
  lineHeight:   1,
  padding:      '0 2px',
};

const saveBtnStyle: CSSProperties = {
  backgroundColor: '#1e3a5f',
  border:          '1px solid #3a6a9f',
  borderRadius:    '4px',
  color:           '#90b8e0',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      600,
  padding:         '5px 0',
  width:           '100%',
  marginTop:       '4px',
};
