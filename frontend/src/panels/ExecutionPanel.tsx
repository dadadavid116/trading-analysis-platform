import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchProposals, approveProposal, rejectProposal, createProposal, runSlTpCheck,
  ExecutionProposal,
} from '../api';

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace',
  fontSize: 13, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const tabBar: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid #21262d', padding: '0 12px', flexShrink: 0,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: 'none', border: 'none',
  borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
  color: active ? '#e6edf3' : '#8b949e', cursor: 'pointer',
  fontSize: 12, fontWeight: 700, padding: '8px 12px', marginRight: 4,
});

const bodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
};

const card: React.CSSProperties = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '10px 12px',
};

const secHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8b949e',
  textTransform: 'uppercase', marginBottom: 8,
};

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', fontSize: 12,
  padding: '2px 0', borderBottom: '1px solid #21262d',
};

const lbl: React.CSSProperties = { color: '#8b949e' };

const btnBase = (bg: string): React.CSSProperties => ({
  background: bg, border: 'none', borderRadius: 4, color: '#fff',
  cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '5px 10px',
});

const inputSt: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 4,
  color: '#e6edf3', fontSize: 12, padding: '3px 7px',
};

function verdictBadge(v: string) {
  const map: Record<string, [string, string]> = {
    approved: ['#1a4a2e', '#3fb950'],
    warning:  ['#3a2e10', '#e3b341'],
    blocked:  ['#3a1010', '#f85149'],
  };
  const [bg, fg] = map[v] ?? ['#21262d', '#8b949e'];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: bg, color: fg, textTransform: 'uppercase' }}>
      {v}
    </span>
  );
}

// ── Proposal Card ──────────────────────────────────────────────────────────────

function ProposalCard({ prop, onRefresh }: { prop: ExecutionProposal; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);

  const handle = async (action: 'approve' | 'reject') => {
    if (!window.confirm(action === 'approve'
      ? `Approve — open ${prop.direction.toUpperCase()} ${prop.symbol} $${prop.size_usd.toFixed(0)}?`
      : `Reject this proposal?`
    )) return;
    setBusy(true);
    try {
      action === 'approve' ? await approveProposal(prop.id) : await rejectProposal(prop.id);
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally { setBusy(false); }
  };

  const rr = prop.stop_loss && prop.tp1 && prop.entry_price
    ? (Math.abs(prop.tp1 - prop.entry_price) / Math.abs(prop.entry_price - prop.stop_loss)).toFixed(1)
    : null;

  const borderColor = prop.risk_verdict === 'blocked' ? '#f85149' : prop.risk_verdict === 'warning' ? '#e3b341' : '#30363d';

  return (
    <div style={{ ...card, border: `1px solid ${borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>{prop.symbol}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
            background: prop.direction === 'long' ? '#1a4a2e' : '#4a1a1a',
            color: prop.direction === 'long' ? '#3fb950' : '#f85149',
          }}>{prop.direction.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: '#8b949e' }}>{prop.timeframe}</span>
        </div>
        {verdictBadge(prop.risk_verdict)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', marginBottom: 6 }}>
        <div style={row}><span style={lbl}>Entry</span><span>{prop.entry_price.toFixed(4)}</span></div>
        <div style={row}><span style={lbl}>Size</span><span style={{ fontWeight: 700 }}>${prop.size_usd.toFixed(0)}</span></div>
        {prop.stop_loss && <div style={row}><span style={lbl}>SL</span><span style={{ color: '#f85149' }}>{prop.stop_loss.toFixed(4)}</span></div>}
        {prop.tp1       && <div style={row}><span style={lbl}>TP1</span><span style={{ color: '#3fb950' }}>{prop.tp1.toFixed(4)}</span></div>}
        {prop.risk_usd  != null && <div style={row}><span style={lbl}>Risk $</span><span>${prop.risk_usd.toFixed(2)}</span></div>}
        {prop.risk_pct  != null && <div style={row}><span style={lbl}>Risk %</span><span>{prop.risk_pct.toFixed(2)}%</span></div>}
        {rr             && <div style={row}><span style={lbl}>R:R</span><span>1:{rr}</span></div>}
      </div>

      {prop.risk_reasons.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {prop.risk_reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: '#f85149' }}>⊘ {r}</div>
          ))}
        </div>
      )}
      {prop.risk_warnings.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {prop.risk_warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: '#e3b341' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      {prop.status === 'pending' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button style={btnBase('#238636')} disabled={busy} onClick={() => handle('approve')}>
            ✓ Approve
          </button>
          <button style={btnBase('#6e7681')} disabled={busy} onClick={() => handle('reject')}>
            ✗ Reject
          </button>
        </div>
      )}
      {prop.status !== 'pending' && (
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
          {prop.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
          {prop.reviewed_at ? ` · ${new Date(prop.reviewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          {prop.position_id ? ` · Position #${prop.position_id}` : ''}
        </div>
      )}
    </div>
  );
}

// ── Manual Proposal Form ──────────────────────────────────────────────────────

function ManualProposalForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    symbol: 'BTCUSDT', direction: 'long', entry_price: '', stop_loss: '',
    tp1: '', tp2: '', tp3: '', timeframe: '15m',
  });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    const ep = parseFloat(form.entry_price);
    const sl = parseFloat(form.stop_loss);
    if (!ep || !sl) { setErr('Entry price and stop loss are required.'); return; }
    setBusy(true); setErr(null);
    try {
      await createProposal({
        symbol:      form.symbol,
        direction:   form.direction,
        entry_price: ep,
        stop_loss:   sl,
        tp1: form.tp1 ? parseFloat(form.tp1) : undefined,
        tp2: form.tp2 ? parseFloat(form.tp2) : undefined,
        tp3: form.tp3 ? parseFloat(form.tp3) : undefined,
        timeframe:   form.timeframe,
      });
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create proposal');
    } finally { setBusy(false); }
  };

  const fields: [string, string, string][] = [
    ['Symbol',       'symbol',      'BTCUSDT'],
    ['Direction',    'direction',   'long / short'],
    ['Entry Price',  'entry_price', 'required'],
    ['Stop Loss',    'stop_loss',   'required'],
    ['TP1',          'tp1',         'optional'],
    ['TP2',          'tp2',         'optional'],
    ['TP3',          'tp3',         'optional'],
    ['Timeframe',    'timeframe',   '15m'],
  ];

  return (
    <div style={card}>
      <div style={secHeader}>Manual Proposal</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {fields.map(([label, key, ph]) => (
          <div key={key}>
            <div style={{ ...lbl, fontSize: 11, marginBottom: 2 }}>{label}</div>
            <input style={{ ...inputSt, width: '100%' }}
              placeholder={ph}
              value={(form as Record<string, string>)[key]}
              onChange={e => set(key, e.target.value)} />
          </div>
        ))}
      </div>
      {err && <div style={{ color: '#f85149', fontSize: 11, marginBottom: 6 }}>{err}</div>}
      <button style={{ ...btnBase('#1f6feb'), width: '100%' }} disabled={busy} onClick={handleSubmit}>
        {busy ? 'Creating…' : 'Create Proposal'}
      </button>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'history' | 'new';

export default function ExecutionPanel() {
  const [tab,       setTab]      = useState<Tab>('pending');
  const [proposals, setProposals] = useState<ExecutionProposal[]>([]);
  const [checking,  setChecking] = useState(false);
  const [checkMsg,  setCheckMsg] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const status = tab === 'pending' ? 'pending' : tab === 'history' ? 'approved,rejected' : undefined;
      setProposals(await fetchProposals(status));
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { /* silent */ }
  }, [tab]);

  useEffect(() => {
    if (tab !== 'new') { load(); }
    const id = setInterval(() => { if (tab !== 'new') load(); }, 15_000);
    return () => clearInterval(id);
  }, [load, tab]);

  const handleCheck = async () => {
    setChecking(true); setCheckMsg(null);
    try {
      const r = await runSlTpCheck();
      setCheckMsg(r.count > 0 ? `${r.count} position(s) auto-closed.` : 'No SL/TP levels hit.');
      if (r.count > 0) load();
    } catch (e: unknown) {
      setCheckMsg(e instanceof Error ? e.message : 'Check failed');
    } finally { setChecking(false); }
  };

  const pendingCount = proposals.filter(p => p.status === 'pending').length;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 0', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          Execution {pendingCount > 0 && tab !== 'pending' ? <span style={{ fontSize: 11, background: '#f85149', borderRadius: 10, padding: '1px 5px', marginLeft: 4 }}>{pendingCount}</span> : ''}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...btnBase('#21262d'), fontSize: 11 }} disabled={checking} onClick={handleCheck}>
            {checking ? 'Checking…' : '⟳ SL/TP'}
          </button>
          <span style={{ fontSize: 11, color: '#8b949e', alignSelf: 'center' }}>{lastRefresh}</span>
        </div>
      </div>

      {checkMsg && (
        <div style={{ margin: '4px 12px 0', fontSize: 11, color: '#e3b341', background: '#3a2e1022', padding: '4px 8px', borderRadius: 4 }}>
          {checkMsg}
        </div>
      )}

      <div style={tabBar}>
        <button style={tabBtn(tab === 'pending')} onClick={() => setTab('pending')}>
          Pending {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
        <button style={tabBtn(tab === 'history')} onClick={() => setTab('history')}>History</button>
        <button style={tabBtn(tab === 'new')}     onClick={() => setTab('new')}>+ Manual</button>
      </div>

      <div style={bodyStyle}>
        {tab === 'new' ? (
          <ManualProposalForm onCreated={() => { setTab('pending'); load(); }} />
        ) : proposals.length === 0 ? (
          <div style={{ color: '#8b949e', fontSize: 12 }}>
            {tab === 'pending' ? 'No pending proposals. Click "Execute" on a signal or use "+ Manual".' : 'No history.'}
          </div>
        ) : (
          proposals.map(p => <ProposalCard key={p.id} prop={p} onRefresh={load} />)
        )}
      </div>
    </div>
  );
}
