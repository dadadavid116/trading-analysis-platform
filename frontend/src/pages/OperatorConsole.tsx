import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerSignals } from '../api';
import type { ScannerResponse } from '../api';
import EventLogPanel from '../panels/EventLogPanel';
import ScannerPanel from '../panels/ScannerPanel';
import CandidatePanel from '../panels/CandidatePanel';

const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#1e1e22' };
const dividerV: CSSProperties = { width: '1px',  flexShrink: 0, backgroundColor: '#1e1e22' };

export default function OperatorConsole() {
  const [scanner, setScanner]   = useState<ScannerResponse | null>(null);
  const [scanErr, setScanErr]   = useState<string | null>(null);

  useEffect(() => {
    const run = () => {
      fetchScannerSignals()
        .then((r) => { setScanner(r); setScanErr(null); })
        .catch((e: Error) => setScanErr(e.message));
    };
    run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={rootStyle}>
      {/* Left column: scanner (top) + candidates (bottom) */}
      <div style={leftColStyle}>
        <div style={cellStyle(1)}>
          <ScannerPanel data={scanner} error={scanErr} />
        </div>
        <div style={dividerH} />
        <div style={cellStyle(1)}>
          <CandidatePanel data={scanner} />
        </div>
      </div>

      <div style={dividerV} />

      {/* Right column: event log full-height */}
      <div style={rightColStyle}>
        <EventLogPanel />
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'row',
  height:        '100%',
  overflow:      'hidden',
};

const leftColStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  width:         '340px',
  flexShrink:    0,
  overflow:      'hidden',
};

const rightColStyle: CSSProperties = {
  flex:     1,
  minWidth: 0,
  overflow: 'hidden',
};

function cellStyle(flex: number): CSSProperties {
  return { flex, minHeight: 0, overflow: 'hidden' };
}
