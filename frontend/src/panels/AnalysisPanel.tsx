import { useState, useEffect } from 'react';
import { fetchLatestAnalysis, AnalysisSummary } from '../api';
import { panelStyles } from './panelStyles';

/**
 * AnalysisPanel — displays the latest AI-generated BTC market summary.
 *
 * Data source: Claude API via the analysis worker (Phase 7).
 * The worker generates a new summary every ANALYSIS_INTERVAL_MINUTES (default: 10 min).
 * This panel polls the API every 60 seconds to pick up new summaries automatically.
 *
 * If no summary is available yet (worker hasn't run), a friendly message is shown.
 */
function AnalysisPanel() {
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [notReady, setNotReady] = useState(false);  // true = 404, worker not run yet
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetchLatestAnalysis()
        .then((data) => {
          setSummary(data);           // data is null if worker hasn't run yet
          setNotReady(data === null);
          setError(null);
          setLoading(false);
        })
        .catch((err: Error) => {
          setError(err.message);
          setLoading(false);
        });
    };

    fetchData();
    // Poll every 60 s — summaries are generated every ~10 min so this is plenty.
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
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

      {!loading && !error && notReady && (
        <p style={panelStyles.muted}>
          No summary available yet. The analysis worker generates summaries every
          ~10 minutes — check back shortly after the stack starts.
        </p>
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
