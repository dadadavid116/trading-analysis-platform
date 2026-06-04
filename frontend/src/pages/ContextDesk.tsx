import { useState, CSSProperties } from 'react';
import AnalysisPanel from '../panels/AnalysisPanel';
import NewsPanel from '../panels/NewsPanel';
import HeatmapPanel from '../panels/HeatmapPanel';
import { useIsMobile } from '../hooks/useIsMobile';

/**
 * ContextDesk — the third main workspace: "what environment am I trading inside."
 *
 * Phase 73 (Information Architecture Reset) introduces this as the new home for the
 * auxiliary market-context panels that were previously buried in the Operator Console
 * tab strip:
 *   - Market Summary  — the scheduled AI market summary (AnalysisPanel, previously orphaned)
 *   - News            — crypto news feed
 *   - Market Map      — heatmap + correlation + global market stats
 *
 * This is the shell only. The richer factor/regime/scorecard layers arrive in later
 * phases (75 shell sections, 79–83 factors + scoring). Uses existing data/endpoints only.
 */

type Tab = 'summary' | 'news' | 'map';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Market Summary' },
  { id: 'news',    label: 'News'           },
  { id: 'map',     label: 'Market Map'     },
];

export default function ContextDesk() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('summary');

  const panel = (() => {
    switch (tab) {
      case 'summary': return <AnalysisPanel />;
      case 'news':    return <NewsPanel />;
      case 'map':     return <HeatmapPanel />;
    }
  })();

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={mobileWrapStyle}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{panel}</div>
        <nav style={bottomNavStyle}>
          {TABS.map((t) => (
            <button key={t.id} style={bottomTabStyle(t.id === tab)} onClick={() => setTab(t.id)}>
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
      <div style={tabBarStyle}>
        {TABS.map((t) => (
          <button key={t.id} style={tabBtnStyle(t.id === tab)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{panel}</div>
    </div>
  );
}

// ── Desktop styles ──────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  height:        '100%',
  overflow:      'hidden',
};

const tabBarStyle: CSSProperties = {
  display:         'flex',
  gap:             '2px',
  padding:         '6px 10px',
  borderBottom:    '1px solid #1e1e22',
  backgroundColor: '#111115',
  flexShrink:      0,
};

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
