import { useState } from 'react';
import Layout from './components/Layout';
import PricePanel from './panels/PricePanel';
import LiquidationPanel from './panels/LiquidationPanel';
import OrderBookPanel from './panels/OrderBookPanel';
import AlertsPanel from './panels/AlertsPanel';
import ChatPanel from './panels/ChatPanel';

/**
 * App — root component.
 *
 * Manages the chat panel open/close state and passes it down to Layout.
 * The four dashboard panels live in the left scrollable grid.
 * ChatPanel lives in the fixed right column.
 */
function App() {
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <Layout
      chatOpen={chatOpen}
      onToggleChat={() => setChatOpen((prev) => !prev)}
      chatPanel={<ChatPanel />}
    >
      <PricePanel />
      <LiquidationPanel />
      <OrderBookPanel />
      <AlertsPanel />
    </Layout>
  );
}

export default App;
