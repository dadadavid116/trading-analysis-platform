import { useState, useEffect, CSSProperties } from 'react';
import {
  fetchFundingRate, fetchOpenInterest, fetchLSRatio,
  FundingRateData, OpenInterestData, LSRatioData,
} from '../api';
import { panelStyles } from './panelStyles';

/**
 * DerivativesPanel — compact three-cell display for BTC/USDT perpetual context.
 *
 * Cells:
 *   Funding Rate — last settled rate, mark/index premium, sentiment
 *   Open Interest — current OI in BTC, 1H/4H deltas, expansion/contraction trend
 *   L/S Ratio — top-trader long vs short %, global account ratio
 *
 * Polls all three endpoints every 60 s. On 404 (collector not started yet)
 * shows a "waiting for data" placeholder rather than an error.
 */
function DerivativesPanel() {
  const [funding, setFunding] = useState<FundingRateData | null>(null);
  const [oi, setOI]           = useState<OpenInterestData | null>(null);
  const [ls, setLS]           = useState<LSRatioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([fetchFundingRate(), fetchOpenInterest(), fetchLSRatio()])
        .then(([f, o, l]) => {
          setFunding(f);
          setOI(o);
          setLS(l);
          setLoading(false);
          setUpdatedAt(new Date());
        })
        .catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const fmtRate = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
  const fmtOI   = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K BTC` : `${v.toFixed(0)} BTC`;
  const fmtDelta = (d: number | null) => d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;

  const sentimentColor = (s: string) =>
    s === 'bullish' ? '#66bb6a' : s === 'bearish' ? '#ef5350' : '#aaa';

  const trendColor = (t: string) =>
    t === 'expanding' ? '#66bb6a' : t === 'contracting' ? '#ef5350' : '#aaa';

  const noData = !funding && !oi && !ls;

  return (
    <div style={panelStyles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Derivatives — BTC/USDT
        </h2>
        {updatedAt && (
          <span style={{ fontSize: '9px', color: '#444' }}>
            {updatedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      {loading && <p style={panelStyles.muted}>Loading…</p>}

      {!loading && noData && (
        <p style={{ ...panelStyles.muted, fontSize: '11px', lineHeight: 1.5 }}>
          Waiting for data — the derivatives collector polls every 5–30 min.
          Data appears after the first successful poll.
        </p>
      )}

      {!loading && !noData && (
        <div style={gridStyle}>

          {/* Funding Rate */}
          <div style={cellStyle}>
            <span style={cellLabelStyle}>FUNDING RATE</span>
            {funding ? (
              <>
                <span style={{ ...cellValueStyle, color: funding.funding_rate > 0 ? '#ef5350' : funding.funding_rate < 0 ? '#66bb6a' : '#aaa' }}>
                  {fmtRate(funding.funding_rate)}
                </span>
                <span style={{ ...cellSubStyle, color: sentimentColor(funding.sentiment) }}>
                  {funding.sentiment.charAt(0).toUpperCase() + funding.sentiment.slice(1)}
                </span>
                {funding.mark_price && funding.index_price && (
                  <span style={cellSubStyle}>
                    Premium {funding.premium_pct >= 0 ? '+' : ''}{funding.premium_pct.toFixed(4)}%
                  </span>
                )}
              </>
            ) : (
              <span style={cellSubStyle}>No data yet</span>
            )}
          </div>

          {/* Open Interest */}
          <div style={cellStyle}>
            <span style={cellLabelStyle}>OPEN INTEREST</span>
            {oi ? (
              <>
                <span style={cellValueStyle}>{fmtOI(oi.oi_value)}</span>
                <span style={{ ...cellSubStyle, color: trendColor(oi.trend) }}>
                  {oi.trend.charAt(0).toUpperCase() + oi.trend.slice(1)}
                </span>
                <span style={cellSubStyle}>Δ1H: {fmtDelta(oi.delta_1h)}</span>
                {oi.delta_4h !== null && (
                  <span style={cellSubStyle}>Δ4H: {fmtDelta(oi.delta_4h)}</span>
                )}
              </>
            ) : (
              <span style={cellSubStyle}>No data yet</span>
            )}
          </div>

          {/* L/S Ratio */}
          <div style={cellStyle}>
            <span style={cellLabelStyle}>L/S RATIO</span>
            {ls?.top_account ? (
              <>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                  <span style={{ ...cellValueStyle, color: '#66bb6a' }}>{ls.top_account.long_pct.toFixed(1)}%</span>
                  <span style={{ fontSize: '9px', color: '#555' }}>L</span>
                  <span style={{ ...cellValueStyle, color: '#ef5350' }}>{ls.top_account.short_pct.toFixed(1)}%</span>
                  <span style={{ fontSize: '9px', color: '#555' }}>S</span>
                </div>
                <div style={lsBarTrackStyle}>
                  <div style={{ width: `${ls.top_account.long_pct}%`, height: '100%', backgroundColor: '#4caf50' }} />
                  <div style={{ width: `${ls.top_account.short_pct}%`, height: '100%', backgroundColor: '#f44336' }} />
                </div>
                <span style={cellSubStyle}>Top traders</span>
                {ls.global_account && (
                  <span style={cellSubStyle}>
                    Global: {ls.global_account.long_pct.toFixed(1)}% / {ls.global_account.short_pct.toFixed(1)}%
                  </span>
                )}
              </>
            ) : (
              <span style={cellSubStyle}>No data yet</span>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default DerivativesPanel;

// ── Styles ────────────────────────────────────────────────────────────────────

const gridStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  flex: 1,
};

const cellStyle: CSSProperties = {
  flex: 1,
  backgroundColor: '#111114',
  border: '1px solid #2a2a2e',
  borderRadius: '6px',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
};

const cellLabelStyle: CSSProperties = {
  fontSize: '8px',
  fontWeight: 700,
  color: '#555',
  letterSpacing: '0.08em',
  marginBottom: '2px',
};

const cellValueStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#d0d0d0',
  lineHeight: 1.2,
};

const cellSubStyle: CSSProperties = {
  fontSize: '10px',
  color: '#777',
  lineHeight: 1.3,
};

const lsBarTrackStyle: CSSProperties = {
  display: 'flex',
  height: '4px',
  borderRadius: '2px',
  overflow: 'hidden',
  backgroundColor: '#222',
  margin: '2px 0',
};
