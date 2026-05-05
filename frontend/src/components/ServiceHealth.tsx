import { useState, useEffect, CSSProperties } from 'react';
import { fetchServiceHealth, ServiceStatus } from '../api';

const STATUS_COLOR: Record<ServiceStatus, string> = {
  ok:    '#66bb6a',
  stale: '#f5a623',
  dead:  '#f44336',
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok:    'ok',
  stale: 'stale',
  dead:  'dead',
};

const SERVICE_LABEL: Record<string, string> = {
  price:        'Price',
  liquidations: 'Liq',
  orderbook:    'OB',
};

/**
 * ServiceHealth — compact header indicator showing live-data collector status.
 *
 * Each dot represents one collector. Color convention:
 *   green  — data arrived < 2 min ago
 *   orange — data is 2–10 min old (stale)
 *   red    — no data for > 10 min (or no rows at all)
 *   grey   — still loading or endpoint unreachable
 *
 * Polls every 30 s.
 */
function ServiceHealth() {
  const [services, setServices] = useState<Record<string, { last_seen: string | null; status: ServiceStatus }>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () => {
      fetchServiceHealth()
        .then((data) => { setServices(data.services); setError(false); })
        .catch(() => setError(true));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div style={styles.container} title="Health endpoint unreachable">
        <span style={{ ...styles.dot, backgroundColor: '#555' }} />
        <span style={styles.label}>API</span>
      </div>
    );
  }

  const entries = Object.entries(services);
  if (entries.length === 0) return null;

  return (
    <div style={styles.container}>
      {entries.map(([key, info]) => {
        const color = STATUS_COLOR[info.status] ?? '#555';
        const tooltip = info.last_seen
          ? `${SERVICE_LABEL[key] ?? key}: ${info.status} — last seen ${new Date(info.last_seen).toLocaleTimeString()}`
          : `${SERVICE_LABEL[key] ?? key}: no data`;
        return (
          <div key={key} style={styles.item} title={tooltip}>
            <span style={{ ...styles.dot, backgroundColor: color }} />
            <span style={{ ...styles.label, color }}>{SERVICE_LABEL[key] ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ServiceHealth;

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginLeft: '4px',
  } as CSSProperties,

  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as CSSProperties,

  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  } as CSSProperties,

  label: {
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.02em',
  } as CSSProperties,
};
