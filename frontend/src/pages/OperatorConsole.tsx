import type { CSSProperties } from 'react';
import EventLogPanel from '../panels/EventLogPanel';
import ScannerPanel from '../panels/ScannerPanel';
import CandidatePanel from '../panels/CandidatePanel';

const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#1e1e22' };
const dividerV: CSSProperties = { width: '1px',  flexShrink: 0, backgroundColor: '#1e1e22' };

export default function OperatorConsole() {
  return (
    <div style={rootStyle}>
      {/* Left column: scanner (top) + candidates (bottom) */}
      <div style={leftColStyle}>
        <div style={cellStyle(1)}><ScannerPanel /></div>
        <div style={dividerH} />
        <div style={cellStyle(1)}><CandidatePanel /></div>
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
  width:         '320px',
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
