import { useState, useEffect, CSSProperties } from 'react';
import { fetchNewsFeed, NewsItem } from '../api';
import { panelStyles } from './panelStyles';

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sourceBadge(source: string): string {
  if (source === 'CoinTelegraph') return '#f97316';
  if (source === 'CoinDesk')      return '#3b82f6';
  return '#555';
}

export default function NewsPanel() {
  const [items,     setItems]     = useState<NewsItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = () => {
    fetchNewsFeed(40)
      .then((data) => {
        setItems(data);
        setLoading(false);
        setError(null);
        setUpdatedAt(new Date());
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 300_000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  return (
    <div style={panelStyles.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px', flexShrink: 0 }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Crypto News
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {updatedAt && (
            <span style={{ fontSize: '9px', color: '#444' }}>{updatedAt.toLocaleTimeString()}</span>
          )}
          <button onClick={load} style={refreshBtnStyle}>↻</button>
        </div>
      </div>

      {loading && <p style={panelStyles.muted}>Loading news…</p>}
      {error   && <p style={{ ...panelStyles.muted, color: '#ef5350' }}>Failed to load: {error}</p>}

      {!loading && !error && (
        <div style={listStyle}>
          {items.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={cardStyle}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161619')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {/* Meta row */}
              <div style={metaRowStyle}>
                <span style={{ ...badgeStyle, backgroundColor: sourceBadge(item.source) }}>
                  {item.source}
                </span>
                <span style={timeStyle}>{timeAgo(item.published)}</span>
              </div>

              {/* Title */}
              <div style={titleStyle}>{item.title}</div>

              {/* Summary */}
              {item.summary && (
                <div style={summaryStyle}>{item.summary}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const listStyle: CSSProperties = {
  overflowY:  'auto',
  flex:       1,
  marginTop:  '6px',
};

const cardStyle: CSSProperties = {
  display:         'block',
  padding:         '10px 8px',
  borderBottom:    '1px solid #1a1a1e',
  textDecoration:  'none',
  cursor:          'pointer',
  transition:      'background-color 0.1s',
  backgroundColor: 'transparent',
  borderRadius:    '3px',
};

const metaRowStyle: CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  gap:           '6px',
  marginBottom:  '4px',
};

const badgeStyle: CSSProperties = {
  fontSize:     '8px',
  fontWeight:   700,
  color:        '#fff',
  padding:      '1px 5px',
  borderRadius: '3px',
  letterSpacing: '0.04em',
};

const timeStyle: CSSProperties = {
  fontSize: '9px',
  color:    '#555',
};

const titleStyle: CSSProperties = {
  fontSize:   '12px',
  fontWeight: 600,
  color:      '#c8c8c8',
  lineHeight: 1.4,
  marginBottom: '3px',
};

const summaryStyle: CSSProperties = {
  fontSize:   '10px',
  color:      '#555',
  lineHeight: 1.4,
  display:    '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow:   'hidden',
};

const refreshBtnStyle: CSSProperties = {
  background:   'transparent',
  border:       '1px solid #2a2a2e',
  borderRadius: '4px',
  color:        '#555',
  cursor:       'pointer',
  fontSize:     '12px',
  padding:      '2px 6px',
  lineHeight:   1,
};
