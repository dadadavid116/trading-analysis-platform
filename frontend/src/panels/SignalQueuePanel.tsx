import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { fetchSignals, activateSignal, invalidateSignal, createProposal } from '../api';
import type { Signal, SignalStatus } from '../api';

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SignalStatus, string> = {
  candidate:   'Candidate',
  active:      'Active',
  hit_tp:      'TP Hit',
  hit_sl:      'SL Hit',
  invalidated: 'Invalidated',
  expired:     'Expired',
};

const STATUS_COLOR: Record<SignalStatus, string> = {
  candidate:   '#4a90d9',
  active:      '#26a69a',
  hit_tp:      '#66bb6a',
  hit_sl:      '#ef5350',
  invalidated: '#888',
  expired:     '#555',
};

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'Live',    value: 'candidate,active' },
  { label: 'Closed',  value: 'hit_tp,hit_sl,invalidated,expired' },
  { label: 'All',     value: '' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1000
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;
}

function fmtScore(n: number | null | undefined): string {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1);
}

function expiresIn(expires: string | null): string {
  if (!expires) return '';
  const diff = new Date(expires).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function createdAgo(created: string): string {
  const diff = Date.now() - new Date(created).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({
  signal, onActivate, onInvalidate, onExecute,
}: {
  signal:      Signal;
  onActivate:  (id: number) => void;
  onInvalidate:(id: number) => void;
  onExecute:   (id: number) => void;
}) {
  const isLong    = signal.direction === 'long';
  const dirColor  = isLong ? '#26a69a' : '#ef5350';
  const dirLabel  = isLong ? 'LONG' : 'SHORT';
  const sColor    = STATUS_COLOR[signal.status];
  const isOpen    = signal.status === 'candidate' || signal.status === 'active';
  const expiry    = expiresIn(signal.expires_at);
  const base      = signal.symbol.replace('USDT', '');

  return (
    <div style={cardStyle}>
      {/* Top row: direction + symbol + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            backgroundColor: `${dirColor}22`, border: `1px solid ${dirColor}66`,
            borderRadius: '3px', color: dirColor, fontSize: '10px', fontWeight: 700,
            padding: '2px 6px', letterSpacing: '0.05em',
          }}>
            {dirLabel}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#ddd' }}>
            {base}/USDT
          </span>
          <span style={{ fontSize: '10px', color: '#666' }}>{signal.timeframe}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            backgroundColor: `${sColor}18`, border: `1px solid ${sColor}55`,
            borderRadius: '3px', color: sColor, fontSize: '9px', fontWeight: 600,
            padding: '2px 5px', letterSpacing: '0.05em',
          }}>
            {STATUS_LABEL[signal.status]}
          </span>
        </div>
      </div>

      {/* Price levels */}
      <div style={levelsRowStyle}>
        <LevelCell label="Entry" value={`${fmt(signal.entry_low)} – ${fmt(signal.entry_high)}`} color="#4a90d9" />
        <LevelCell label="SL"    value={fmt(signal.stop_loss)}  color="#ef5350" />
        <LevelCell label="TP1"   value={fmt(signal.tp1)}        color="#26a69a" />
        <LevelCell label="R:R"   value={signal.risk_reward ? `1:${signal.risk_reward}` : '—'} color="#aaa" />
      </div>

      {/* Scores row */}
      <div style={metaRowStyle}>
        {signal.scanner_score != null && (
          <MetaChip label="Scanner" value={`${fmtScore(signal.scanner_score)} (${signal.signal_count})`} />
        )}
        {signal.context_score != null && (
          <MetaChip label="Context" value={fmtScore(signal.context_score)} />
        )}
        {signal.regime && (
          <MetaChip label="Regime" value={signal.regime.replace('_', ' ')} />
        )}
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#555' }}>
          {createdAgo(signal.created_at)}
          {isOpen && expiry && ` · expires ${expiry}`}
        </span>
      </div>

      {/* Signal labels */}
      {signal.signal_labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
          {signal.signal_labels.slice(0, 4).map((lbl, i) => (
            <span key={i} style={labelChipStyle}>{lbl}</span>
          ))}
          {signal.signal_labels.length > 4 && (
            <span style={labelChipStyle}>+{signal.signal_labels.length - 4} more</span>
          )}
        </div>
      )}

      {/* Actions */}
      {signal.status === 'candidate' && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button
            onClick={() => onActivate(signal.id)}
            style={{ ...actionBtnStyle, borderColor: '#26a69a66', color: '#26a69a' }}
          >
            Activate
          </button>
          <button
            onClick={() => onExecute(signal.id)}
            style={{ ...actionBtnStyle, borderColor: '#1f6feb88', color: '#58a6ff', fontWeight: 700 }}
          >
            ▶ Execute
          </button>
          <button
            onClick={() => onInvalidate(signal.id)}
            style={{ ...actionBtnStyle, borderColor: '#3a2a2a', color: '#7a4a4a' }}
          >
            Invalidate
          </button>
        </div>
      )}
      {signal.status === 'active' && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <button
            onClick={() => onExecute(signal.id)}
            style={{ ...actionBtnStyle, borderColor: '#1f6feb88', color: '#58a6ff', fontWeight: 700 }}
          >
            ▶ Execute
          </button>
          <button
            onClick={() => onInvalidate(signal.id)}
            style={{ ...actionBtnStyle, borderColor: '#3a2a2a', color: '#7a4a4a' }}
          >
            Close / Invalidate
          </button>
        </div>
      )}
    </div>
  );
}

function LevelCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
      <span style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '10px', fontWeight: 600, color, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: '9px', color: '#888' }}>
      <span style={{ color: '#555' }}>{label} </span>{value}
    </span>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function SignalQueuePanel() {
  const [signals,    setSignals]    = useState<Signal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [filterTab,  setFilterTab]  = useState(FILTER_TABS[0].value);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [busyId,     setBusyId]     = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetchSignals(filterTab || undefined, undefined, 60);
      setSignals(resp.signals);
      setError(null);
      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterTab]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleActivate = async (id: number) => {
    setBusyId(id);
    try {
      const updated = await activateSignal(id);
      setSignals((prev) => prev.map((s) => s.id === id ? updated : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleInvalidate = async (id: number) => {
    setBusyId(id);
    try {
      const updated = await invalidateSignal(id);
      setSignals((prev) => prev.map((s) => s.id === id ? updated : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const [execMsg, setExecMsg] = useState<string | null>(null);
  const handleExecute = async (id: number) => {
    setBusyId(id);
    setExecMsg(null);
    try {
      await createProposal({ signal_id: id });
      setExecMsg('Proposal created — review it in the Account › Execution tab.');
    } catch (e) {
      setExecMsg((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const liveCount = signals.filter((s) => s.status === 'candidate' || s.status === 'active').length;

  return (
    <div style={panelWrapStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#d0d0d0' }}>Signal Queue</span>
          {liveCount > 0 && (
            <span style={{
              backgroundColor: '#1e3a5f', border: '1px solid #3a6a9f',
              borderRadius: '10px', color: '#90b8e0', fontSize: '9px',
              fontWeight: 700, padding: '1px 6px',
            }}>
              {liveCount} live
            </span>
          )}
        </div>
        <span style={{ fontSize: '9px', color: '#444' }}>
          {loading ? 'loading…' : lastUpdate ? `updated ${lastUpdate}` : ''}
        </span>
      </div>

      {/* Execution toast */}
      {execMsg && (
        <div style={{
          margin: '4px 8px 0', padding: '5px 8px', borderRadius: 4, fontSize: 11,
          background: execMsg.includes('Proposal') ? '#1a3a2a' : '#3a1010',
          color:      execMsg.includes('Proposal') ? '#3fb950' : '#f85149',
        }}>
          {execMsg}
        </div>
      )}

      {/* Filter tabs */}
      <div style={filterBarStyle}>
        {FILTER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilterTab(t.value)}
            style={filterTabStyle(filterTab === t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={scrollAreaStyle}>
        {error && (
          <div style={{ padding: '10px 12px', color: '#ef5350', fontSize: '11px' }}>{error}</div>
        )}
        {!loading && !error && signals.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: '#444', fontSize: '11px' }}>
            No signals yet — scanner creates candidates automatically<br />
            when composite score ≥ 0.60 and signals ≥ 2.
          </div>
        )}
        {signals.map((sig) => (
          <SignalCard
            key={sig.id}
            signal={sig}
            onActivate={busyId === sig.id ? () => {} : handleActivate}
            onInvalidate={busyId === sig.id ? () => {} : handleInvalidate}
            onExecute={busyId === sig.id ? () => {} : handleExecute}
          />
        ))}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const panelWrapStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  height:        '100%',
  overflow:      'hidden',
  backgroundColor: '#111115',
};

const headerStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'space-between',
  padding:         '8px 12px',
  borderBottom:    '1px solid #1e1e22',
  flexShrink:      0,
};

const filterBarStyle: CSSProperties = {
  display:         'flex',
  gap:             '2px',
  padding:         '4px 8px',
  borderBottom:    '1px solid #1a1a1e',
  flexShrink:      0,
};

const scrollAreaStyle: CSSProperties = {
  flex:      1,
  overflowY: 'auto',
  padding:   '6px 8px',
  display:   'flex',
  flexDirection: 'column',
  gap:       '6px',
};

const cardStyle: CSSProperties = {
  backgroundColor: '#16161a',
  border:          '1px solid #222',
  borderRadius:    '6px',
  padding:         '8px 10px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '5px',
};

const levelsRowStyle: CSSProperties = {
  display:    'flex',
  gap:        '12px',
  flexWrap:   'wrap',
  padding:    '4px 0',
  borderTop:  '1px solid #1a1a1e',
  borderBottom: '1px solid #1a1a1e',
};

const metaRowStyle: CSSProperties = {
  display:    'flex',
  gap:        '8px',
  alignItems: 'center',
  flexWrap:   'wrap',
};

const labelChipStyle: CSSProperties = {
  backgroundColor: '#1a1a22',
  border:          '1px solid #2a2a32',
  borderRadius:    '3px',
  color:           '#666',
  fontSize:        '9px',
  padding:         '1px 5px',
  whiteSpace:      'nowrap',
};

const actionBtnStyle: CSSProperties = {
  background:   'none',
  border:       '1px solid',
  borderRadius: '3px',
  cursor:       'pointer',
  fontSize:     '10px',
  fontWeight:   600,
  padding:      '3px 8px',
  transition:   'all 0.12s',
};

function filterTabStyle(active: boolean): CSSProperties {
  return {
    backgroundColor: active ? '#1a2a4a' : 'transparent',
    border:          active ? '1px solid #2a4a8a' : '1px solid transparent',
    borderRadius:    '3px',
    color:           active ? '#90b8e0' : '#555',
    cursor:          'pointer',
    fontSize:        '10px',
    fontWeight:      active ? 700 : 400,
    padding:         '3px 8px',
    transition:      'all 0.12s',
  };
}
