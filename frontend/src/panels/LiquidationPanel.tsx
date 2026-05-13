import { useState, useEffect, CSSProperties } from 'react';
import {
  fetchLiquidationHeatmap,
  fetchLiquidationStats,
  fetchLatestPrice,
} from '../api';
import type { LiquidationHeatmapData, LiquidationStats } from '../api';
import LiquidationHeatmap, { HeatMode } from './LiquidationHeatmap';
import { panelStyles } from './panelStyles';

interface LiquidationPanelProps { symbol?: string; }

const TIME_OPTIONS = [6, 24, 72] as const;
type Hours = typeof TIME_OPTIONS[number];

const MODE_OPTIONS: { id: HeatMode; label: string }[] = [
  { id: 'total', label: 'All'    },
  { id: 'long',  label: 'Longs'  },
  { id: 'short', label: 'Shorts' },
];

function LiquidationPanel({ symbol = 'BTCUSDT' }: LiquidationPanelProps) {
  const [heatmap,      setHeatmap]      = useState<LiquidationHeatmapData | null>(null);
  const [stats,        setStats]        = useState<LiquidationStats | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | undefined>(undefined);
  const [hours,        setHours]        = useState<Hours>(24);
  const [mode,         setMode]         = useState<HeatMode>('total');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const run = () => {
      Promise.all([
        fetchLiquidationHeatmap(symbol, hours),
        fetchLiquidationStats(symbol),
        fetchLatestPrice(symbol).catch(() => null),
      ]).then(([hm, st, price]) => {
        setHeatmap(hm);
        setStats(st);
        if (price) setCurrentPrice(price.close);
        setError(null);
        setLoading(false);
      }).catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
    };
    run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [symbol, hours]);

  const fmtUsd = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  const baseAsset = symbol.replace('USDT', '');

  return (
    <div style={panelStyles.card}>

      {/* ── Header ── */}
      <div style={headerStyle}>
        <span style={titleStyle}>
          Liq Heatmap — {baseAsset}/USDT
        </span>

        <div style={{ display: 'flex', gap: '3px', marginLeft: 'auto', alignItems: 'center' }}>
          {/* Time range */}
          {TIME_OPTIONS.map((h) => (
            <button key={h} style={chipStyle(h === hours)} onClick={() => setHours(h)}>
              {h}H
            </button>
          ))}

          <div style={dividerStyle} />

          {/* Mode */}
          {MODE_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              style={modeChipStyle(id === mode, id)}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Heatmap ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && (
          <div style={overlayStyle}>
            <span style={{ color: '#555', fontSize: '12px' }}>Loading…</span>
          </div>
        )}
        {!loading && error && (
          <div style={overlayStyle}>
            <span style={{ color: '#f44', fontSize: '12px' }}>Could not load liquidation data</span>
          </div>
        )}
        {!loading && !error && heatmap && (
          <LiquidationHeatmap data={heatmap} mode={mode} currentPrice={currentPrice} />
        )}
      </div>

      {/* ── Rolling stats bar ── */}
      {stats && (
        <div style={statsBarStyle}>
          {(['5m', '15m', '1h'] as const).map((w) => {
            const d = stats.windows[w];
            if (!d) return null;
            // sell_usd = longs liquidated (bearish), buy_usd = shorts liquidated (bullish)
            const longPct  = d.total_usd > 0 ? (d.sell_usd / d.total_usd) * 100 : 50;
            const shortPct = 100 - longPct;
            return (
              <div key={w} style={statsCellStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '9px', color: '#666', fontWeight: 700 }}>{w.toUpperCase()}</span>
                  <span style={{ fontSize: '9px', color: '#888' }}>{d.count} evt</span>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#ddd', marginBottom: '4px' }}>
                  {fmtUsd(d.total_usd)}
                </div>
                {/* Bar: red = longs liq'd, green = shorts liq'd */}
                <div
                  style={fillBarStyle}
                  title={`Longs liq'd: ${fmtUsd(d.sell_usd)} | Shorts liq'd: ${fmtUsd(d.buy_usd)}`}
                >
                  <div style={{ width: `${longPct}%`,  height: '100%', backgroundColor: '#cc3333' }} />
                  <div style={{ width: `${shortPct}%`, height: '100%', backgroundColor: '#33aa66' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                  <span style={{ fontSize: '9px', color: '#cc3333' }} title="Longs liquidated">
                    L:{d.sell_count}
                  </span>
                  <span style={{ fontSize: '9px', color: '#33aa66' }} title="Shorts liquidated">
                    S:{d.buy_count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default LiquidationPanel;

// ── Styles ────────────────────────────────────────────────────────────────────

const headerStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  flexShrink: 0,
  gap:        '6px',
  paddingBottom: '6px',
  borderBottom:  '1px solid #2a2a2e',
  marginBottom:  '6px',
};

const titleStyle: CSSProperties = {
  fontSize:   '12px',
  fontWeight: 600,
  color:      '#bbb',
  whiteSpace: 'nowrap',
};

const chipStyle = (active: boolean): CSSProperties => ({
  backgroundColor: active ? '#1e2e3e' : 'transparent',
  border:          `1px solid ${active ? '#3a6a9f' : '#333'}`,
  borderRadius:    '3px',
  color:           active ? '#90b8e0' : '#555',
  cursor:          'pointer',
  fontSize:        '10px',
  fontWeight:      active ? 700 : 500,
  padding:         '2px 7px',
  transition:      'all 0.1s',
});

const modeColor = (id: HeatMode) =>
  id === 'long' ? '#cc4444' : id === 'short' ? '#44aa66' : '#a07030';

const modeChipStyle = (active: boolean, id: HeatMode): CSSProperties => ({
  backgroundColor: active ? `${modeColor(id)}22` : 'transparent',
  border:          `1px solid ${active ? modeColor(id) : '#333'}`,
  borderRadius:    '3px',
  color:           active ? modeColor(id) : '#555',
  cursor:          'pointer',
  fontSize:        '10px',
  fontWeight:      active ? 700 : 500,
  padding:         '2px 7px',
  transition:      'all 0.1s',
});

const dividerStyle: CSSProperties = {
  width:           '1px',
  height:          '14px',
  backgroundColor: '#2a2a2e',
  margin:          '0 2px',
};

const overlayStyle: CSSProperties = {
  position:       'absolute',
  inset:          0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
};

const statsBarStyle: CSSProperties = {
  display:    'flex',
  gap:        '6px',
  flexShrink: 0,
  marginTop:  '6px',
};

const statsCellStyle: CSSProperties = {
  flex:            1,
  backgroundColor: '#111114',
  border:          '1px solid #2a2a2e',
  borderRadius:    '4px',
  padding:         '5px 6px',
};

const fillBarStyle: CSSProperties = {
  display:         'flex',
  height:          '4px',
  borderRadius:    '2px',
  overflow:        'hidden',
  backgroundColor: '#1e1e22',
};
