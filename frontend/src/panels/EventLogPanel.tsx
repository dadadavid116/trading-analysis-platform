import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fetchEvents } from '../api';
import type { EventLogEntry } from '../api';

const SERVICE_COLORS: Record<string, string> = {
  price:        '#4a9eff',
  liquidations: '#ff6b35',
  orderbook:    '#7c6aff',
  derivatives:  '#f0a500',
  analysis:     '#4caf7d',
  alert:        '#ff4d4f',
  system:       '#888',
};

function serviceColor(service: string): string {
  return SERVICE_COLORS[service] ?? '#aaa';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function EventRow({ entry }: { entry: EventLogEntry }) {
  const color = serviceColor(entry.service);
  return (
    <div style={rowStyle}>
      <span style={timeStyle}>{formatTime(entry.timestamp)}</span>
      <span style={{ ...tagStyle, color, borderColor: color + '44' }}>
        {entry.service}
      </span>
      <span style={{ ...tagStyle, color: '#aaa', borderColor: '#333', fontSize: '10px' }}>
        {entry.event_type}
      </span>
      {entry.symbol && (
        <span style={{ ...tagStyle, color: '#7c6aff', borderColor: '#7c6aff44', fontSize: '10px' }}>
          {entry.symbol}
        </span>
      )}
      <span style={msgStyle}>{entry.message}</span>
    </div>
  );
}

export default function EventLogPanel() {
  const [entries, setEntries] = useState<EventLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const maxIdRef = useRef(0);

  // Scroll to bottom whenever new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  useEffect(() => {
    let polling = false;
    let pollTimer: ReturnType<typeof setInterval>;

    // Initial load
    fetchEvents(100, 0)
      .then((initial) => {
        setEntries(initial);
        if (initial.length > 0) {
          maxIdRef.current = Math.max(...initial.map((e) => e.id));
        }
      })
      .catch((err) => setError(String(err)));

    // Try SSE first
    const es = new EventSource('/api/events/stream');
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.addEventListener('event', (e: MessageEvent) => {
      try {
        const entry: EventLogEntry = JSON.parse(e.data);
        setEntries((prev) => {
          if (prev.some((p) => p.id === entry.id)) return prev;
          const next = [...prev, entry];
          return next.length > 300 ? next.slice(next.length - 300) : next;
        });
        maxIdRef.current = Math.max(maxIdRef.current, entry.id);
      } catch { /* ignore bad frames */ }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Fall back to polling every 5s
      if (!polling) {
        polling = true;
        pollTimer = setInterval(async () => {
          try {
            const fresh = await fetchEvents(50, maxIdRef.current);
            if (fresh.length > 0) {
              maxIdRef.current = Math.max(...fresh.map((e) => e.id));
              setEntries((prev) => {
                const combined = [...prev, ...fresh];
                return combined.length > 300 ? combined.slice(combined.length - 300) : combined;
              });
            }
          } catch { /* ignore */ }
        }, 5000);
      }
    };

    return () => {
      es.close();
      clearInterval(pollTimer);
    };
  }, []);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Event Log</span>
        <span style={dotStyle(connected)} title={connected ? 'SSE connected' : 'polling'} />
        <span style={{ color: '#555', fontSize: '11px', marginLeft: '4px' }}>
          {connected ? 'live' : 'polling'}
        </span>
        <span style={{ marginLeft: 'auto', color: '#555', fontSize: '11px' }}>
          {entries.length} events
        </span>
      </div>

      <div style={terminalStyle}>
        {error && <div style={errorStyle}>{error}</div>}
        {entries.length === 0 && !error && (
          <div style={{ color: '#444', fontStyle: 'italic', padding: '8px 0' }}>
            Waiting for events…
          </div>
        )}
        {entries.map((entry) => (
          <EventRow key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  height:        '100%',
  backgroundColor: '#0d0d10',
  overflow:      'hidden',
};

const headerStyle: CSSProperties = {
  display:         'flex',
  alignItems:      'center',
  gap:             '6px',
  padding:         '8px 14px',
  borderBottom:    '1px solid #1e1e22',
  backgroundColor: '#111115',
  flexShrink:      0,
};

const titleStyle: CSSProperties = {
  fontSize:   '12px',
  fontWeight: 600,
  color:      '#ccc',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const dotStyle = (on: boolean): CSSProperties => ({
  width:           '7px',
  height:          '7px',
  borderRadius:    '50%',
  backgroundColor: on ? '#4caf7d' : '#555',
  flexShrink:      0,
  boxShadow:       on ? '0 0 4px #4caf7d' : 'none',
});

const terminalStyle: CSSProperties = {
  flex:       1,
  overflow:   'auto',
  padding:    '8px 14px',
  fontFamily: '"Fira Mono", "Consolas", "Courier New", monospace',
  fontSize:   '12px',
  lineHeight: '1.7',
};

const rowStyle: CSSProperties = {
  display:    'flex',
  flexWrap:   'wrap',
  gap:        '5px',
  alignItems: 'baseline',
  borderBottom: '1px solid #15151a',
  padding:    '2px 0',
};

const timeStyle: CSSProperties = {
  color:      '#444',
  fontSize:   '11px',
  flexShrink: 0,
  minWidth:   '68px',
};

const tagStyle: CSSProperties = {
  fontSize:     '10px',
  fontWeight:   600,
  padding:      '1px 5px',
  borderRadius: '3px',
  border:       '1px solid',
  flexShrink:   0,
  letterSpacing: '0.3px',
};

const msgStyle: CSSProperties = {
  color:    '#c0c0c0',
  flex:     1,
  minWidth: '0',
  wordBreak: 'break-word',
};

const errorStyle: CSSProperties = {
  color:     '#ff4d4f',
  padding:   '4px 0',
  fontSize:  '11px',
};
