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
 * Each of the four dashboard panels is wrapped in a `cell` div that:
 *   - fills its 2×2 grid slot (minHeight: 0 prevents grid-cell expansion)
 *   - scrolls internally if content overflows
 *   - provides the panel background colour (matches the page bg for a seamless look)
 *
 * ChatPanel lives in the fixed right column, toggled by the header button.
 */

const cell: CSSProperties = {
  overflow: 'auto',
  minHeight: 0,
  backgroundColor: '#0f1117',
};

function App() {
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <Layout
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      chatPanel={<ChatPanel />}
    >
      <div style={cell}><PricePanel /></div>
      <div style={cell}><LiquidationPanel /></div>
      <div style={cell}><OrderBookPanel /></div>
      <div style={cell}><AlertsPanel /></div>
    </Layout>
  );
}

export default App;
