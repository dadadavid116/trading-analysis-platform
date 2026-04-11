import { useState } from 'react';
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
 * This decouples the rows — changing Alerts' height no longer affects Price.
 */

const col: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

// Thin 1px dividers between panels.
const dividerH: CSSProperties = { height: '1px', flexShrink: 0, backgroundColor: '#2a2a2e' };
const dividerV: CSSProperties = { width: '1px',  flexShrink: 0, backgroundColor: '#2a2a2e' };

// Panel cell — takes a flex ratio and scrolls its content internally.
function cell(flex: number): CSSProperties {
  return { flex, overflow: 'auto', minHeight: 0, backgroundColor: '#0f1117' };
}

function App() {
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <Layout
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      chatPanel={<ChatPanel />}
    >
      {/* Left column: Price takes 2/3, OrderBook takes 1/3 */}
      <div style={col}>
        <div style={cell(2)}><PricePanel /></div>
        <div style={dividerH} />
        <div style={cell(1)}><OrderBookPanel /></div>
      </div>

      {/* 1px vertical divider between the two columns */}
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
