import { panelStyles } from './panelStyles';

/**
 * AlertsPanel — [Later] placeholder.
 *
 * This panel is intentionally empty for Phase 3 (frontend scaffold).
 * It will be implemented in Phase 7 (Alerts phase) once:
 *  - The alerts DB table is defined
 *  - The /api/alerts/ endpoints are implemented
 *  - Alert evaluation logic is wired up
 *
 * The panel is rendered in the layout now so the grid is complete.
 */
function AlertsPanel() {
  return (
    <div style={{ ...panelStyles.card, ...panelStyles.placeholderCard }}>
      <h2 style={panelStyles.title}>Alerts</h2>
      <p style={panelStyles.placeholderLabel}>[Later] — Not yet implemented</p>
      <p style={panelStyles.muted}>
        This panel will display configured alerts and their trigger status.
        It will be wired up in the Alerts phase.
      </p>
    </div>
  );
}

export default AlertsPanel;
