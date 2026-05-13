import { useState, useEffect, CSSProperties, type ReactNode } from 'react';
import { fetchJournalStats } from '../api';
import type { JournalStats } from '../api';

const DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL',
};

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null, dec = 2): string {
  if (n === null) return '—';
  return n.toFixed(dec);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={statCardStyle}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: color ?? '#e0e0e0', letterSpacing: '-0.5px' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: '9px', color: '#555', marginTop: '1px' }}>{sub}</span>}
      <span style={{ fontSize: '9px', color: '#444', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

function OutcomeBar({ label, count, max, color }: {
  label: string; count: number; max: number; color: string;
}) {
  const width = max > 0 ? `${(count / max) * 100}%` : '0%';
  return (
    <div style={outcomeRowStyle}>
      <span style={{ fontSize: '10px', color: '#666', width: '32px', flexShrink: 0 }}>{label}</span>
      <div style={barTrackStyle}>
        <div style={{ width, height: '100%', backgroundColor: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '10px', color: '#888', width: '18px', textAlign: 'right', flexShrink: 0 }}>
        {count}
      </span>
    </div>
  );
}

function SymbolRow({ symbol, wins, losses }: { symbol: string; wins: number; losses: number }) {
  const closed  = wins + losses;
  const wr      = closed > 0 ? wins / closed : null;
  const wrColor = wr === null ? '#555' : wr >= 0.5 ? '#33aa66' : '#cc3333';
  return (
    <div style={symRowStyle}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#ccc', width: '30px' }}>
        {DISPLAY[symbol] ?? symbol}
      </span>
      <span style={{ fontSize: '10px', color: '#555', flex: 1 }}>
        {closed} trade{closed !== 1 ? 's' : ''}
      </span>
      <span style={{ fontSize: '10px', color: '#666' }}>
        <span style={{ color: '#33aa66' }}>{wins}W</span>
        {' / '}
        <span style={{ color: '#cc3333' }}>{losses}L</span>
      </span>
      <span style={{ fontSize: '11px', fontWeight: 700, color: wrColor, width: '42px', textAlign: 'right' }}>
        {wr !== null ? `${(wr * 100).toFixed(0)}%` : '—'}
      </span>
    </div>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  const isWin = streak > 0;
  const abs   = Math.abs(streak);
  const color = isWin ? '#33aa66' : '#cc3333';
  const bg    = isWin ? '#0d2a1a' : '#2a0d0d';
  return (
    <div style={{ ...streakStyle, backgroundColor: bg, borderColor: color + '44' }}>
      <span style={{ fontSize: '10px', color, fontWeight: 700 }}>
        {abs} {isWin ? 'WIN' : 'LOSS'} streak
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PerformancePanel() {
  const [stats,     setStats]     = useState<JournalStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState(0);

  const load = async () => {
    try {
      const data = await fetchJournalStats();
      setStats(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load stats.');
    } finally {
      setLoading(false);
      setLastFetch(Date.now());
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Performance</span>
        <span style={{ fontSize: '9px', color: '#444', marginLeft: 'auto' }}>
          {lastFetch > 0 ? new Date(lastFetch).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
        </span>
        <button style={refreshBtnStyle} onClick={load} title="Refresh">↻</button>
      </div>

      <div style={bodyStyle}>
        {loading && (
          <Centered><span style={{ color: '#555', fontSize: '12px' }}>Loading…</span></Centered>
        )}
        {error && !loading && (
          <Centered><span style={{ color: '#f44', fontSize: '11px' }}>{error}</span></Centered>
        )}
        {!loading && !error && stats?.total === 0 && (
          <Centered>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '30px', opacity: 0.2, marginBottom: '10px' }}>📊</div>
              <div style={{ color: '#555', fontSize: '12px', marginBottom: '4px' }}>No closed trades yet</div>
              <div style={{ color: '#3a3a44', fontSize: '10px' }}>
                Save setups in the Candidate panel<br />to start tracking performance
              </div>
            </div>
          </Centered>
        )}

        {!loading && !error && stats && stats.total > 0 && (
          <div style={contentStyle}>
            {/* Streak banner */}
            {stats.streak !== 0 && <StreakBadge streak={stats.streak} />}

            {/* Top stat cards */}
            <div style={statGridStyle}>
              <StatCard
                label="Win Rate"
                value={pct(stats.win_rate)}
                sub={`${stats.wins}W / ${stats.losses}L`}
                color={stats.win_rate !== null
                  ? (stats.win_rate >= 0.5 ? '#33aa66' : '#cc3333')
                  : '#888'}
              />
              <StatCard
                label="Closed"
                value={String(stats.closed)}
                sub={`${stats.pending} open, ${stats.expired} expired`}
              />
              <StatCard
                label="Avg R/R"
                value={stats.avg_rr !== null ? `${num(stats.avg_rr)}×` : '—'}
                color={stats.avg_rr !== null && stats.avg_rr >= 2 ? '#33aa66' : '#888'}
              />
              <StatCard
                label="Expectancy"
                value={stats.expectancy !== null ? num(stats.expectancy) : '—'}
                sub="per trade (R)"
                color={stats.expectancy !== null
                  ? (stats.expectancy > 0 ? '#33aa66' : '#cc3333')
                  : '#888'}
              />
            </div>

            {/* Outcome distribution */}
            <section style={sectionStyle}>
              <div style={sectionTitleStyle}>Outcome Breakdown</div>
              {(() => {
                const o = stats.by_outcome;
                const maxVal = Math.max(o.tp1, o.tp2, o.tp3, o.sl, o.expired, 1);
                return (
                  <>
                    <OutcomeBar label="TP3" count={o.tp3} max={maxVal} color="#55ee88" />
                    <OutcomeBar label="TP2" count={o.tp2} max={maxVal} color="#44cc77" />
                    <OutcomeBar label="TP1" count={o.tp1} max={maxVal} color="#33aa66" />
                    <OutcomeBar label="SL"  count={o.sl}  max={maxVal} color="#cc3333" />
                    {o.expired > 0 && (
                      <OutcomeBar label="Exp" count={o.expired} max={maxVal} color="#444" />
                    )}
                  </>
                );
              })()}
            </section>

            {/* Per-symbol breakdown */}
            {Object.keys(stats.by_symbol).length > 0 && (
              <section style={sectionStyle}>
                <div style={sectionTitleStyle}>By Symbol</div>
                {Object.entries(stats.by_symbol)
                  .sort(([, a], [, b]) => (b.wins + b.losses) - (a.wins + a.losses))
                  .map(([sym, { wins, losses }]) => (
                    <SymbolRow key={sym} symbol={sym} wins={wins} losses={losses} />
                  ))}
              </section>
            )}

            {/* Long vs Short */}
            <section style={sectionStyle}>
              <div style={sectionTitleStyle}>Direction Bias</div>
              {(['long', 'short'] as const).map((dir) => {
                const d      = stats.by_bias[dir];
                const closed = d.wins + d.losses;
                const wr     = closed > 0 ? d.wins / closed : null;
                const color  = wr !== null ? (wr >= 0.5 ? '#33aa66' : '#cc3333') : '#555';
                return (
                  <div key={dir} style={symRowStyle}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: dir === 'long' ? '#33aa66' : '#cc3333',
                      width: '40px',
                    }}>
                      {dir.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '10px', color: '#555', flex: 1 }}>
                      {closed} trade{closed !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: '10px', color: '#666' }}>
                      <span style={{ color: '#33aa66' }}>{d.wins}W</span>
                      {' / '}
                      <span style={{ color: '#cc3333' }}>{d.losses}L</span>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color, width: '42px', textAlign: 'right' }}>
                      {wr !== null ? `${(wr * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {children}
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

const contentStyle: CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};

const statGridStyle: CSSProperties = {
  display:             'grid',
  gridTemplateColumns: '1fr 1fr',
  gap:                 '6px',
};

const statCardStyle: CSSProperties = {
  backgroundColor: '#111115',
  border:          '1px solid #1e1e22',
  borderRadius:    '6px',
  padding:         '9px 11px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '2px',
};

const sectionStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '5px',
};

const sectionTitleStyle: CSSProperties = {
  fontSize:      '9px',
  fontWeight:    700,
  color:         '#444',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom:  '2px',
};

const outcomeRowStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        '8px',
};

const barTrackStyle: CSSProperties = {
  flex:            1,
  height:          '6px',
  backgroundColor: '#1a1a1e',
  borderRadius:    '3px',
  overflow:        'hidden',
};

const symRowStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '8px',
  padding:         '4px 8px',
  backgroundColor: '#111115',
  borderRadius:    '4px',
  border:          '1px solid #1a1a1e',
};

const streakStyle: CSSProperties = {
  display:        'flex',
  justifyContent: 'center',
  padding:        '5px 10px',
  borderRadius:   '4px',
  border:         '1px solid',
};

const refreshBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          'none',
  color:           '#444',
  cursor:          'pointer',
  fontSize:        '13px',
  padding:         '0 2px',
};
