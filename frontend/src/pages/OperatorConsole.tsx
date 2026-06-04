import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerSignals } from '../api';
import type { ScannerResponse } from '../api';
import EventLogPanel from '../panels/EventLogPanel';
import ScannerPanel from '../panels/ScannerPanel';
import CandidatePanel from '../panels/CandidatePanel';
import JournalPanel from '../panels/JournalPanel';
import PerformancePanel from '../panels/PerformancePanel';
import PortfolioPanel from '../panels/PortfolioPanel';
import SignalMatrixPanel from '../panels/SignalMatrixPanel';
import { useIsMobile } from '../hooks/useIsMobile';

// Note: News + Market Map (Heatmap) moved to the Context Desk workspace in Phase 73.
type RightTab    = 'events' | 'journal' | 'performance' | 'portfolio' | 'signals';
type MobileTab   = 'scanner' | 'candidate' | 'performance' | 'journal' | 'events' | 'portfolio' | 'signals';

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'scanner',     label: 'Scanner'   },
  { id: 'candidate',   label: 'Setup'     },
  { id: 'performance', label: 'Stats'     },
  { id: 'journal',     label: 'Journal'   },
  { id: 'events',      label: 'Events'    },
  { id: 'portfolio',   label: 'Portfolio' },
  { id: 'signals',     label: 'Signals'   },
];

const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#1e1e22' };
const dividerV: CSSProperties = { width: '1px',  flexShrink: 0, backgroundColor: '#1e1e22' };

export default function OperatorConsole() {
  const isMobile = useIsMobile();

  const [scanner,    setScanner]    = useState<ScannerResponse | null>(null);
  const [scanErr,    setScanErr]    = useState<string | null>(null);
  const [rightTab,   setRightTab]   = useState<RightTab>('events');
  const [mobileTab,  setMobileTab]  = useState<MobileTab>('scanner');

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

  // ── Mobile layout ──────────────────────────────────────────────────────────

  if (isMobile) {
    const activePanel = (() => {
      switch (mobileTab) {
        case 'scanner':     return <ScannerPanel data={scanner} error={scanErr} />;
        case 'candidate':   return <CandidatePanel data={scanner} />;
        case 'performance': return <PerformancePanel />;
        case 'journal':     return <JournalPanel />;
        case 'events':      return <EventLogPanel />;
        case 'portfolio':   return <PortfolioPanel />;
        case 'signals':     return <SignalMatrixPanel />;
      }
    })();

    return (
      <div style={mobileWrapStyle}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activePanel}
        </div>
        <nav style={bottomNavStyle}>
          {MOBILE_TABS.map((t) => (
            <button
              key={t.id}
              style={bottomTabStyle(t.id === mobileTab)}
              onClick={() => setMobileTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────

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

      {/* Right column: tabbed (Event Log | Journal) */}
      <div style={rightColStyle}>
        <div style={tabBarStyle}>
          <button style={tabBtnStyle(rightTab === 'events')}      onClick={() => setRightTab('events')}>
            Event Log
          </button>
          <button style={tabBtnStyle(rightTab === 'journal')}     onClick={() => setRightTab('journal')}>
            Journal
          </button>
          <button style={tabBtnStyle(rightTab === 'performance')} onClick={() => setRightTab('performance')}>
            Performance
          </button>
          <button style={tabBtnStyle(rightTab === 'portfolio')} onClick={() => setRightTab('portfolio')}>
            Portfolio
          </button>
          <button style={tabBtnStyle(rightTab === 'signals')} onClick={() => setRightTab('signals')}>
            Signals
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {rightTab === 'events'      && <EventLogPanel />}
          {rightTab === 'journal'     && <JournalPanel />}
          {rightTab === 'performance' && <PerformancePanel />}
          {rightTab === 'portfolio'   && <PortfolioPanel />}
          {rightTab === 'signals'     && <SignalMatrixPanel />}
        </div>
      </div>
    </div>
  );
}

// ── Desktop styles ────────────────────────────────────────────────────────────

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
  flex:          1,
  minWidth:      0,
  overflow:      'hidden',
  display:       'flex',
  flexDirection: 'column',
};

const tabBarStyle: CSSProperties = {
  display:         'flex',
  gap:             '2px',
  padding:         '6px 10px',
  borderBottom:    '1px solid #1e1e22',
  backgroundColor: '#111115',
  flexShrink:      0,
};

function cellStyle(flex: number): CSSProperties {
  return { flex, minHeight: 0, overflow: 'hidden' };
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    backgroundColor: active ? '#1a2a4a' : 'transparent',
    border:          active ? '1px solid #2a4a8a' : '1px solid transparent',
    borderRadius:    '4px',
    color:           active ? '#90b8e0' : '#555',
    cursor:          'pointer',
    fontSize:        '11px',
    fontWeight:      active ? 700 : 400,
    padding:         '4px 12px',
    transition:      'all 0.15s',
  };
}

// ── Mobile styles ─────────────────────────────────────────────────────────────

const mobileWrapStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  width:         '100%',
  height:        '100%',
  overflow:      'hidden',
};

const bottomNavStyle: CSSProperties = {
  display:         'flex',
  flexShrink:      0,
  borderTop:       '1px solid #1e1e22',
  backgroundColor: '#111115',
  height:          '52px',
};

const bottomTabStyle = (active: boolean): CSSProperties => ({
  flex:            1,
  backgroundColor: active ? '#1a2440' : 'transparent',
  border:          'none',
  borderTop:       active ? '2px solid #3a6aaf' : '2px solid transparent',
  color:           active ? '#90b8e0' : '#555',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      active ? 700 : 500,
  padding:         '4px 0 6px',
  transition:      'all 0.12s',
});
