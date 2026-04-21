import { useState, useEffect, useRef, CSSProperties, FormEvent } from 'react';
import { fetchAlerts, createAlert, deleteAlert, Alert } from '../api';
import { panelStyles } from './panelStyles';

/**
 * AlertsPanel — displays configured alert rules and lets you create new ones.
 *
 * Data source: /api/alerts/ (Phase 8).
 * Polls every 15 s to pick up newly triggered alerts automatically.
 *
 * Supported condition types:
 *   price_above       — triggers when BTC close > threshold
 *   price_below       — triggers when BTC close < threshold
 *   liquidation_spike — triggers when event count in window_minutes > threshold
 *
 * Trigger modes:
 *   once  — triggers once, stays triggered until the alert is deleted
 *   rearm — resets when the condition is no longer met, can trigger again
 *
 * Notifications are sent via Telegram when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are configured. Alerts can also be deleted from this panel
 * or via the /delete_alert <id> Telegram bot command.
 */
function AlertsPanel() {
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [formName,        setFormName]        = useState('');
  const [formType,        setFormType]        = useState('price_above');
  const [formThreshold,   setFormThreshold]   = useState('');
  const [formWindow,      setFormWindow]      = useState('');
  const [formTriggerMode, setFormTriggerMode] = useState('once');
  const [formError,       setFormError]       = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [deletingId,      setDeletingId]      = useState<number | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // Tracks alert IDs that were already triggered on the previous poll cycle.
  // Populated silently on first load — only NEW triggers fire a notification.
  const knownTriggeredRef = useRef<Set<number> | null>(null);

  // ── Request notification permission on mount ───────────────────────────────
  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotifPermission(Notification.permission);
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => setNotifPermission(p));
    }
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      fetchAlerts()
        .then((data) => {
          // ── Desktop notification logic ───────────────────────────────────
          if ('Notification' in window && Notification.permission === 'granted') {
            const currentTriggered = new Set(
              data.filter((a) => a.triggered_at).map((a) => a.id),
            );

            if (knownTriggeredRef.current === null) {
              // First load — seed silently, no popup.
              knownTriggeredRef.current = currentTriggered;
            } else {
              // Find IDs that are newly triggered since last poll.
              for (const id of currentTriggered) {
                if (!knownTriggeredRef.current.has(id)) {
                  const alert = data.find((a) => a.id === id);
                  if (alert) {
                    const body =
                      alert.condition_type === 'liquidation_spike'
                        ? `Liquidation spike exceeded ${alert.threshold} events`
                        : `BTC ${alert.condition_type === 'price_above' ? 'rose above' : 'dropped below'} $${Number(alert.threshold).toLocaleString()}`;
                    new Notification(`🚨 ${alert.name}`, { body, icon: '/favicon.ico' });
                  }
                }
              }
              knownTriggeredRef.current = currentTriggered;
            }
          }

          setAlerts(data);
          setError(null);
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message);
          setLoading(false);
        });
    };

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  // ── Create alert ───────────────────────────────────────────────────────────
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const threshold = parseFloat(formThreshold);
    if (!formName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (isNaN(threshold) || threshold <= 0) {
      setFormError('Threshold must be a positive number.');
      return;
    }
    if (formType === 'liquidation_spike' && !formWindow.trim()) {
      setFormError('Window (minutes) is required for liquidation_spike.');
      return;
    }

    setSubmitting(true);
    try {
      await createAlert({
        name:           formName.trim(),
        condition_type: formType,
        threshold,
        window_minutes: formType === 'liquidation_spike' ? parseInt(formWindow, 10) : null,
        trigger_mode:   formTriggerMode,
      });
      const updated = await fetchAlerts();
      setAlerts(updated);
      setFormName('');
      setFormThreshold('');
      setFormWindow('');
      setFormTriggerMode('once');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not create alert.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete alert ──────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete alert.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatThreshold = (alert: Alert) => {
    if (alert.condition_type === 'liquidation_spike') {
      return `${alert.threshold} events / ${alert.window_minutes ?? '?'} min`;
    }
    return `$${Number(alert.threshold).toLocaleString()}`;
  };

  const conditionLabel = (type: string) => {
    if (type === 'price_above')       return 'Price >';
    if (type === 'price_below')       return 'Price <';
    if (type === 'liquidation_spike') return 'Liq spike';
    return type;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={panelStyles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>Alerts — BTC/USDT</h2>
        {'Notification' in window && (
          notifPermission === 'granted' ? (
            <span style={{ fontSize: '10px', color: '#66bb6a' }}>🔔 Notifications on</span>
          ) : notifPermission === 'denied' ? (
            <span style={{ fontSize: '10px', color: '#f44336' }}>🔕 Notifications blocked</span>
          ) : (
            <button
              style={{ fontSize: '10px', color: '#f5a623', background: 'none', border: '1px solid #f5a623', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px' }}
              onClick={() => Notification.requestPermission().then((p) => setNotifPermission(p))}
            >
              Enable notifications
            </button>
          )
        )}
      </div>

      {/* Scrollable alert list — grows to fill available space */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && <p style={panelStyles.muted}>Loading…</p>}

        {error && (
          <p style={panelStyles.error}>
            Could not load alerts — check that the API is running.
          </p>
        )}

        {!loading && !error && alerts.length === 0 && (
          <p style={panelStyles.muted}>No alerts configured yet. Create one below.</p>
        )}

        {!loading && !error && alerts.length > 0 && (
          <table style={panelStyles.table}>
            <thead>
              <tr>
                <th style={panelStyles.th}>Name</th>
                <th style={panelStyles.th}>Condition</th>
                <th style={panelStyles.th}>Threshold</th>
                <th style={panelStyles.th}>Mode</th>
                <th style={panelStyles.th}>Status</th>
                <th style={panelStyles.th}></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td style={panelStyles.td}>{a.name}</td>
                  <td style={panelStyles.td}>{conditionLabel(a.condition_type)}</td>
                  <td style={panelStyles.td}>{formatThreshold(a)}</td>
                  <td style={panelStyles.td}>{a.trigger_mode}</td>
                  <td style={panelStyles.td}>
                    {a.triggered_at ? (
                      <span style={{ color: '#f44336' }}>
                        Triggered {new Date(a.triggered_at).toLocaleTimeString()}
                      </span>
                    ) : (
                      <span style={{ color: '#66bb6a' }}>Watching</span>
                    )}
                  </td>
                  <td style={panelStyles.td}>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      style={deleteButtonStyle}
                      title="Delete alert"
                    >
                      {deletingId === a.id ? '…' : '×'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form — pinned at the bottom, always visible */}
      <div style={{ borderTop: '1px solid #2a2a2e', paddingTop: '10px', flexShrink: 0 }}>
        <p style={{ ...panelStyles.label, marginBottom: '6px' }}>New alert</p>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            style={inputStyle}
            placeholder="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <select
            style={inputStyle}
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
          >
            <option value="price_above">Price above</option>
            <option value="price_below">Price below</option>
            <option value="liquidation_spike">Liquidation spike</option>
          </select>
          <input
            style={inputStyle}
            placeholder={
              formType === 'liquidation_spike'
                ? 'Event count threshold'
                : 'Price threshold (USD)'
            }
            value={formThreshold}
            onChange={(e) => setFormThreshold(e.target.value)}
            type="number"
            min="0"
            step="any"
          />
          {formType === 'liquidation_spike' && (
            <input
              style={inputStyle}
              placeholder="Window (minutes)"
              value={formWindow}
              onChange={(e) => setFormWindow(e.target.value)}
              type="number"
              min="1"
              step="1"
            />
          )}
          <select
            style={inputStyle}
            value={formTriggerMode}
            onChange={(e) => setFormTriggerMode(e.target.value)}
          >
            <option value="once">Once — trigger once, then stay triggered</option>
            <option value="rearm">Rearm — reset and trigger again</option>
          </select>
          {formError && <p style={panelStyles.error}>{formError}</p>}
          <button type="submit" style={buttonStyle} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create alert'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  backgroundColor: '#111114',
  border: '1px solid #2a2a2e',
  borderRadius: '4px',
  padding: '6px 8px',
  color: '#d0d0d0',
  fontSize: '12px',
  width: '100%',
  boxSizing: 'border-box',
};

const deleteButtonStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '2px 7px',
  color: '#f44336',
  fontSize: '14px',
  cursor: 'pointer',
  lineHeight: 1,
};

const buttonStyle: CSSProperties = {
  backgroundColor: '#2a4a7f',
  border: 'none',
  borderRadius: '4px',
  padding: '7px 12px',
  color: '#d0d0d0',
  fontSize: '12px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};

export default AlertsPanel;
