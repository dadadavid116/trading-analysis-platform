import { panelStyles } from './panelStyles';

/**
 * AnalysisPanel — [Later] placeholder.
 *
 * This panel is intentionally empty for Phase 3 (frontend scaffold).
 * It will be implemented in Phase 6 (Analysis worker phase) once:
 *  - The Claude API integration is wired up in the backend
 *  - The analysis_summaries DB table is populated
 *  - The /api/analysis/latest endpoint is implemented
 *
 * The panel is rendered in the layout now so the grid is complete.
 */
function AnalysisPanel() {
  return (
    <div style={{ ...panelStyles.card, ...panelStyles.placeholderCard }}>
      <h2 style={panelStyles.title}>AI Analysis</h2>
      <p style={panelStyles.placeholderLabel}>[Later] — Not yet implemented</p>
      <p style={panelStyles.muted}>
        This panel will display AI-generated market summaries powered by the Claude API.
        It will be wired up in the Analysis worker phase.
      </p>
    </div>
  );
}

export default AnalysisPanel;
