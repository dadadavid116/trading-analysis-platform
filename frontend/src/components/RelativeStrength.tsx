import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { fetchRelativeStrength, RelativeStrengthEntry } from '../api';

/**
 * RelativeStrength — compact header widget showing 24H % change for each
 * tracked symbol (BTC / ETH / SOL). Refreshes every 60 s.
 */
function RelativeStrength() {
  const [data, setData] = useState<RelativeStrengthEntry[]>([]);

  useEffect(() => {
    const load = () => {
      fetchRelativeStrength()
        .then(setData)
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (data.length === 0) return null;

  return (
    <div style={containerStyle}>
      {data.map((entry) => {
        const positive = entry.change_pct_24h >= 0;
        const color    = positive ? '#66bb6a' : '#ef5350';
        const prefix   = positive ? '+' : '';
        return (
          <div key={entry.symbol} style={itemStyle}>
            <span style={labelStyle}>{entry.display_name}</span>
            <span style={{ ...changeStyle, color }}>
              {prefix}{entry.change_pct_24h.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default RelativeStrength;

const containerStyle: CSSProperties = {
  display:    'flex',
  gap:        '12px',
  alignItems: 'center',
};

const itemStyle: CSSProperties = {
  display:    'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap:        '1px',
};

const labelStyle: CSSProperties = {
  fontSize:      '9px',
  fontWeight:    700,
  color:         '#555',
  letterSpacing: '0.06em',
};

const changeStyle: CSSProperties = {
  fontSize:   '11px',
  fontWeight: 600,
};
