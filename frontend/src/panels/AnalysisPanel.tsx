import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { fetchAnalysisHistory, AnalysisSummary } from '../api';
import { panelStyles } from './panelStyles';

/**
 * AnalysisPanel — displays the last 5 AI-generated market summaries.
 *
 * Each card shows the timestamp, model badge, an expandable summary text,
 * and a copy button. A refresh button re-fetches on demand.
 *
 * Summaries are generated on-demand via the ChatPanel (e.g. "give me a market
 * analysis") or by the scheduled analysis worker if it is running.
 */
function AnalysisPanel() {
  const [summaries, setSummaries] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<Set<number>>(new Set([0])); // first card open by default
  const [copied, setCopied]       = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchAnalysisHistory(5)
      .then((data) => { setSummaries(data); setError(null); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpanded = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const modelBadge = (model: string): { label: string; color: string } => {
    if (model.toLowerCase().includes('claude'))
      return { label: 'Claude', color: '#7c5cbf' };
    if (model.toLowerCase().includes('gpt') || model.toLowerCase().includes('openai'))
      return { label: 'GPT', color: '#1a7f4b' };
    return { label: model, color: '#555' };
  };

  return (
    <div style={panelStyles.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Scheduled Market Summary
        </h2>
        <button
          onClick={load}
          disabled={loading}
          style={refreshBtnStyle}
          title="Refresh summaries"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Scrollable summary list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
        {error && (
          <p style={panelStyles.error}>Could not load — check that the API is running.</p>
        )}

        {!loading && !error && summaries.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={panelStyles.muted}>No analysis generated yet.</p>
            <p style={{ ...panelStyles.value, lineHeight: '1.6', fontSize: '12px' }}>
              Use the <strong style={{ color: '#90b8e0' }}>Chat panel</strong> to generate one:
            </p>
            <div style={exampleBoxStyle}>
              {[
                '"Give me a BTC market analysis"',
                '"What does the current price action suggest?"',
                '"Summarise recent liquidation activity"',
              ].map((ex, i) => (
                <span key={i} style={{ color: '#6a9fd8', fontSize: '11px', fontStyle: 'italic' }}>{ex}</span>
              ))}
            </div>
          </div>
        )}

        {summaries.map((s, idx) => {
          const open  = expanded.has(idx);
          const badge = modelBadge(s.model_used);
          const preview = s.summary_text.slice(0, 120) + (s.summary_text.length > 120 ? '…' : '');

          return (
            <div key={s.id} style={cardStyle}>
              {/* Card header */}
              <div
                style={cardHeaderStyle}
                onClick={() => toggleExpanded(idx)}
                title={open ? 'Collapse' : 'Expand'}
              >
                <span style={{ fontSize: '10px', color: '#999' }}>
                  {new Date(s.generated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ ...badgeStyle, backgroundColor: badge.color }}>{badge.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                  <button
                    style={iconBtnStyle}
                    title="Copy summary"
                    onClick={(e) => { e.stopPropagation(); handleCopy(s.summary_text, idx); }}
                  >
                    {copied === idx ? '✓' : '⎘'}
                  </button>
                  <span style={{ fontSize: '10px', color: '#555' }}>{open ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Card body */}
              <div style={{ fontSize: '11px', color: '#c0c0c0', lineHeight: '1.6', padding: '6px 8px' }}>
                {open ? s.summary_text : preview}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnalysisPanel;

// ── Styles ────────────────────────────────────────────────────────────────────

const refreshBtnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid #2a2a2e',
  borderRadius: '4px',
  color: '#888',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '2px 8px',
  lineHeight: 1,
};

const exampleBoxStyle: CSSProperties = {
  backgroundColor: '#111118',
  border: '1px solid #2a2a3e',
  borderRadius: '6px',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
};

const cardStyle: CSSProperties = {
  border: '1px solid #2a2a2e',
  borderRadius: '6px',
  overflow: 'hidden',
  flexShrink: 0,
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '5px 8px',
  backgroundColor: '#16161a',
  cursor: 'pointer',
  userSelect: 'none',
};

const badgeStyle: CSSProperties = {
  fontSize: '9px',
  fontWeight: 600,
  padding: '1px 5px',
  borderRadius: '3px',
  color: '#fff',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const iconBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '12px',
  padding: '1px 3px',
  lineHeight: 1,
};
