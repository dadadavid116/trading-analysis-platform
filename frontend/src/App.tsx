import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Layout from './components/Layout';
import PricePanel from './panels/PricePanel';
import LiquidationPanel from './panels/LiquidationPanel';
import OrderBookPanel from './panels/OrderBookPanel';
import AlertsPanel from './panels/AlertsPanel';
import DerivativesPanel from './panels/DerivativesPanel';
import ChatPanel from './panels/ChatPanel';

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

function App() {
  const [chatOpen,       setChatOpen]       = useState(true);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [activeSymbol,   setActiveSymbol]   = useState('BTCUSDT');

  const handleAnalysis = useCallback((msg: string) => {
    setAnalysisMessage(msg);
    if (!chatOpen) setChatOpen(true);
  }, [chatOpen]);

  const handleAnalysisConsumed = useCallback(() => {
    setAnalysisMessage(null);
  }, []);

  return (
    <Layout
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      activeSymbol={activeSymbol}
      onSymbolChange={setActiveSymbol}
      chatPanel={
        <ChatPanel
          analysisMessage={analysisMessage}
          onAnalysisConsumed={handleAnalysisConsumed}
        />
      }
    >
      {/* Left column: Price takes 2/3, OrderBook takes 1/3 */}
      <div style={col}>
        <div style={cell(2)}><PricePanel symbol={activeSymbol} onAnalysis={handleAnalysis} /></div>
        <div style={dividerH} />
        <div style={cell(1)}><OrderBookPanel symbol={activeSymbol} /></div>
      </div>

      <div style={dividerV} />

      {/* Right column: Liquidation (top), Derivatives (mid), Alerts (bottom) */}
      <div style={col}>
        <div style={cell(3)}><LiquidationPanel symbol={activeSymbol} /></div>
        <div style={dividerH} />
        <div style={cell(1)}><DerivativesPanel symbol={activeSymbol} /></div>
        <div style={dividerH} />
        <div style={cell(2)}><AlertsPanel /></div>
      </div>
    </Layout>
  );
}

export default App;
