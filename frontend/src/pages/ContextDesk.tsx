import { useState } from 'react';
import AnalysisPanel from '../panels/AnalysisPanel';
import NewsPanel from '../panels/NewsPanel';
import HeatmapPanel from '../panels/HeatmapPanel';
import { WorkspaceShell } from '../theme';

/**
 * ContextDesk — the third main workspace: "what environment am I trading inside."
 *
 * Phase 73 introduced this as the home for the auxiliary market-context panels that
 * were previously buried in the Operator Console tab strip:
 *   - Market Summary  — the scheduled AI market summary (AnalysisPanel, previously orphaned)
 *   - News            — crypto news feed
 *   - Market Map      — heatmap + correlation + global market stats
 *
 * Phase 74 refactored the tab/nav chrome onto the shared `WorkspaceShell` primitive
 * (desktop top tabs / mobile bottom nav) so this page no longer carries its own layout CSS.
 *
 * The richer factor/regime/scorecard layers arrive in later phases (75 shell sections,
 * 79–83 factors + scoring). Uses existing data/endpoints only.
 */

type Tab = 'summary' | 'news' | 'map';

const TABS = [
  { id: 'summary', label: 'Market Summary' },
  { id: 'news',    label: 'News'           },
  { id: 'map',     label: 'Market Map'     },
];

export default function ContextDesk() {
  const [tab, setTab] = useState<Tab>('summary');

  const panel = (() => {
    switch (tab) {
      case 'summary': return <AnalysisPanel />;
      case 'news':    return <NewsPanel />;
      case 'map':     return <HeatmapPanel />;
    }
  })();

  return (
    <WorkspaceShell tabs={TABS} activeTab={tab} onTabChange={(id) => setTab(id as Tab)}>
      {panel}
    </WorkspaceShell>
  );
}
