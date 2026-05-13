import { useState, CSSProperties, type ReactNode } from 'react';
import { requestTradeSetup, saveToJournal } from '../api';
import type { ScannerResponse, SymbolScanResult, ScannerSignal, TradeSetup } from '../api';

interface Props {
  data: ScannerResponse | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC/USDT', ETHUSDT: 'ETH/USDT', SOLUSDT: 'SOL/USDT',
};

const BIAS_COLOR: Record<string, string> = {
  bullish: '#33aa66', bearish: '#cc3333', neutral: '#666',
};

const BIAS_BG: Record<string, string> = {
  bullish: '#0d2a1a', bearish: '#2a0d0d', neutral: '#1a1a1a',
};

const SEV_COLOR: Record<string, string> = {
  alert: '#ff4444', warning: '#f0a020', info: '#4a8aff',
};

const SEV_ICON: Record<string, string> = {
  alert: '⬤', warning: '◆', info: '◇',
};

const DIR_COLOR: Record<string, string> = {
  bullish: '#33aa66', bearish: '#cc3333', neutral: '#666',
};

const DIR_ICON: Record<string, string> = {
  bullish: '▲', bearish: '▼', neutral: '─',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function pctFromMid(price: number, mid: number): string {
  const pct = (price - mid) / mid * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompositeBar({ composite }: { composite: number }) {
  const abs   = Math.abs(composite);
  const color = composite > 0.1 ? '#33aa66' : composite < -0.1 ? '#cc3333' : '#555';
  const isPos = composite >= 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '9px', color: '#444' }}>Bear ◄</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color }}>
          {composite > 0 ? '+' : ''}{composite.toFixed(2)}
        </span>
        <span style={{ fontSize: '9px', color: '#444' }}>► Bull</span>
      </div>
      <div style={barTrackStyle}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: '#333' }} />
        <div style={{
          position: 'absolute',
          left: isPos ? '50%' : `${(0.5 - abs / 2) * 100}%`,
          top: '2px', bottom: '2px',
          width: `${abs / 2 * 100}%`,
          backgroundColor: color,
          borderRadius: '2px',
        }} />
      </div>
    </div>
  );
}

const TF_COLOR: Record<string, string> = {
  '1m': '#444', '15m': '#3a6aaf', '1H': '#33aa66',
};

function SignalItem({ sig }: { sig: ScannerSignal }) {
  return (
    <div style={sigItemStyle}>
      <span style={{ color: SEV_COLOR[sig.severity], fontSize: '10px', flexShrink: 0 }}>
        {SEV_ICON[sig.severity]}
      </span>
      <span style={{ color: DIR_COLOR[sig.direction], fontSize: '9px', fontWeight: 700, flexShrink: 0, width: '11px' }}>
        {DIR_ICON[sig.direction]}
      </span>
      <span style={{ fontSize: '10px', color: '#999', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sig.label}
      </span>
      {sig.timeframe && sig.timeframe !== '1m' && (
        <span style={{
          fontSize: '8px', fontWeight: 700, flexShrink: 0,
          color: TF_COLOR[sig.timeframe] ?? '#555',
          border: `1px solid ${TF_COLOR[sig.timeframe] ?? '#555'}44`,
          borderRadius: '2px', padding: '0 3px', letterSpacing: '0.3px',
        }}>
          {sig.timeframe}
        </span>
      )}
    </div>
  );
}

function SetupCard({ setup, onRegen, onSave, loading, saving, saved }: {
  setup: TradeSetup;
  onRegen: () => void;
  onSave:  () => void;
  loading: boolean;
  saving:  boolean;
  saved:   boolean;
}) {
  const isLong = setup.bias === 'long';
  const dirColor = isLong ? '#33aa66' : '#cc3333';
  const mid = (setup.entry_zone.low + setup.entry_zone.high) / 2;
  const time = new Date(setup.generated_at).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div style={setupCardStyle}>
      {/* Setup header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: dirColor, letterSpacing: '0.5px' }}>
          {setup.bias.toUpperCase()} SETUP
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#e0e0e0' }}>
          R/R {setup.risk_reward}×
        </span>
        <button style={regenBtnStyle} onClick={onRegen} disabled={loading} title="Regenerate setup">
          {loading ? '…' : '↺'}
        </button>
      </div>

      {/* Price levels */}
      <div style={levelsStyle}>
        {/* SL */}
        <LevelRow
          label="Stop"
          price={setup.stop_loss}
          pct={pctFromMid(setup.stop_loss, mid)}
          color="#cc3333"
          highlight
        />
        {/* Entry zone */}
        <div style={entryZoneStyle}>
          <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>Entry</span>
          <div style={{ flex: 1, borderTop: '2px solid #f0a020', margin: '0 6px' }} />
          <span style={{ fontSize: '10px', color: '#f0a020', fontFamily: 'monospace', fontWeight: 700 }}>
            {fmtPrice(setup.entry_zone.low)} – {fmtPrice(setup.entry_zone.high)}
          </span>
        </div>
        {/* Take profits */}
        {setup.take_profit.map((tp, i) => (
          <LevelRow
            key={i}
            label={`TP${i + 1}`}
            price={tp}
            pct={pctFromMid(tp, mid)}
            color="#33aa66"
          />
        ))}
      </div>

      {/* Reasoning */}
      <div style={reasoningStyle}>
        <p style={{ margin: 0, fontSize: '11px', color: '#bbb', lineHeight: '1.5' }}>
          {setup.reasoning}
        </p>
      </div>

      {/* Key risks */}
      <div style={riskStyle}>
        <span style={{ fontSize: '10px', color: '#f0a020', fontWeight: 700, flexShrink: 0 }}>⚠</span>
        <span style={{ fontSize: '10px', color: '#888', flex: 1 }}>{setup.key_risks}</span>
      </div>

      {/* Save to Journal */}
      <button
        style={saveBtnStyle(saving, saved)}
        onClick={onSave}
        disabled={saving || saved}
      >
        {saved ? '✓ Saved to Journal' : saving ? 'Saving…' : '📋 Save to Journal'}
      </button>

      <div style={{ fontSize: '9px', color: '#444', textAlign: 'right', marginTop: '2px' }}>
        Generated {time}
      </div>
    </div>
  );
}

function LevelRow({ label, price, pct, color, highlight }: {
  label: string; price: number; pct: string; color: string; highlight?: boolean;
}) {
  return (
    <div style={{ ...levelRowStyle, ...(highlight ? { border: `1px solid ${color}33`, backgroundColor: `${color}08` } : {}) }}>
      <span style={{ fontSize: '10px', color: '#666', width: '32px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, borderTop: `1px dashed ${color}55`, margin: '0 6px' }} />
      <span style={{ fontSize: '10px', color, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>
        {fmtPrice(price)}
      </span>
      <span style={{ fontSize: '9px', color: '#555', flexShrink: 0, marginLeft: '4px', width: '46px', textAlign: 'right' }}>
        {pct}
      </span>
    </div>
  );
}

// ── Position Size Calculator ──────────────────────────────────────────────────

const CALC_STORAGE_KEY = 'tap_calc_settings';

function loadCalc() {
  try {
    const s = JSON.parse(localStorage.getItem(CALC_STORAGE_KEY) || '{}');
    return { account: s.account || '10000', risk: s.risk || '1', leverage: s.leverage || '10' };
  } catch { return { account: '10000', risk: '1', leverage: '10' }; }
}

function CalcInput({ label, value, unit, onChange }: {
  label: string; value: string; unit: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '8px', color: '#555', marginBottom: '2px', letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#0d0d10', border: '1px solid #2a2a2e', borderRadius: '3px', padding: '3px 5px', gap: '2px' }}>
        {unit === '$' && <span style={{ fontSize: '9px', color: '#555' }}>$</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="number"
          min="0"
          style={{ background: 'none', border: 'none', color: '#d0d0d0', fontSize: '11px', fontFamily: 'monospace', width: '100%', outline: 'none', padding: 0 }}
        />
        {unit !== '$' && <span style={{ fontSize: '9px', color: '#555' }}>{unit}</span>}
      </div>
    </div>
  );
}

function CalcRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: '10px', color: '#555' }}>{label}</span>
      <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function PositionCalculator({ setup }: { setup: TradeSetup }) {
  const init = loadCalc();
  const [account,  setAccount]  = useState(init.account);
  const [riskPct,  setRiskPct]  = useState(init.risk);
  const [leverage, setLeverage] = useState(init.leverage);

  const persist = (a: string, r: string, l: string) => {
    try { localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify({ account: a, risk: r, leverage: l })); } catch {}
  };

  const entryMid = (setup.entry_zone.low + setup.entry_zone.high) / 2;
  const slDist   = entryMid !== 0 ? Math.abs(entryMid - setup.stop_loss) / entryMid : 0;

  const acc  = Math.max(parseFloat(account)  || 0, 0);
  const risk = Math.max(parseFloat(riskPct)  || 0, 0);
  const lev  = Math.max(parseFloat(leverage) || 1, 1);

  const dollarRisk = acc * risk / 100;
  const notional   = slDist > 0 ? dollarRisk / slDist : 0;
  const margin     = notional / lev;

  const fmtUsd = (n: number) =>
    n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              : n >= 1 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;

  return (
    <div style={calcContainerStyle}>
      <div style={calcLabelRowStyle}>
        <span style={calcHeaderStyle}>POSITION SIZE</span>
        <span style={{ fontSize: '9px', color: '#444' }}>
          entry {fmtPrice(entryMid)} · sl dist {(slDist * 100).toFixed(2)}%
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <CalcInput label="Account $" value={account} unit="$"
          onChange={(v) => { setAccount(v); persist(v, riskPct, leverage); }} />
        <CalcInput label="Risk %" value={riskPct} unit="%"
          onChange={(v) => { setRiskPct(v); persist(account, v, leverage); }} />
        <CalcInput label="Leverage" value={leverage} unit="×"
          onChange={(v) => { setLeverage(v); persist(account, riskPct, v); }} />
      </div>

      {notional > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
          <CalcRow label="Notional position" value={fmtUsd(notional)} color="#e0e0e0" />
          <CalcRow label={`Margin @ ${lev}×`} value={fmtUsd(margin)} color="#aaa" />
          <CalcRow label="Dollar risk" value={fmtUsd(dollarRisk)} color="#cc3333" />
          <div style={{ borderTop: '1px solid #1e1e22', margin: '2px 0' }} />
          {setup.take_profit.map((tp, i) => {
            const dist   = Math.abs(tp - entryMid) / entryMid;
            const profit = notional * dist;
            const pct    = acc > 0 ? (profit / acc * 100).toFixed(1) : '—';
            return (
              <CalcRow
                key={i}
                label={`TP${i + 1} profit`}
                value={`+${fmtUsd(profit)} (${pct}%)`}
                color="#33aa66"
              />
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '10px', color: '#444', fontStyle: 'italic', marginTop: '2px' }}>
          Enter account size above
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CandidatePanel({ data }: Props) {
  const [setup,   setSetup]   = useState<TradeSetup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [lastSym, setLastSym] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Pick symbol with highest |composite| that actually has signals
  const top = data?.symbols.reduce<SymbolScanResult | null>((best, cur) => {
    if (cur.signal_count === 0) return best;
    if (!best) return cur;
    return Math.abs(cur.composite) > Math.abs(best.composite) ? cur : best;
  }, null) ?? null;

  // Clear setup when top candidate switches symbol
  if (top && top.symbol !== lastSym) {
    setLastSym(top.symbol);
    setSetup(null);
    setError(null);
    setSaved(false);
  }

  const handleGenerate = async () => {
    setSaved(false);
    if (!top) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestTradeSetup(top.symbol, top.signals, top.bias);
      setSetup(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!setup) return;
    setSaving(true);
    try {
      await saveToJournal(setup);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save to journal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Top Candidate</span>
        {top && (
          <span style={{ fontSize: '10px', color: BIAS_COLOR[top.bias], marginLeft: 'auto', fontWeight: 700 }}>
            {DISPLAY[top.symbol] ?? top.symbol}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Loading scanner */}
        {!data && (
          <Centered><span style={{ color: '#555', fontSize: '12px' }}>Loading…</span></Centered>
        )}

        {/* No signals */}
        {data && !top && (
          <Centered>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', opacity: 0.25, marginBottom: '8px' }}>🎯</div>
              <div style={{ color: '#555', fontSize: '12px' }}>No active signals</div>
              <div style={{ color: '#444', fontSize: '10px', marginTop: '4px' }}>Scanner checks every 30 s</div>
            </div>
          </Centered>
        )}

        {/* Candidate + setup */}
        {data && top && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Symbol header card */}
            <div style={{ ...candidateHeaderStyle, backgroundColor: BIAS_BG[top.bias] }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e0e0e0' }}>
                  {DISPLAY[top.symbol] ?? top.symbol}
                </div>
                <div style={{ fontSize: '10px', color: BIAS_COLOR[top.bias], fontWeight: 700, marginTop: '2px' }}>
                  {top.bias.toUpperCase()} BIAS
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '9px', color: '#555' }}>Bull / Bear</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#e0e0e0' }}>
                  <span style={{ color: '#33aa66' }}>{top.bull_score}</span>
                  {' / '}
                  <span style={{ color: '#cc3333' }}>{top.bear_score}</span>
                </div>
              </div>
            </div>

            {/* Composite bar */}
            <CompositeBar composite={top.composite} />

            {/* Signals */}
            <div>
              <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: '5px', letterSpacing: '0.4px' }}>
                SIGNALS ({top.signal_count})
              </div>
              {top.signals.map((s, i) => <SignalItem key={i} sig={s} />)}
            </div>

            {/* Generate button */}
            {!setup && (
              <button
                style={genBtnStyle(loading)}
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? 'Asking Claude…' : '⚡ Generate AI Setup'}
              </button>
            )}

            {/* Error */}
            {error && (
              <div style={errorBoxStyle}>
                <span style={{ fontSize: '11px', color: '#f44' }}>{error}</span>
                <button style={retryBtnStyle} onClick={handleGenerate} disabled={loading}>
                  Retry
                </button>
              </div>
            )}

            {/* Setup card */}
            {setup && (
              <SetupCard
                setup={setup}
                onRegen={handleGenerate}
                onSave={handleSave}
                loading={loading}
                saving={saving}
                saved={saved}
              />
            )}

            {/* Position size calculator */}
            {setup && <PositionCalculator setup={setup} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
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

const candidateHeaderStyle: CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  padding:        '8px 10px',
  borderRadius:   '6px',
  border:         '1px solid #2a2a2e',
};

const barTrackStyle: CSSProperties = {
  height:          '8px',
  backgroundColor: '#1a1a1e',
  borderRadius:    '4px',
  position:        'relative',
  overflow:        'hidden',
};

const sigItemStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '5px',
  padding:         '3px 6px',
  backgroundColor: '#111115',
  borderRadius:    '3px',
  border:          '1px solid #1e1e22',
  marginBottom:    '3px',
};

const genBtnStyle = (loading: boolean): CSSProperties => ({
  backgroundColor: loading ? '#1a1a1a' : '#1a2a4a',
  border:          `1px solid ${loading ? '#333' : '#3a6aaf'}`,
  borderRadius:    '5px',
  color:           loading ? '#555' : '#90b8e0',
  cursor:          loading ? 'not-allowed' : 'pointer',
  fontSize:        '12px',
  fontWeight:      700,
  padding:         '8px 12px',
  textAlign:       'center',
  transition:      'all 0.15s',
  width:           '100%',
  letterSpacing:   '0.3px',
});

const setupCardStyle: CSSProperties = {
  backgroundColor: '#111115',
  border:          '1px solid #2a2a2e',
  borderRadius:    '6px',
  padding:         '10px 12px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '8px',
};

const levelsStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '4px',
};

const entryZoneStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  padding:         '5px 6px',
  backgroundColor: '#1a1a0a',
  border:          '1px solid #f0a02033',
  borderRadius:    '3px',
  margin:          '2px 0',
};

const levelRowStyle: CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  padding:      '3px 6px',
  borderRadius: '3px',
};

const reasoningStyle: CSSProperties = {
  backgroundColor: '#0d0d14',
  border:          '1px solid #1e1e2e',
  borderRadius:    '4px',
  padding:         '7px 9px',
};

const riskStyle: CSSProperties = {
  display:         'flex',
  gap:             '6px',
  alignItems:      'flex-start',
  backgroundColor: '#141008',
  border:          '1px solid #f0a02022',
  borderRadius:    '4px',
  padding:         '6px 8px',
};

const regenBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #333',
  borderRadius:    '4px',
  color:           '#666',
  cursor:          'pointer',
  fontSize:        '13px',
  padding:         '1px 6px',
};

const errorBoxStyle: CSSProperties = {
  display:         'flex',
  justifyContent:  'space-between',
  alignItems:      'center',
  backgroundColor: '#1a0808',
  border:          '1px solid #f4444433',
  borderRadius:    '4px',
  padding:         '7px 9px',
  gap:             '8px',
};

const retryBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #f44',
  borderRadius:    '3px',
  color:           '#f44',
  cursor:          'pointer',
  fontSize:        '10px',
  padding:         '2px 7px',
  flexShrink:      0,
};

const saveBtnStyle = (saving: boolean, saved: boolean): CSSProperties => ({
  backgroundColor: saved ? '#0d2a1a' : saving ? '#1a1a1a' : '#12121a',
  border:          `1px solid ${saved ? '#33aa6655' : saving ? '#333' : '#2a2a3a'}`,
  borderRadius:    '4px',
  color:           saved ? '#33aa66' : saving ? '#555' : '#8888aa',
  cursor:          (saving || saved) ? 'default' : 'pointer',
  fontSize:        '11px',
  fontWeight:      600,
  padding:         '6px 10px',
  textAlign:       'center',
  width:           '100%',
  transition:      'all 0.2s',
});

const calcContainerStyle: CSSProperties = {
  backgroundColor: '#111115',
  border:          '1px solid #2a2a2e',
  borderRadius:    '6px',
  padding:         '10px 12px',
  display:         'flex',
  flexDirection:   'column',
  gap:             '8px',
};

const calcLabelRowStyle: CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'baseline',
};

const calcHeaderStyle: CSSProperties = {
  fontSize:      '9px',
  fontWeight:    700,
  color:         '#555',
  letterSpacing: '0.08em',
};
