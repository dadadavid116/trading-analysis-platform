import type { CSSProperties } from 'react';
import type { ScannerResponse, SymbolScanResult, ScannerSignal } from '../api';

interface Props {
  data: ScannerResponse | null;
}

const DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC/USDT', ETHUSDT: 'ETH/USDT', SOLUSDT: 'SOL/USDT',
};

const BIAS_COLOR: Record<string, string> = {
  bullish: '#33aa66',
  bearish: '#cc3333',
  neutral: '#666',
};

const BIAS_BG: Record<string, string> = {
  bullish: '#0d2a1a',
  bearish: '#2a0d0d',
  neutral: '#1a1a1a',
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

function CompositeBar({ composite }: { composite: number }) {
  const abs   = Math.abs(composite);
  const color = composite > 0.1 ? '#33aa66' : composite < -0.1 ? '#cc3333' : '#555';
  const isPos = composite >= 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '10px', color: '#555' }}>Bear</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color }}>
          {composite > 0 ? '+' : ''}{composite.toFixed(2)}
        </span>
        <span style={{ fontSize: '10px', color: '#555' }}>Bull</span>
      </div>
      <div style={barTrackStyle}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: '#333' }} />
        <div style={{
          position: 'absolute',
          left:     isPos ? '50%' : `${(0.5 - abs / 2) * 100}%`,
          top: '1px', bottom: '1px',
          width: `${abs / 2 * 100}%`,
          backgroundColor: color,
          borderRadius: '2px',
        }} />
      </div>
    </div>
  );
}

function SignalItem({ sig }: { sig: ScannerSignal }) {
  return (
    <div style={signalItemStyle}>
      <span style={{ color: SEV_COLOR[sig.severity], fontSize: '10px', flexShrink: 0 }}>
        {SEV_ICON[sig.severity]}
      </span>
      <span style={{ color: DIR_COLOR[sig.direction], fontSize: '9px', fontWeight: 700, flexShrink: 0, width: '12px' }}>
        {DIR_ICON[sig.direction]}
      </span>
      <span style={{ fontSize: '10px', color: '#999', flex: 1 }}>
        {sig.label}
      </span>
      <span style={{ fontSize: '9px', color: '#555', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {sig.severity}
      </span>
    </div>
  );
}

function TopCandidate({ result }: { result: SymbolScanResult }) {
  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', boxSizing: 'border-box' }}>
      {/* Symbol + bias */}
      <div style={{ ...candidateHeaderStyle, backgroundColor: BIAS_BG[result.bias] }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e0e0e0' }}>
            {DISPLAY[result.symbol] ?? result.symbol}
          </div>
          <div style={{ fontSize: '11px', color: BIAS_COLOR[result.bias], fontWeight: 700, marginTop: '2px' }}>
            {result.bias.toUpperCase()} BIAS
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#555' }}>Score</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: BIAS_COLOR[result.bias] }}>
            {result.bull_score + result.bear_score > 0 ? (
              result.bias === 'bullish' ? `+${result.bull_score}` : result.bias === 'bearish' ? `-${result.bear_score}` : '0'
            ) : '—'}
          </div>
        </div>
      </div>

      {/* Composite bar */}
      <CompositeBar composite={result.composite} />

      {/* Signal breakdown */}
      <div style={{ fontSize: '11px', color: '#555', fontWeight: 600, marginBottom: '-4px' }}>
        ACTIVE SIGNALS ({result.signal_count})
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {result.signals.length === 0 ? (
          <div style={{ color: '#444', fontSize: '11px', fontStyle: 'italic', paddingTop: '4px' }}>
            No signals active for this symbol.
          </div>
        ) : (
          result.signals.map((s, i) => <SignalItem key={i} sig={s} />)
        )}
      </div>

      {/* Score breakdown */}
      {(result.bull_score > 0 || result.bear_score > 0) && (
        <div style={scoreRowStyle}>
          <span style={{ color: '#33aa66', fontSize: '10px' }}>▲ Bull: {result.bull_score}pts</span>
          <span style={{ color: '#cc3333', fontSize: '10px' }}>▼ Bear: {result.bear_score}pts</span>
        </div>
      )}
    </div>
  );
}

export default function CandidatePanel({ data }: Props) {
  // Pick the symbol with the highest absolute composite score
  const top = data?.symbols.reduce<SymbolScanResult | null>((best, cur) => {
    if (!best) return cur;
    return Math.abs(cur.composite) > Math.abs(best.composite) ? cur : best;
  }, null);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Top Candidate</span>
        {top && top.signal_count > 0 && (
          <span style={{ fontSize: '10px', color: BIAS_COLOR[top.bias], marginLeft: 'auto', fontWeight: 700 }}>
            {DISPLAY[top.symbol] ?? top.symbol}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {!data && (
          <div style={centeredStyle}>
            <span style={{ color: '#555', fontSize: '12px' }}>Loading…</span>
          </div>
        )}

        {data && (!top || top.signal_count === 0) && (
          <div style={centeredStyle}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', opacity: 0.3, marginBottom: '8px' }}>🎯</div>
              <div style={{ color: '#555', fontSize: '12px' }}>No active signals</div>
              <div style={{ color: '#444', fontSize: '10px', marginTop: '4px' }}>
                Scanner checks every 30 seconds
              </div>
            </div>
          </div>
        )}

        {data && top && top.signal_count > 0 && <TopCandidate result={top} />}
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

const centeredStyle: CSSProperties = {
  display:        'flex',
  height:         '100%',
  alignItems:     'center',
  justifyContent: 'center',
};

const candidateHeaderStyle: CSSProperties = {
  display:      'flex',
  justifyContent: 'space-between',
  alignItems:   'center',
  padding:      '10px 12px',
  borderRadius: '6px',
  border:       '1px solid #2a2a2e',
  flexShrink:   0,
};

const barTrackStyle: CSSProperties = {
  height:          '8px',
  backgroundColor: '#1a1a1e',
  borderRadius:    '4px',
  position:        'relative',
  overflow:        'hidden',
};

const signalItemStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '6px',
  padding:         '4px 8px',
  backgroundColor: '#111115',
  borderRadius:    '4px',
  border:          '1px solid #1e1e22',
};

const scoreRowStyle: CSSProperties = {
  display:         'flex',
  justifyContent:  'space-between',
  padding:         '5px 8px',
  backgroundColor: '#111115',
  borderRadius:    '4px',
  border:          '1px solid #1e1e22',
  flexShrink:      0,
};
