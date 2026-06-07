import { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import ServiceHealth from './ServiceHealth';
import RelativeStrength from './RelativeStrength';
import PriceTicker from './PriceTicker';
import { useIsMobile } from '../hooks/useIsMobile';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const SYMBOL_LABELS: Record<string, string> = {
  BTCUSDT: 'BTC',
  ETHUSDT: 'ETH',
  SOLUSDT: 'SOL',
};

type Page = 'dashboard' | 'console' | 'context' | 'account';

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

const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'console',   label: 'Console'   },
  { id: 'context',   label: 'Context'   },
  { id: 'account',   label: 'Account'   },
];

export default function Layout({
  children, chatPanel, chatOpen, onToggleChat,
  activeSymbol, onSymbolChange, activePage, onPageChange,
}: LayoutProps) {
  const isMobile = useIsMobile();
  const isDash   = activePage === 'dashboard';

  return (
    <div style={rootStyle}>
      {/* ── Header ── */}
      {isMobile ? (
        <header style={mobileHeaderStyle}>
          {/* Row 1: title + page tabs + health */}
          <div style={mobileRow1Style}>
            <span style={mobileTitleStyle}>TAP</span>
            <div style={navBarStyle}>
              {PAGES.map((p) => (
                <button key={p.id} style={navBtnStyle(p.id === activePage)} onClick={() => onPageChange(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <ServiceHealth />
          </div>
          {/* Row 2: symbol selector + price ticker (all pages) */}
          <div style={mobileRow2Style}>
            <div style={symbolBarStyle}>
              {SYMBOLS.map((sym) => (
                <button key={sym} style={symbolBtnStyle(sym === activeSymbol)} onClick={() => onSymbolChange(sym)}>
                  {SYMBOL_LABELS[sym]}
                </button>
              ))}
            </div>
            <PriceTicker />
          </div>
        </header>
      ) : (
        <header style={desktopHeaderStyle}>
          <span style={logoStyle}>TAP</span>
          <h1 style={titleStyle}>Trading Analysis Platform</h1>

          <div style={navBarStyle}>
            {PAGES.map((p) => (
              <button key={p.id} style={navBtnStyle(p.id === activePage)} onClick={() => onPageChange(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <PriceTicker />

          <div style={symbolBarStyle}>
            {SYMBOLS.map((sym) => (
              <button key={sym} style={symbolBtnStyle(sym === activeSymbol)} onClick={() => onSymbolChange(sym)}>
                {SYMBOL_LABELS[sym]}
              </button>
            ))}
          </div>

          {isDash && <RelativeStrength />}
          <ServiceHealth />

          {isDash && (
            <button style={chatToggleStyle(chatOpen)} onClick={onToggleChat} title="Toggle AI Chat">
              {chatOpen ? 'Chat ◀' : 'Chat ▶'}
            </button>
          )}
        </header>
      )}

      {/* ── Body ── */}
      <div style={bodyStyle}>
        <div style={panelAreaStyle}>
          {children}
        </div>

        {/* Chat column — desktop only, dashboard only */}
        {!isMobile && isDash && (
          <div style={chatColumnStyle(chatOpen)}>
            {chatPanel}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  height:          '100%',
  display:         'flex',
  flexDirection:   'column',
  backgroundColor: '#0f1117',
  color:           '#e0e0e0',
  overflow:        'hidden',
};

const desktopHeaderStyle: CSSProperties = {
  flexShrink:      0,
  display:         'flex',
  alignItems:      'center',
  gap:             '12px',
  padding:         '0 24px',
  height:          '56px',
  borderBottom:    '1px solid #2a2a2e',
  backgroundColor: '#16161a',
};

const mobileHeaderStyle: CSSProperties = {
  flexShrink:      0,
  display:         'flex',
  flexDirection:   'column',
  borderBottom:    '1px solid #2a2a2e',
  backgroundColor: '#16161a',
};

const mobileRow1Style: CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         '10px',
  padding:     '0 14px',
  height:      '44px',
};

const mobileRow2Style: CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            '10px',
  padding:        '4px 14px 6px',
  borderTop:      '1px solid #1e1e22',
  justifyContent: 'space-between',
};

const mobileTitleStyle: CSSProperties = {
  fontSize:      '14px',
  fontWeight:    700,
  color:         '#f0f0f0',
  letterSpacing: '1px',
};

const logoStyle: CSSProperties = {
  fontSize:      '14px',
  fontWeight:    700,
  color:         '#33aa66',
  letterSpacing: '1px',
};

const titleStyle: CSSProperties = {
  fontSize:   '17px',
  fontWeight: 600,
  color:      '#f0f0f0',
  margin:     0,
};

const bodyStyle: CSSProperties = {
  flex:          1,
  display:       'flex',
  flexDirection: 'row',
  overflow:      'hidden',
  minHeight:     0,
};

const panelAreaStyle: CSSProperties = {
  flex:          1,
  overflow:      'hidden',
  minWidth:      0,
  display:       'flex',
  flexDirection: 'row',
};

const chatColumnStyle = (open: boolean): CSSProperties => ({
  width:         open ? 'clamp(340px, 33vw, 480px)' : '0',
  flexShrink:    0,
  overflow:      'hidden',
  borderLeft:    open ? '1px solid #2a2a2e' : 'none',
  transition:    'width 0.25s ease',
  display:       'flex',
  flexDirection: 'column',
});

const chatToggleStyle = (open: boolean): CSSProperties => ({
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
});

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
  padding:         '4px 10px',
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
