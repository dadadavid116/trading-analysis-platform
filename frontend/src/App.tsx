import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Layout from './components/Layout';
import PricePanel from './panels/PricePanel';
import LiquidationPanel from './panels/LiquidationPanel';
import OrderBookPanel from './panels/OrderBookPanel';
import AlertsPanel from './panels/AlertsPanel';
import ChatPanel from './panels/ChatPanel';

/**
 * App — root component.
 *
 * Two independent flex columns so each column can have its own height split:
 *
 *   Left column:   Price (2/3 height)  |  Right column: Liquidation (3/5 height)
 *                  OrderBook (1/3)     |                Alerts (2/5)
 *
 * analysisMessage: lifted state so PricePanel can push Claude's chart analysis
 * text into ChatPanel without them knowing about each other.
 */

const col: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#2a2a2e' };
const dividerV: CSSProperties = { width: '1px',  flexShrink: 0, backgroundColor: '#2a2a2e' };

function cell(flex: number): CSSProperties {
  return { flex, overflow: 'auto', minHeight: 0, backgroundColor: '#0f1117' };
}

function App() {
  const [chatOpen, setChatOpen] = useState(true);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

  const handleAnalysis = useCallback((msg: string) => {
    setAnalysisMessage(msg);
    if (!chatOpen) setChatOpen(true); // open chat panel if it's collapsed
  }, [chatOpen]);

  const handleAnalysisConsumed = useCallback(() => {
    setAnalysisMessage(null);
  }, []);

  return (
    <Layout
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      chatPanel={
        <ChatPanel
          analysisMessage={analysisMessage}
          onAnalysisConsumed={handleAnalysisConsumed}
        />
      }
    >
      {/* Left column: Price takes 2/3, OrderBook takes 1/3 */}
      <div style={col}>
        <div style={cell(2)}><PricePanel onAnalysis={handleAnalysis} /></div>
        <div style={dividerH} />
        <div style={cell(1)}><OrderBookPanel /></div>
      </div>

      <div style={dividerV} />

      {/* Right column: Liquidation takes 3/5, Alerts takes 2/5 */}
      <div style={col}>
        <div style={cell(3)}><LiquidationPanel /></div>
        <div style={dividerH} />
        <div style={cell(2)}><AlertsPanel /></div>
      </div>
    </Layout>
  );
}

export default App;
