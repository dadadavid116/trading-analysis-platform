import { useState, useEffect, CSSProperties } from 'react';
import {
  fetchFundingRate, fetchOpenInterest, fetchLSRatio,
  fetchFundingHistory, fetchOIHistory,
  fetchFearGreed,
  FundingRateData, OpenInterestData, LSRatioData,
  FundingHistoryPoint, OIHistoryPoint,
  FearGreedData,
} from '../api';
import { panelStyles } from './panelStyles';

/**
 * DerivativesPanel — compact three-cell display for BTC/USDT perpetual context.
 *
 * Cells:
 *   Funding Rate — latest rate, sentiment, 24H sparkline
 *   Open Interest — current OI, 1H/4H deltas, 24H sparkline
 *   L/S Ratio — top-trader long vs short %, global account ratio
 *
 * Polls latest values every 60 s; history (sparklines) refreshed every 5 min.
 */
interface DerivativesPanelProps { symbol?: string; }

// ── Sparkline ──────────────────────────────────────────────────────────────────

interface SparklineProps {
  values:    number[];
  color:     string;
  height?:   number;
  zeroLine?: boolean;   // draw a dashed zero reference line
}

function Sparkline({ values, color, height = 32, zeroLine = false }: SparklineProps) {
  if (values.length < 2) return null;
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || Math.abs(max) * 0.02 || 1e-8;
  const W     = 100;

  const toY = (v: number) => height - ((v - min) / range) * (height - 2) - 1;

  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(2)},${toY(v).toFixed(2)}`)
    .join(' ');

  const zeroY = toY(0);
  const showZero = zeroLine && zeroY >= 0 && zeroY <= height;

  // Shade area under/over zero for funding sparklines
  const lastVal  = values[values.length - 1];
  const fillColor = lastVal > 0 ? '#ef535018' : lastVal < 0 ? '#26a69a18' : 'none';

  const areaPoints = zeroLine
    ? `0,${toY(0).toFixed(2)} ` + points + ` ${W},${toY(0).toFixed(2)}`
    : `0,${height} ` + points + ` ${W},${height}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', marginTop: '4px', overflow: 'visible' }}
    >
      {/* shaded area */}
      <polygon points={areaPoints} fill={zeroLine ? fillColor : `${color}18`} />
      {/* zero reference line */}
      {showZero && (
        <line
          x1="0" y1={zeroY.toFixed(2)}
          x2={W}  y2={zeroY.toFixed(2)}
          stroke="#444" strokeWidth="0.5" strokeDasharray="2,2"
        />
      )}
      {/* main sparkline */}
      <polyline fill="none" stroke={color} strokeWidth="1.2" points={points} />
      {/* end-dot */}
      <circle
        cx={W}
        cy={toY(lastVal).toFixed(2)}
        r="1.5"
        fill={color}
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

function DerivativesPanel({ symbol = 'BTCUSDT' }: DerivativesPanelProps) {
  const [funding,   setFunding]   = useState<FundingRateData | null>(null);
  const [oi,        setOI]        = useState<OpenInterestData | null>(null);
  const [ls,        setLS]        = useState<LSRatioData | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [fundingHistory, setFundingHistory] = useState<FundingHistoryPoint[]>([]);
  const [oiHistory, setOIHistory]           = useState<OIHistoryPoint[]>([]);

  // Latest values — every 60 s
  useEffect(() => {
    const load = () => {
      Promise.all([fetchFundingRate(symbol), fetchOpenInterest(symbol), fetchLSRatio(symbol)])
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
  }, [symbol]);

  // History for sparklines — every 5 min
  useEffect(() => {
    const loadHistory = () => {
      fetchFundingHistory(symbol, 24).then(setFundingHistory).catch(() => {});
      fetchOIHistory(symbol, 24).then(setOIHistory).catch(() => {});
      fetchFearGreed().then(setFearGreed).catch(() => {});
    };
    loadHistory();
    const id = setInterval(loadHistory, 300_000);
    return () => clearInterval(id);
  }, [symbol]);

  const fmtRate  = (r: number) => `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
  const fmtOI    = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v.toFixed(0)}`;
  const fmtDelta = (d: number | null) => d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;

  const sentimentColor = (s: string) =>
    s === 'bullish' ? '#66bb6a' : s === 'bearish' ? '#ef5350' : '#aaa';

  const trendColor = (t: string) =>
    t === 'expanding' ? '#66bb6a' : t === 'contracting' ? '#ef5350' : '#aaa';

  const fundingSparkValues  = fundingHistory.map((p) => p.funding_rate);
  const oiSparkValues       = oiHistory.map((p) => p.oi_value);

  const noData = !funding && !oi && !ls;

  return (
    <div style={panelStyles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2a2e', paddingBottom: '8px' }}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Derivatives — {symbol.replace('USDT', '')}/USDT
        </h2>
        {updatedAt && (
          <span style={{ fontSize: '9px', color: '#444' }}>
            {updatedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={cellLabelStyle}>FUNDING RATE</span>
              {fundingHistory.length > 1 && (
                <span style={{ fontSize: '8px', color: '#444' }}>24H</span>
              )}
            </div>
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
                    Prem {funding.premium_pct >= 0 ? '+' : ''}{funding.premium_pct.toFixed(4)}%
                  </span>
                )}
                {fundingSparkValues.length > 1 && (
                  <Sparkline
                    values={fundingSparkValues}
                    color={funding.funding_rate >= 0 ? '#ef5350' : '#26a69a'}
                    zeroLine
                  />
                )}
              </>
            ) : (
              <span style={cellSubStyle}>No data yet</span>
            )}
          </div>

          {/* Open Interest */}
          <div style={cellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={cellLabelStyle}>OPEN INTEREST</span>
              {oiHistory.length > 1 && (
                <span style={{ fontSize: '8px', color: '#444' }}>24H</span>
              )}
            </div>
            {oi ? (
              <>
                <span style={cellValueStyle}>{fmtOI(oi.oi_value)} BTC</span>
                <span style={{ ...cellSubStyle, color: trendColor(oi.trend) }}>
                  {oi.trend.charAt(0).toUpperCase() + oi.trend.slice(1)}
                </span>
                <span style={cellSubStyle}>Δ1H: {fmtDelta(oi.delta_1h)}</span>
                {oi.delta_4h !== null && (
                  <span style={cellSubStyle}>Δ4H: {fmtDelta(oi.delta_4h)}</span>
                )}
                {oiSparkValues.length > 1 && (
                  <Sparkline
                    values={oiSparkValues}
                    color={oi.trend === 'expanding' ? '#66bb6a' : oi.trend === 'contracting' ? '#ef5350' : '#4a8aff'}
                  />
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
                  <>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#66bb6a' }}>{ls.global_account.long_pct.toFixed(1)}%</span>
                      <span style={{ fontSize: '9px', color: '#555' }}>L</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef5350' }}>{ls.global_account.short_pct.toFixed(1)}%</span>
                      <span style={{ fontSize: '9px', color: '#555' }}>S</span>
                    </div>
                    <div style={lsBarTrackStyle}>
                      <div style={{ width: `${ls.global_account.long_pct}%`, height: '100%', backgroundColor: '#4caf5088' }} />
                      <div style={{ width: `${ls.global_account.short_pct}%`, height: '100%', backgroundColor: '#f4433688' }} />
                    </div>
                    <span style={cellSubStyle}>Global</span>
                  </>
                )}
              </>
            ) : (
              <span style={cellSubStyle}>No data yet</span>
            )}
          </div>

        </div>
      )}

      {/* Fear & Greed Index */}
      {fearGreed && (
        <div style={fgRowStyle}>
          <span style={cellLabelStyle}>FEAR &amp; GREED INDEX</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            {/* gauge track */}
            <div style={fgTrackStyle}>
              <div style={fgGradientStyle} />
              <div style={{ ...fgNeedleStyle, left: `${fearGreed.value}%` }} />
            </div>
            <span style={{ ...cellValueStyle, color: fgColor(fearGreed.value), minWidth: '32px' }}>
              {fearGreed.value}
            </span>
            <span style={{ ...cellSubStyle, color: fgColor(fearGreed.value), fontWeight: 700 }}>
              {fearGreed.label}
            </span>
          </div>
        </div>
      )}

      </div>{/* end scrollable body */}
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

function fgColor(v: number): string {
  if (v <= 25) return '#ef5350';
  if (v <= 45) return '#ff9800';
  if (v <= 55) return '#aaa';
  if (v <= 75) return '#66bb6a';
  return '#26c6da';
}

const fgRowStyle: CSSProperties = {
  backgroundColor: '#111114',
  border:          '1px solid #2a2a2e',
  borderRadius:    '6px',
  padding:         '8px 10px',
  marginTop:       '6px',
};

const fgTrackStyle: CSSProperties = {
  flex:         1,
  position:     'relative',
  height:       '8px',
  borderRadius: '4px',
  overflow:     'visible',
  minWidth:     0,
};

const fgGradientStyle: CSSProperties = {
  position:     'absolute',
  inset:        0,
  borderRadius: '4px',
  background:   'linear-gradient(to right, #ef5350, #ff9800, #aaa, #66bb6a, #26c6da)',
};

const fgNeedleStyle: CSSProperties = {
  position:        'absolute',
  top:             '-3px',
  transform:       'translateX(-50%)',
  width:           '3px',
  height:          '14px',
  borderRadius:    '1.5px',
  backgroundColor: '#fff',
  boxShadow:       '0 0 4px rgba(0,0,0,0.8)',
};
