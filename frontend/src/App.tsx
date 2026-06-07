import { useState, useCallback, useEffect, CSSProperties } from 'react';
import Layout from './components/Layout';
import PricePanel from './panels/PricePanel';
import LiquidationPanel from './panels/LiquidationPanel';
import OrderBookPanel from './panels/OrderBookPanel';
import AlertsPanel from './panels/AlertsPanel';
import DerivativesPanel from './panels/DerivativesPanel';
import ChatPanel from './panels/ChatPanel';
import OperatorConsole from './pages/OperatorConsole';
import ContextDesk from './pages/ContextDesk';
import AccountWorkspace from './pages/AccountWorkspace';
import { useIsMobile } from './hooks/useIsMobile';

type Page          = 'dashboard' | 'console' | 'context' | 'account';
type MobileDashTab = 'chart' | 'liq' | 'ob' | 'deriv' | 'alerts' | 'chat';

const MOBILE_DASH_TABS: { id: MobileDashTab; label: string }[] = [
  { id: 'chart',  label: 'Chart'  },
  { id: 'liq',    label: 'Liq'    },
  { id: 'ob',     label: 'OB'     },
  { id: 'deriv',  label: 'Deriv'  },
  { id: 'alerts', label: 'Alerts' },
  { id: 'chat',   label: 'Chat'   },
];

const col: CSSProperties = {
  flex:          1,
  display:       'flex',
  flexDirection: 'column',
  minWidth:      0,
  overflow:      'hidden',
};

const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#2a2a2e' };
const dividerV: CSSProperties = { width:  '1px', flexShrink: 0, backgroundColor: '#2a2a2e' };

function cell(flex: number): CSSProperties {
  return { flex, overflow: 'auto', minHeight: 0, backgroundColor: '#0f1117' };
}

export default function App() {
  const isMobile = useIsMobile();

  const [chatOpen,        setChatOpen]       = useState(!isMobile);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [activeSymbol,    setActiveSymbol]   = useState('BTCUSDT');
  const [activePage,      setActivePage]     = useState<Page>('dashboard');
  const [mobileDashTab,   setMobileDashTab]  = useState<MobileDashTab>('chart');

  const handleAnalysis = useCallback((msg: string) => {
    setAnalysisMessage(msg);
    if (isMobile) {
      setMobileDashTab('chat');
    } else if (!chatOpen) {
      setChatOpen(true);
    }
  }, [chatOpen, isMobile]);

  const handleAnalysisConsumed = useCallback(() => {
    setAnalysisMessage(null);
  }, []);

  // Close chat column by default when switching to mobile
  useEffect(() => {
    if (isMobile) setChatOpen(false);
  }, [isMobile]);

  const chatPanelEl = (
    <ChatPanel
      analysisMessage={analysisMessage}
      onAnalysisConsumed={handleAnalysisConsumed}
      activeSymbol={activeSymbol}
    />
  );

  // ── Mobile dashboard: single panel with bottom nav ─────────────────────────

  if (isMobile && activePage === 'dashboard') {
    const activePanel = (() => {
      switch (mobileDashTab) {
        case 'chart':  return <PricePanel symbol={activeSymbol} onAnalysis={handleAnalysis} />;
        case 'liq':    return <LiquidationPanel symbol={activeSymbol} />;
        case 'ob':     return <OrderBookPanel symbol={activeSymbol} />;
        case 'deriv':  return <DerivativesPanel symbol={activeSymbol} />;
        case 'alerts': return <AlertsPanel />;
        case 'chat':   return chatPanelEl;
      }
    })();

    return (
      <Layout
        chatPanel={<></>}
        chatOpen={false}
        onToggleChat={() => {}}
        activeSymbol={activeSymbol}
        onSymbolChange={setActiveSymbol}
        activePage={activePage}
        onPageChange={setActivePage}
      >
        <div style={mobileWrapStyle}>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {activePanel}
          </div>
          <nav style={bottomNavStyle}>
            {MOBILE_DASH_TABS.map((t) => (
              <button
                key={t.id}
                style={bottomTabStyle(t.id === mobileDashTab)}
                onClick={() => setMobileDashTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </Layout>
    );
  }

  // ── Mobile console / context: each page handles its own mobile layout ──────

  if (isMobile && activePage !== 'dashboard') {
    return (
      <Layout
        chatPanel={<></>}
        chatOpen={false}
        onToggleChat={() => {}}
        activeSymbol={activeSymbol}
        onSymbolChange={setActiveSymbol}
        activePage={activePage}
        onPageChange={setActivePage}
      >
        {activePage === 'console'  ? <OperatorConsole activeSymbol={activeSymbol} /> :
         activePage === 'account'  ? <AccountWorkspace /> :
         <ContextDesk activeSymbol={activeSymbol} />}
      </Layout>
    );
  }

  // ── Desktop layout (unchanged) ─────────────────────────────────────────────

  return (
    <Layout
      chatPanel={chatPanelEl}
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      activeSymbol={activeSymbol}
      onSymbolChange={setActiveSymbol}
      activePage={activePage}
      onPageChange={setActivePage}
    >
      {activePage === 'dashboard' ? (
        <>
          <div style={col}>
            <div style={cell(2)}><PricePanel symbol={activeSymbol} onAnalysis={handleAnalysis} /></div>
            <div style={dividerH} />
            <div style={cell(1)}><OrderBookPanel symbol={activeSymbol} /></div>
          </div>

          <div style={dividerV} />

          <div style={col}>
            <div style={cell(3)}><LiquidationPanel symbol={activeSymbol} /></div>
            <div style={dividerH} />
            <div style={cell(1)}><DerivativesPanel symbol={activeSymbol} /></div>
            <div style={dividerH} />
            <div style={cell(2)}><AlertsPanel /></div>
          </div>
        </>
      ) : activePage === 'console' ? (
        <OperatorConsole activeSymbol={activeSymbol} />
      ) : activePage === 'account' ? (
        <AccountWorkspace />
      ) : (
        <ContextDesk activeSymbol={activeSymbol} />
      )}
    </Layout>
  );
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
