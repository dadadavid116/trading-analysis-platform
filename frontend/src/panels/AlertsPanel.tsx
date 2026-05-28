import { useState, useEffect, useRef, CSSProperties, FormEvent } from 'react';
import { fetchAlerts, createAlert, deleteAlert, fetchAlertEvents, Alert, EventLogEntry } from '../api';
import { panelStyles } from './panelStyles';

type Tab = 'active' | 'history';

function AlertsPanel() {
  const [tab, setTab]         = useState<Tab>('active');
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // ── History tab state ──────────────────────────────────────────────────────
  const [historyEvents,  setHistoryEvents]  = useState<EventLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [formName,        setFormName]        = useState('');
  const [formSymbol,      setFormSymbol]      = useState('BTCUSDT');
  const [formType,        setFormType]        = useState('price_above');
  const [formThreshold,   setFormThreshold]   = useState('');
  const [formWindow,      setFormWindow]      = useState('');
  const [formTriggerMode, setFormTriggerMode] = useState('once');
  const [formError,       setFormError]       = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [deletingId,      setDeletingId]      = useState<number | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

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
          if ('Notification' in window && Notification.permission === 'granted') {
            const currentTriggered = new Set(
              data.filter((a) => a.triggered_at).map((a) => a.id),
            );
            if (knownTriggeredRef.current === null) {
              knownTriggeredRef.current = currentTriggered;
            } else {
              for (const id of currentTriggered) {
                if (!knownTriggeredRef.current.has(id)) {
                  const alert = data.find((a) => a.id === id);
                  if (alert) {
                    let body = '';
                    if (alert.condition_type === 'liquidation_spike') {
                      body = `Liquidation spike exceeded ${alert.threshold} events`;
                    } else if (alert.condition_type === 'funding_rate_above') {
                      body = `${alert.symbol} funding rate crossed above ${Number(alert.threshold).toFixed(4)}%`;
                    } else if (alert.condition_type === 'funding_rate_below') {
                      body = `${alert.symbol} funding rate dropped below ${Number(alert.threshold).toFixed(4)}%`;
                    } else if (alert.condition_type === 'price_spike_up') {
                      body = `${alert.symbol} spiked up >${Number(alert.threshold).toFixed(2)}% in ${alert.window_minutes ?? '?'} min`;
                    } else if (alert.condition_type === 'price_spike_down') {
                      body = `${alert.symbol} dropped >${Number(alert.threshold).toFixed(2)}% in ${alert.window_minutes ?? '?'} min`;
                    } else {
                      body = `${alert.symbol} ${alert.condition_type === 'price_above' ? 'rose above' : 'dropped below'} $${Number(alert.threshold).toLocaleString()}`;
                    }
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

  // ── History tab — load on tab switch, then poll every 30 s ────────────────
  useEffect(() => {
    if (tab !== 'history') return;
    setHistoryLoading(true);
    const load = () => {
      fetchAlertEvents(50)
        .then((data) => { setHistoryEvents(data); setHistoryLoading(false); })
        .catch(() => setHistoryLoading(false));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [tab]);

  // ── Create alert ───────────────────────────────────────────────────────────
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const threshold = parseFloat(formThreshold);
    if (!formName.trim()) { setFormError('Name is required.'); return; }
    if (isNaN(threshold) || threshold <= 0) { setFormError('Threshold must be a positive number.'); return; }
    const needsWindow = formType === 'liquidation_spike' || formType === 'price_spike_up' || formType === 'price_spike_down';
    if (needsWindow && !formWindow.trim()) {
      setFormError('Window (minutes) is required for this condition.');
      return;
    }

    setSubmitting(true);
    try {
      await createAlert({
        name:           formName.trim(),
        symbol:         formSymbol,
        condition_type: formType,
        threshold,
        window_minutes: needsWindow ? parseInt(formWindow, 10) : null,
        trigger_mode:   formTriggerMode,
      });
      const updated = await fetchAlerts();
      setAlerts(updated);
      // Reset + close form on success
      setFormName('');
      setFormSymbol('BTCUSDT');
      setFormThreshold('');
      setFormWindow('');
      setFormTriggerMode('once');
      setFormOpen(false);
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
    if (alert.condition_type === 'funding_rate_above' || alert.condition_type === 'funding_rate_below') {
      return `${Number(alert.threshold).toFixed(4)}%`;
    }
    if (alert.condition_type === 'price_spike_up' || alert.condition_type === 'price_spike_down') {
      return `${Number(alert.threshold).toFixed(2)}% / ${alert.window_minutes ?? '?'} min`;
    }
    return `$${Number(alert.threshold).toLocaleString()}`;
  };

  const conditionLabel = (type: string) => {
    if (type === 'price_above')        return 'Price >';
    if (type === 'price_below')        return 'Price <';
    if (type === 'liquidation_spike')  return 'Liq spike';
    if (type === 'funding_rate_above') return 'FR >';
    if (type === 'funding_rate_below') return 'FR <';
    if (type === 'price_spike_up')     return 'Spike ↑';
    if (type === 'price_spike_down')   return 'Spike ↓';
    return type;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={panelStyles.card}>

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div style={headerStyle}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Alerts
        </h2>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '2px', margin: '0 10px' }}>
          {(['active', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background:   tab === t ? '#1e3a5f' : 'transparent',
                border:       `1px solid ${tab === t ? '#3a6a9f' : '#2a2a2e'}`,
                borderRadius: '3px',
                color:        tab === t ? '#90b8e0' : '#555',
                cursor:       'pointer',
                fontSize:     '10px',
                fontWeight:   tab === t ? 600 : 400,
                padding:      '2px 8px',
              }}
            >
              {t === 'active' ? 'Active' : 'History'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {/* Notification permission indicator */}
          {'Notification' in window && (
            notifPermission === 'granted' ? (
              <span style={{ fontSize: '10px', color: '#66bb6a' }}>🔔</span>
            ) : notifPermission === 'denied' ? (
              <span style={{ fontSize: '10px', color: '#f44336' }} title="Notifications blocked">🔕</span>
            ) : (
              <button
                style={microBtnStyle}
                onClick={() => Notification.requestPermission().then((p) => setNotifPermission(p))}
              >
                Enable notifications
              </button>
            )
          )}

          {/* New alert toggle */}
          <button
            style={toggleBtnStyle(formOpen)}
            onClick={() => setFormOpen((prev) => !prev)}
            title={formOpen ? 'Close form' : 'New alert'}
          >
            {formOpen ? 'Close ▲' : '+ New alert'}
          </button>
        </div>
      </div>

      {/* ── History tab ────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {historyLoading && <p style={panelStyles.muted}>Loading…</p>}
          {!historyLoading && historyEvents.length === 0 && (
            <p style={{ ...panelStyles.muted, padding: '16px 0' }}>
              No alert events yet — trigger history appears here once alerts fire.
            </p>
          )}
          {!historyLoading && historyEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' }}>
              {historyEvents.map((ev) => (
                <div key={ev.id} style={historyRowStyle}>
                  <span style={historyBadgeStyle(ev.event_type)}>
                    {ev.event_type === 'alert_triggered' ? 'FIRED' : 'REARM'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>{ev.message}</span>
                    {ev.symbol && (
                      <span style={{ fontSize: '10px', color: '#555', marginLeft: '6px' }}>
                        {ev.symbol.replace('USDT', '')}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '9px', color: '#444', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(ev.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Alert list ─────────────────────────────────────────────────────── */}
      {tab === 'active' && (
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && <p style={panelStyles.muted}>Loading…</p>}

        {error && (
          <p style={panelStyles.error}>Could not load alerts — check that the API is running.</p>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>🔔</div>
            <p style={emptyTitleStyle}>No active alerts</p>
            <p style={emptySubStyle}>
              Create an alert to keep track of the market — get notified when price or
              liquidation thresholds are crossed.
            </p>
            <button
              style={emptyCtaStyle}
              onClick={() => setFormOpen(true)}
            >
              + Create your first alert
            </button>
          </div>
        )}

        {!loading && !error && alerts.length > 0 && (
          <table style={panelStyles.table}>
            <thead>
              <tr>
                <th style={panelStyles.th}>Name</th>
                <th style={panelStyles.th}>Symbol</th>
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
                  <td style={panelStyles.td}>{a.symbol.replace('USDT', '')}</td>
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
      )}{/* end active tab */}

      {/* ── Collapsible create form ─────────────────────────────────────────── */}
      <div style={formPanelStyle(formOpen)}>
        <div style={formInnerStyle}>
          <p style={{ ...panelStyles.label, marginBottom: '8px' }}>New alert</p>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              style={inputStyle}
              placeholder="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <select
              style={inputStyle}
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value)}
            >
              <option value="BTCUSDT">BTC</option>
              <option value="ETHUSDT">ETH</option>
              <option value="SOLUSDT">SOL</option>
            </select>
            <select
              style={inputStyle}
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              <option value="price_above">Price above</option>
              <option value="price_below">Price below</option>
              <option value="price_spike_up">Price spike up ↑</option>
              <option value="price_spike_down">Price spike down ↓</option>
              <option value="liquidation_spike">Liquidation spike</option>
              <option value="funding_rate_above">Funding rate above</option>
              <option value="funding_rate_below">Funding rate below</option>
            </select>
            <input
              style={inputStyle}
              placeholder={
                formType === 'liquidation_spike'
                  ? 'Event count threshold'
                  : formType === 'funding_rate_above' || formType === 'funding_rate_below'
                  ? 'Rate threshold % (e.g. 0.05 for 0.05%)'
                  : formType === 'price_spike_up' || formType === 'price_spike_down'
                  ? '% move threshold (e.g. 3 for 3%)'
                  : 'Price threshold (USD)'
              }
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              type="number"
              min="0"
              step="any"
            />
            {(formType === 'liquidation_spike' || formType === 'price_spike_up' || formType === 'price_spike_down') && (
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
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="submit" style={buttonStyle} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create alert'}
              </button>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const headerStyle: CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  borderBottom:  '1px solid #2a2a2e',
  paddingBottom: '8px',
  flexShrink:    0,
};

const toggleBtnStyle = (open: boolean): CSSProperties => ({
  backgroundColor: open ? '#1e1e26' : '#1a2a3a',
  border:          `1px solid ${open ? '#444' : '#3a6a9f'}`,
  borderRadius:    '4px',
  color:           open ? '#777' : '#90b8e0',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      600,
  padding:         '4px 10px',
  transition:      'all 0.15s',
  whiteSpace:      'nowrap',
});

const microBtnStyle: CSSProperties = {
  fontSize:        '10px',
  color:           '#f5a623',
  background:      'none',
  border:          '1px solid #f5a623',
  borderRadius:    '4px',
  cursor:          'pointer',
  padding:         '2px 6px',
};

const emptyStateStyle: CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  textAlign:      'center',
  padding:        '24px 16px',
  gap:            '8px',
  height:         '100%',
};

const emptyIconStyle: CSSProperties = {
  fontSize: '28px',
  opacity:  0.4,
};

const emptyTitleStyle: CSSProperties = {
  color:      '#888',
  fontSize:   '13px',
  fontWeight: 600,
  margin:     0,
};

const emptySubStyle: CSSProperties = {
  color:     '#555',
  fontSize:  '11px',
  maxWidth:  '220px',
  lineHeight: '1.5',
  margin:    0,
};

const emptyCtaStyle: CSSProperties = {
  marginTop:       '4px',
  backgroundColor: '#1a2a3a',
  border:          '1px solid #3a6a9f',
  borderRadius:    '4px',
  color:           '#90b8e0',
  cursor:          'pointer',
  fontSize:        '11px',
  fontWeight:      600,
  padding:         '5px 14px',
};

const formPanelStyle = (open: boolean): CSSProperties => ({
  maxHeight:    open ? '420px' : '0',
  overflow:     'hidden',
  transition:   'max-height 0.25s ease',
  flexShrink:   0,
});

const formInnerStyle: CSSProperties = {
  borderTop:  '1px solid #2a2a2e',
  paddingTop: '10px',
};

const inputStyle: CSSProperties = {
  backgroundColor: '#111114',
  border:          '1px solid #2a2a2e',
  borderRadius:    '4px',
  padding:         '6px 8px',
  color:           '#d0d0d0',
  fontSize:        '12px',
  width:           '100%',
  boxSizing:       'border-box',
};

const deleteButtonStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #555',
  borderRadius:    '4px',
  padding:         '2px 7px',
  color:           '#f44336',
  fontSize:        '14px',
  cursor:          'pointer',
  lineHeight:      1,
};

const buttonStyle: CSSProperties = {
  backgroundColor: '#2a4a7f',
  border:          'none',
  borderRadius:    '4px',
  padding:         '7px 12px',
  color:           '#d0d0d0',
  fontSize:        '12px',
  cursor:          'pointer',
};

const cancelBtnStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border:          '1px solid #333',
  borderRadius:    '4px',
  padding:         '7px 12px',
  color:           '#666',
  fontSize:        '12px',
  cursor:          'pointer',
};

const historyRowStyle: CSSProperties = {
  display:      'flex',
  alignItems:   'flex-start',
  gap:          '8px',
  padding:      '5px 6px',
  borderRadius: '4px',
  background:   '#111114',
  border:       '1px solid #1e1e22',
};

const historyBadgeStyle = (eventType: string): CSSProperties => ({
  fontSize:        '9px',
  fontWeight:      700,
  letterSpacing:   '0.06em',
  padding:         '1px 5px',
  borderRadius:    '3px',
  flexShrink:      0,
  backgroundColor: eventType === 'alert_triggered' ? '#f4433618' : '#2a2a2e',
  color:           eventType === 'alert_triggered' ? '#f44336'   : '#666',
  border:          `1px solid ${eventType === 'alert_triggered' ? '#f4433633' : '#2a2a2e'}`,
  alignSelf:       'center',
});

export default AlertsPanel;
