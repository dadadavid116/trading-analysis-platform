import { useState, useEffect } from 'react';
import { fetchLatestAnalysis, AnalysisSummary } from '../api';
import { panelStyles } from './panelStyles';

/**
 * AnalysisPanel — displays the most recent AI-generated market summary.
 *
 * AI analysis is now on-demand only — the automatic 10-minute worker has been
 * disabled. Summaries are generated when the user explicitly requests one via
 * the Chat panel (e.g. "give me a market analysis").
 *
 * This panel fetches once on mount and shows whatever is already stored.
 * It does not poll — there is nothing to poll for until the user triggers one.
 */
function AnalysisPanel() {
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLatestAnalysis()
      .then((data) => {
        setSummary(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={panelStyles.card}>
      <h2 style={panelStyles.title}>AI Analysis — BTC/USDT</h2>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {error && (
        <p style={panelStyles.error}>
          Could not load analysis — check that the API is running.
        </p>
      )}

      {!loading && !error && !summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={panelStyles.muted}>
            No analysis generated yet.
          </p>
          <p style={{ ...panelStyles.value, lineHeight: '1.6', fontSize: '12px' }}>
            AI analysis is on-demand. Use the <strong style={{ color: '#90b8e0' }}>Chat panel</strong> to
            request it — for example:
          </p>
          <div style={{
            backgroundColor: '#111118',
            border: '1px solid #2a2a3e',
            borderRadius: '6px',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}>
            {[
              '"Give me a BTC market analysis"',
              '"What does the current price action suggest?"',
              '"Summarise recent liquidation activity"',
            ].map((example, i) => (
              <span key={i} style={{ color: '#6a9fd8', fontSize: '11px', fontStyle: 'italic' }}>
                {example}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ ...panelStyles.value, lineHeight: '1.6' }}>
            {summary.summary_text}
          </p>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Generated</span>
            <span style={panelStyles.value}>
              {new Date(summary.generated_at).toLocaleTimeString()}
            </span>
          </div>
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Model</span>
            <span style={panelStyles.value}>{summary.model_used}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisPanel;
