import { useState } from 'react';
import AnalysisPanel from '../panels/AnalysisPanel';
import NewsPanel from '../panels/NewsPanel';
import HeatmapPanel from '../panels/HeatmapPanel';
import OverviewSection from './contextdesk/OverviewSection';
import CryptoFactorsSection from './contextdesk/CryptoFactorsSection';
import MacroFactorsSection from './contextdesk/MacroFactorsSection';
import { WorkspaceShell } from '../theme';

/**
 * ContextDesk — the third main workspace: "what environment am I trading inside."
 *
 * Phase 73 introduced the workspace + relocated News/Heatmap/AnalysisPanel here.
 * Phase 74 moved the tab/nav chrome onto the shared WorkspaceShell primitive.
 * Phase 75 (this) builds the shell sections from EXISTING data only:
 *   - Overview  — regime header + context score (PREVIEW heuristic) + asset signal tower
 *   - Crypto    — crypto factor cards (Fear&Greed, dominance, funding/OI/LS, rel-strength)
 *   - Macro     — placeholder listing planned macro factors (live data: Phase 80–81)
 *   - News      — crypto news feed
 *   - Market Map— heatmap + correlation + global stats
 *   - Summary   — scheduled AI market summary
 *
 * No new collectors/endpoints. Real factor collection + deterministic scoring land in 79–82.
 */

type Tab = 'overview' | 'crypto' | 'macro' | 'news' | 'map' | 'summary';

const TABS = [
  { id: 'overview', label: 'Overview'       },
  { id: 'crypto',   label: 'Crypto'         },
  { id: 'macro',    label: 'Macro'          },
  { id: 'news',     label: 'News'           },
  { id: 'map',      label: 'Market Map'     },
  { id: 'summary',  label: 'Market Summary' },
];

interface ContextDeskProps {
  activeSymbol?: string;
}

export default function ContextDesk({ activeSymbol: _activeSymbol = 'BTCUSDT' }: ContextDeskProps) {
  const [tab, setTab] = useState<Tab>('overview');

  const panel = (() => {
    switch (tab) {
      case 'overview': return <OverviewSection />;
      case 'crypto':   return <CryptoFactorsSection />;
      case 'macro':    return <MacroFactorsSection />;
      case 'news':     return <NewsPanel />;
      case 'map':      return <HeatmapPanel />;
      case 'summary':  return <AnalysisPanel />;
    }
  })();

  return (
    <WorkspaceShell tabs={TABS} activeTab={tab} onTabChange={(id) => setTab(id as Tab)}>
      {panel}
    </WorkspaceShell>
  );
}
