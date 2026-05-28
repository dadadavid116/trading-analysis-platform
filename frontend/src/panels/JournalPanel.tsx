import { useState, useEffect, CSSProperties, type MouseEvent } from 'react';
import { fetchJournal, deleteJournalEntry } from '../api';
import type { JournalEntry, JournalOutcome } from '../api';

type Filter = 'all' | 'open' | 'wins' | 'losses' | 'expired';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',     label: 'All'     },
  { id: 'open',    label: 'Open'    },
  { id: 'wins',    label: 'Wins'    },
  { id: 'losses',  label: 'Losses'  },
  { id: 'expired', label: 'Expired' },
];

function applyFilter(entries: JournalEntry[], filter: Filter): JournalEntry[] {
  switch (filter) {
    case 'open':    return entries.filter(e => e.outcome === 'pending');
    case 'wins':    return entries.filter(e => e.outcome === 'tp1' || e.outcome === 'tp2' || e.outcome === 'tp3');
    case 'losses':  return entries.filter(e => e.outcome === 'sl');
    case 'expired': return entries.filter(e => e.outcome === 'expired');
    default:        return entries;
  }
}

function exportCSV(entries: JournalEntry[]): void {
  const headers = [
    'Date', 'Symbol', 'Bias', 'Entry Low', 'Entry High',
    'Stop Loss', 'TP1', 'TP2', 'TP3', 'R/R', 'Outcome',
    'Reasoning', 'Key Risks', 'Notes',
  ];
  const escape = (s: string | null | undefined) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = entries.map(e => [
    new Date(e.created_at).toISOString(),
    e.symbol,
    e.bias,
    e.entry_low,
    e.entry_high,
    e.stop_loss,
    e.take_profit1,
    e.take_profit2,
    e.take_profit3,
    e.risk_reward,
    e.outcome,
    escape(e.reasoning),
    escape(e.key_risks),
    escape(e.notes),
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL',
};

const OUTCOME_LABEL: Record<JournalOutcome, string> = {
  pending: 'PENDING',
  tp1:     'TP1 HIT',
  tp2:     'TP2 HIT',
  tp3:     'TP3 HIT',
  sl:      'STOPPED',
  expired: 'EXPIRED',
};

const OUTCOME_COLOR: Record<JournalOutcome, string> = {
  pending: '#666',
  tp1:     '#33aa66',
  tp2:     '#44cc77',
  tp3:     '#55ee88',
  sl:      '#cc3333',
  expired: '#555',
};

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function WinRate({ entries }: { entries: JournalEntry[] }) {
  const closed = entries.filter(e => e.outcome !== 'pending' && e.outcome !== 'expired');
  const wins   = closed.filter(e => e.outcome === 'tp1' || e.outcome === 'tp2' || e.outcome === 'tp3');
  const losses = closed.filter(e => e.outcome === 'sl');
  const rate   = closed.length > 0 ? Math.round(wins.length / closed.length * 100) : null;

  return (
    <div style={winRateBarStyle}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: '#555' }}>
          Total: <span style={{ color: '#aaa' }}>{entries.length}</span>
        </span>
        <span style={{ fontSize: '10px', color: '#33aa66' }}>
          W: {wins.length}
        </span>
        <span style={{ fontSize: '10px', color: '#cc3333' }}>
          L: {losses.length}
        </span>
        {entries.filter(e => e.outcome === 'pending').length > 0 && (
          <span style={{ fontSize: '10px', color: '#666' }}>
            Open: {entries.filter(e => e.outcome === 'pending').length}
          </span>
        )}
      </div>
      {rate !== null && (
        <span style={{ fontSize: '11px', fontWeight: 700, color: rate >= 50 ? '#33aa66' : '#cc3333' }}>
          {rate}% WR
        </span>
      )}
    </div>
  );
}

function EntryCard({ entry, onDelete }: { entry: JournalEntry; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isLong    = entry.bias === 'long';
  const dirColor  = isLong ? '#33aa66' : '#cc3333';
  const outcome   = entry.outcome;
  const ocColor   = OUTCOME_COLOR[outcome];

  const handleDelete = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!confirm('Remove this journal entry?')) return;
    setDeleting(true);
    try {
      await deleteJournalEntry(entry.id);
      onDelete();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div style={cardStyle(outcome)} onClick={() => setExpanded(v => !v)}>
      {/* Card header row */}
      <div style={cardHeaderStyle}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#e0e0e0', minWidth: '30px' }}>
          {DISPLAY[entry.symbol] ?? entry.symbol}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: dirColor }}>
          {entry.bias.toUpperCase()}
        </span>
        <span style={{ fontSize: '9px', color: '#444', flex: 1 }}>
          {fmtDate(entry.created_at)}
        </span>
        <span style={{
          fontSize: '9px', fontWeight: 700, color: ocColor,
          border: `1px solid ${ocColor}44`, borderRadius: '3px',
          padding: '1px 5px', letterSpacing: '0.3px',
        }}>
          {OUTCOME_LABEL[outcome]}
        </span>
        <span style={{ fontSize: '10px', color: '#555', marginLeft: '4px' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Quick level strip (always visible) */}
      <div style={levelStripStyle}>
        <span style={{ color: '#cc3333' }}>SL {fmtPrice(entry.stop_loss)}</span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#f0a020' }}>
          {fmtPrice(entry.entry_low)}–{fmtPrice(entry.entry_high)}
        </span>
        <span style={{ color: '#888' }}>|</span>
        <span style={{ color: '#33aa66' }}>
          TP1 {fmtPrice(entry.take_profit1)}
        </span>
        <span style={{ color: '#444', marginLeft: 'auto' }}>
          R/R {entry.risk_reward}×
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={expandedStyle} onClick={e => e.stopPropagation()}>
          {/* Full levels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
            {[
              { label: 'TP3', price: entry.take_profit3, color: '#55ee88' },
              { label: 'TP2', price: entry.take_profit2, color: '#44cc77' },
              { label: 'TP1', price: entry.take_profit1, color: '#33aa66' },
              { label: 'Stop', price: entry.stop_loss,   color: '#cc3333' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', color: '#444', width: '28px' }}>{l.label}</span>
                <div style={{ flex: 1, borderTop: `1px dashed ${l.color}44` }} />
                <span style={{ fontSize: '10px', color: l.color, fontFamily: 'monospace' }}>
                  {fmtPrice(l.price)}
                </span>
              </div>
            ))}
          </div>

          {/* Reasoning */}
          <p style={{ margin: '0 0 6px', fontSize: '10px', color: '#999', lineHeight: '1.5' }}>
            {entry.reasoning}
          </p>

          {/* User notes */}
          {entry.notes && (
            <div style={{ fontSize: '10px', color: '#b0b8e0', background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '4px', padding: '5px 8px', lineHeight: '1.5', marginBottom: '4px' }}>
              <span style={{ color: '#4a6a9f', fontWeight: 700, marginRight: '5px' }}>✎</span>
              {entry.notes}
            </div>
          )}

          {/* Risk */}
          <div style={{ fontSize: '10px', color: '#888', borderTop: '1px solid #1e1e22', paddingTop: '6px', display: 'flex', gap: '5px' }}>
            <span style={{ color: '#f0a020' }}>⚠</span>
            <span>{entry.key_risks}</span>
          </div>

          {/* Delete */}
          <button style={deleteBtnStyle} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove entry'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function JournalPanel() {
  const [entries,   setEntries]   = useState<JournalEntry[]>([]);
  const [filter,    setFilter]    = useState<Filter>('all');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState(0);

  const load = async () => {
    try {
      const data = await fetchJournal();
      setEntries(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load journal.');
    } finally {
      setLoading(false);
      setLastFetch(Date.now());
    }
  };

  useEffect(() => { load(); }, []);

  // Refresh outcomes every 60s (outcomes can change as prices move)
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleDelete = (id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Trade Journal</span>
        <span style={{ fontSize: '9px', color: '#444', marginLeft: 'auto' }}>
          {lastFetch > 0 ? `Updated ${new Date(lastFetch).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
        </span>
        {entries.length > 0 && (
          <button
            style={exportBtnStyle}
            onClick={() => exportCSV(entries)}
            title="Export all entries as CSV"
          >
            ↓ CSV
          </button>
        )}
        <button style={refreshBtnStyle} onClick={load} title="Refresh outcomes">↻</button>
      </div>

      <div style={bodyStyle}>
        {loading && (
          <div style={centeredStyle}>
            <span style={{ color: '#555', fontSize: '12px' }}>Loading…</span>
          </div>
        )}

        {error && !loading && (
          <div style={centeredStyle}>
            <span style={{ color: '#f44', fontSize: '11px' }}>{error}</span>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={centeredStyle}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '30px', opacity: 0.2, marginBottom: '10px' }}>📋</div>
              <div style={{ color: '#555', fontSize: '12px', marginBottom: '4px' }}>No journal entries yet</div>
              <div style={{ color: '#3a3a44', fontSize: '10px' }}>
                Generate a setup in the candidate panel<br />and click "Save to Journal"
              </div>
            </div>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <>
            <WinRate entries={entries} />

            {/* Filter bar */}
            <div style={filterBarStyle}>
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  style={filterBtnStyle(f.id === filter)}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id !== 'all' && (
                    <span style={{ marginLeft: '3px', opacity: 0.6 }}>
                      ({applyFilter(entries, f.id).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px' }}>
              {applyFilter(entries, filter).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#444', fontSize: '11px', padding: '20px 0' }}>
                  No entries match this filter.
                </div>
              ) : (
                applyFilter(entries, filter).map(e => (
                  <EntryCard key={e.id} entry={e} onDelete={() => handleDelete(e.id)} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  display:         'flex',
  flexDirection:   'column',
  height:          '100%',
  backgroundColor: '#0d0d10',
  overflow:        'hidden',
};

const headerStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '6px',
  padding:         '8px 14px',
  borderBottom:    '1px solid #1e1e22',
  backgroundColor: '#111115',
  flexShrink:      0,
};

const titleStyle: CSSProperties = {
  fontSize:      '12px',
  fontWeight:    600,
  color:         '#ccc',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const bodyStyle: CSSProperties = {
  flex:      1,
  overflowY: 'auto',
  minHeight: 0,
};

const centeredStyle: CSSProperties = {
  display:        'flex',
  height:         '100%',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        '20px',
};

const winRateBarStyle: CSSProperties = {
  display:         'flex',
  justifyContent:  'space-between',
  alignItems:      'center',
  padding:         '6px 12px',
  borderBottom:    '1px solid #1a1a1e',
  backgroundColor: '#111115',
  flexShrink:      0,
};

const cardStyle = (outcome: JournalOutcome): CSSProperties => ({
  backgroundColor: '#111115',
  border:          `1px solid ${outcome === 'sl' ? '#cc333322' : outcome.startsWith('tp') ? '#33aa6622' : '#1e1e22'}`,
  borderRadius:    '5px',
  cursor:          'pointer',
  padding:         '7px 10px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '4px',
});

const cardHeaderStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        '7px',
};

const levelStripStyle: CSSProperties = {
  display:    'flex',
  gap:        '7px',
  alignItems: 'center',
  fontSize:   '10px',
  color:      '#666',
  fontFamily: 'monospace',
};

const expandedStyle: CSSProperties = {
  borderTop:  '1px solid #1a1a1e',
  paddingTop: '8px',
  marginTop:  '4px',
  display:    'flex',
  flexDirection: 'column',
  gap:        '4px',
};

const deleteBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #f4444433',
  borderRadius:    '3px',
  color:           '#f44444aa',
  cursor:          'pointer',
  fontSize:        '10px',
  marginTop:       '4px',
  padding:         '3px 8px',
  alignSelf:       'flex-end',
};

const refreshBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          'none',
  color:           '#444',
  cursor:          'pointer',
  fontSize:        '13px',
  padding:         '0 2px',
};

const exportBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #2a4a2a',
  borderRadius:    '3px',
  color:           '#4a8a4a',
  cursor:          'pointer',
  fontSize:        '10px',
  fontWeight:      600,
  padding:         '2px 7px',
  whiteSpace:      'nowrap',
};

const filterBarStyle: CSSProperties = {
  display:         'flex',
  gap:             '3px',
  padding:         '5px 10px',
  borderBottom:    '1px solid #1a1a1e',
  backgroundColor: '#0f0f12',
  flexShrink:      0,
  flexWrap:        'wrap',
};

const filterBtnStyle = (active: boolean): CSSProperties => ({
  backgroundColor: active ? '#1a2a3a' : 'transparent',
  border:          `1px solid ${active ? '#3a5a8f' : 'transparent'}`,
  borderRadius:    '3px',
  color:           active ? '#90b8e0' : '#555',
  cursor:          'pointer',
  fontSize:        '10px',
  fontWeight:      active ? 700 : 400,
  padding:         '2px 8px',
  transition:      'all 0.1s',
});
