import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerStatus } from '../api';
import type { ScannerResponse, SymbolScanResult, ScannerSignal, ScannerWorkerStatus } from '../api';

interface Props {
  data:  ScannerResponse | null;
  error: string | null;
}

const DISPLAY: Record<string, string> = {
  BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL',
};

const BIAS_COLOR: Record<string, string> = {
  bullish: '#33aa66',
  bearish: '#cc3333',
  neutral: '#666',
};

const SEV_COLOR: Record<string, string> = {
  alert:   '#ff4444',
  warning: '#f0a020',
  info:    '#4a8aff',
};

const SEV_ICON: Record<string, string> = {
  alert: '⬤', warning: '◆', info: '◇',
};

const DIR_ICON: Record<string, string> = {
  bullish: '▲', bearish: '▼', neutral: '─',
};

function ScoreBar({ composite }: { composite: number }) {
  const abs   = Math.abs(composite);
  const color = composite > 0.1 ? '#33aa66' : composite < -0.1 ? '#cc3333' : '#555';
  const left  = composite < 0 ? `${(0.5 - abs / 2) * 100}%` : '50%';
  const width = `${abs / 2 * 100}%`;

  return (
    <div style={barTrackStyle} title={`Composite: ${composite > 0 ? '+' : ''}${composite.toFixed(2)}`}>
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: '#333' }} />
      <div style={{ position: 'absolute', left, top: '1px', bottom: '1px', width, backgroundColor: color, borderRadius: '2px' }} />
    </div>
  );
}

function SignalRow({ sig }: { sig: ScannerSignal }) {
  return (
    <div style={sigRowStyle}>
      <span style={{ color: SEV_COLOR[sig.severity], fontSize: '9px', flexShrink: 0 }}>
        {SEV_ICON[sig.severity]}
      </span>
      <span style={{ color: BIAS_COLOR[sig.direction], fontSize: '9px', flexShrink: 0 }}>
        {DIR_ICON[sig.direction]}
      </span>
      <span style={{ color: '#aaa', fontSize: '10px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sig.label}
      </span>
    </div>
  );
}

function SymbolRow({ result }: { result: SymbolScanResult }) {
  const hasSignals = result.signals.length > 0;
  return (
    <div style={symbolBlockStyle}>
      {/* Symbol header */}
      <div style={symbolHeaderStyle}>
        <span style={symNameStyle}>{DISPLAY[result.symbol] ?? result.symbol}</span>
        <span style={{ ...biasBadgeStyle, color: BIAS_COLOR[result.bias], borderColor: BIAS_COLOR[result.bias] + '44' }}>
          {result.bias.toUpperCase()}
        </span>
        <ScoreBar composite={result.composite} />
        <span style={{ fontSize: '10px', color: '#555', flexShrink: 0 }}>
          {result.signal_count} sig{result.signal_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Signal list */}
      {hasSignals ? (
        <div style={{ paddingLeft: '8px' }}>
          {result.signals.map((s, i) => (
            <SignalRow key={i} sig={s} />
          ))}
        </div>
      ) : (
        <div style={{ paddingLeft: '8px', color: '#444', fontSize: '10px', fontStyle: 'italic' }}>
          No signals
        </div>
      )}
    </div>
  );
}

function useWorkerStatus() {
  const [status, setStatus] = useState<ScannerWorkerStatus | null>(null);
  useEffect(() => {
    fetchScannerStatus().then(setStatus).catch(() => {});
    const id = setInterval(() => fetchScannerStatus().then(setStatus).catch(() => {}), 60_000);
    return () => clearInterval(id);
  }, []);
  return status;
}

function AutoAlertDot({ status }: { status: ScannerWorkerStatus | null }) {
  if (!status) return null;
  const on    = status.telegram_enabled;
  const color = on ? '#33aa66' : '#555';
  const label = on
    ? `Auto-alerts ON · ${status.notifications_sent} sent`
    : 'Auto-alerts: Telegram not configured';
  return (
    <span title={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
      {on && (
        <span style={{ fontSize: '9px', color: '#33aa6699' }}>
          {status.notifications_sent > 0 ? `${status.notifications_sent}×` : 'ON'}
        </span>
      )}
    </span>
  );
}

export default function ScannerPanel({ data, error }: Props) {
  const workerStatus = useWorkerStatus();
  const scannedAt = data
    ? new Date(data.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Market Scanner</span>
        <AutoAlertDot status={workerStatus} />
        {scannedAt && (
          <span style={{ fontSize: '10px', color: '#555', marginLeft: 'auto' }}>
            {scannedAt}
          </span>
        )}
      </div>

      <div style={bodyStyle}>
        {!data && !error && (
          <div style={centeredStyle}>
            <span style={{ color: '#555', fontSize: '12px' }}>Loading…</span>
          </div>
        )}

        {error && (
          <div style={centeredStyle}>
            <span style={{ color: '#f44', fontSize: '11px' }}>{error}</span>
          </div>
        )}

        {data && data.symbols.map((result) => (
          <SymbolRow key={result.symbol} result={result} />
        ))}
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
  flex:       1,
  overflowY:  'auto',
  padding:    '6px 10px',
};

const centeredStyle: CSSProperties = {
  display:        'flex',
  height:         '100%',
  alignItems:     'center',
  justifyContent: 'center',
};

const symbolBlockStyle: CSSProperties = {
  marginBottom:  '10px',
  paddingBottom: '10px',
  borderBottom:  '1px solid #1a1a1e',
};

const symbolHeaderStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        '6px',
  marginBottom: '4px',
};

const symNameStyle: CSSProperties = {
  fontSize:   '13px',
  fontWeight: 700,
  color:      '#e0e0e0',
  minWidth:   '32px',
};

const biasBadgeStyle: CSSProperties = {
  fontSize:     '9px',
  fontWeight:   700,
  padding:      '1px 5px',
  borderRadius: '3px',
  border:       '1px solid',
  letterSpacing: '0.3px',
};

const barTrackStyle: CSSProperties = {
  flex:            1,
  height:          '6px',
  backgroundColor: '#1a1a1e',
  borderRadius:    '3px',
  position:        'relative',
  overflow:        'hidden',
};

const sigRowStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        '5px',
  padding:    '1px 0',
};
