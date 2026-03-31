import Layout from './components/Layout';
import PricePanel from './panels/PricePanel';
import LiquidationPanel from './panels/LiquidationPanel';
import OrderBookPanel from './panels/OrderBookPanel';
import AlertsPanel from './panels/AlertsPanel';
import AnalysisPanel from './panels/AnalysisPanel';

/**
 * App — root component.
 *
 * Renders the shared Layout shell and passes all dashboard panels as children.
 * All five panels are always rendered so the layout is complete, even if
 * some are just placeholders at this phase.
 */
function App() {
  return (
    <Layout>
      <PricePanel />
      <LiquidationPanel />
      <OrderBookPanel />
      <AlertsPanel />
      <AnalysisPanel />
    </Layout>
  );
}

export default App;
