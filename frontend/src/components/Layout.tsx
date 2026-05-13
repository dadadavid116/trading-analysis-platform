import { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import ServiceHealth from './ServiceHealth';
import RelativeStrength from './RelativeStrength';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  SOLUSDT: 'SOL',
};

type Page = 'dashboard' | 'console';

interface LayoutProps {
  children:       ReactNode;
  chatPanel:      ReactNode;
  chatOpen:       boolean;
  onToggleChat:   () => void;
  activeSymbol:   string;
  onSymbolChange: (symbol: string) => void;
  activePage:     Page;
  onPageChange:   (page: Page) => void;
}

/**
 * Layout — two-column dashboard shell.
 *
 * Left side  (~2/3): scrollable grid of dashboard panels.
 * Right side (~1/3): fixed chat column, full viewport height.
 */
const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'console',   label: 'Console'   },
];

function Layout({ children, chatPanel, chatOpen, onToggleChat, activeSymbol, onSymbolChange, activePage, onPageChange }: LayoutProps) {
  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <span style={styles.logo}>📈</span>
        <h1 style={styles.title}>Trading Analysis Platform</h1>

        {/* Page navigation tabs */}
        <div style={navBarStyle}>
          {PAGES.map((p) => (
            <button
              key={p.id}
              style={navBtnStyle(p.id === activePage)}
              onClick={() => onPageChange(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Symbol selector — dashboard only */}
        {activePage === 'dashboard' && (
          <div style={symbolBarStyle}>
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                style={symbolBtnStyle(sym === activeSymbol)}
                onClick={() => onSymbolChange(sym)}
              >
                {SYMBOL_LABELS[sym]}
              </button>
            ))}
          </div>
        )}

        {/* 24H relative strength — dashboard only */}
        {activePage === 'dashboard' && <RelativeStrength />}

        {/* Collector health dots */}
        <ServiceHealth />

        {/* Chat toggle — dashboard only */}
        {activePage === 'dashboard' && (
          <button style={styles.chatToggle(chatOpen)} onClick={onToggleChat} title="Toggle AI Chat">
            {chatOpen ? 'Chat ◀' : 'Chat ▶'}
          </button>
        )}
      </header>

      {/* ── Body: left panel grid + right chat column ── */}
      <div style={styles.body}>

        {/* Left — two independent flex columns (children structured in App.tsx) */}
        <div style={styles.panelArea}>
          {children}
        </div>

        {/* Right — fixed-width chat column, console page hides it entirely */}
        {activePage === 'dashboard' && (
          <div style={styles.chatColumn(chatOpen)}>
            {chatPanel}
          </div>
        )}

      </div>
    </div>
  );
}

export default Layout;

// ── Styles ────────────────────────────────────────────────────────────────────

const HEADER_HEIGHT = '56px';

const styles = {
  root: {
    height:          '100vh',
    display:         'flex',
    flexDirection:   'column',
    backgroundColor: '#0f1117',
    color:           '#e0e0e0',
    overflow:        'hidden',
  } as CSSProperties,

  header: {
    height:          HEADER_HEIGHT,
    flexShrink:      0,
    display:         'flex',
    alignItems:      'center',
    gap:             '12px',
    padding:         '0 24px',
    borderBottom:    '1px solid #2a2a2e',
    backgroundColor: '#16161a',
  } as CSSProperties,

  logo:     { fontSize: '22px' } as CSSProperties,
  title:    { fontSize: '17px', fontWeight: 600, color: '#f0f0f0', margin: 0 } as CSSProperties,

  chatToggle: (open: boolean): CSSProperties => ({
    backgroundColor: open ? '#1e3a5f' : '#111114',
    border:          `1px solid ${open ? '#3a6a9f' : '#2a2a2e'}`,
    borderRadius:    '5px',
    color:           open ? '#90b8e0' : '#888',
    cursor:          'pointer',
    fontSize:        '12px',
    fontWeight:      600,
    padding:         '5px 12px',
    marginLeft:      '8px',
    transition:      'all 0.15s',
    whiteSpace:      'nowrap',
  }),

  body: {
    flex:          1,
    display:       'flex',
    flexDirection: 'row',
    overflow:      'hidden',
    height:        `calc(100vh - ${HEADER_HEIGHT})`,
  } as CSSProperties,

  panelArea: {
    flex:          1,
    overflow:      'hidden',
    minWidth:      0,
    display:       'flex',
    flexDirection: 'row',
  } as CSSProperties,

  chatColumn: (open: boolean): CSSProperties => ({
    width:         open ? 'clamp(340px, 33vw, 480px)' : '0',
    flexShrink:    0,
    overflow:      'hidden',
    borderLeft:    open ? '1px solid #2a2a2e' : 'none',
    transition:    'width 0.25s ease',
    display:       'flex',
    flexDirection: 'column',
  }),
};

const navBarStyle: CSSProperties = {
  display: 'flex',
  gap:     '2px',
};

const navBtnStyle = (active: boolean): CSSProperties => ({
  backgroundColor: active ? '#1a2440' : 'transparent',
  border:          `1px solid ${active ? '#3a5a8f' : 'transparent'}`,
  borderRadius:    '5px',
  color:           active ? '#90b8e0' : '#556',
  cursor:          'pointer',
  fontSize:        '12px',
  fontWeight:      active ? 700 : 500,
  padding:         '4px 12px',
  transition:      'all 0.1s',
});

const symbolBarStyle: CSSProperties = {
  display:    'flex',
  gap:        '4px',
  marginLeft: 'auto',
};

const symbolBtnStyle = (active: boolean): CSSProperties => ({
  backgroundColor: active ? '#1a2a3a' : 'transparent',
  border:          `1px solid ${active ? '#3a6a9f' : '#333'}`,
  borderRadius:    '4px',
  color:           active ? '#90b8e0' : '#666',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      active ? 700 : 500,
  padding:         '3px 9px',
  transition:      'all 0.1s',
});
