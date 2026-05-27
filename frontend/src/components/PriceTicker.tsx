import { useState, useEffect, useRef, CSSProperties } from 'react';
import { fetchLatestPrice, fetchKlines } from '../api';

const SYMS = [
  { key: 'BTCUSDT', label: 'BTC' },
  { key: 'ETHUSDT', label: 'ETH' },
  { key: 'SOLUSDT', label: 'SOL' },
];

interface TickerEntry {
  price:     number;
  change24h: number | null;
  flash:     'up' | 'down' | null;
}

type TickerState = Record<string, TickerEntry>;

export default function PriceTicker() {
  const [tickers,   setTickers]   = useState<TickerState>({});
  const prevPrices  = useRef<Record<string, number>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadPrices = async () => {
    const results = await Promise.allSettled(SYMS.map(({ key }) => fetchLatestPrice(key)));
    setTickers((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const { key } = SYMS[i];
        const price   = r.value.close;
        const oldPrice = prevPrices.current[key];
        let flash: TickerEntry['flash'] = null;

        if (oldPrice !== undefined && price !== oldPrice) {
          flash = price > oldPrice ? 'up' : 'down';
          clearTimeout(flashTimers.current[key]);
          flashTimers.current[key] = setTimeout(() => {
            setTickers((p) => ({ ...p, [key]: { ...p[key], flash: null } }));
          }, 700);
        }
        prevPrices.current[key] = price;
        next[key] = { price, change24h: prev[key]?.change24h ?? null, flash };
      });
      return next;
    });
  };

  const loadDaily = async () => {
    const results = await Promise.allSettled(SYMS.map(({ key }) => fetchKlines('1d', 2, key)));
    setTickers((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled' || r.value.length < 2) return;
        const { key }    = SYMS[i];
        const baseline   = r.value[0].close;   // yesterday's close
        const current    = prev[key]?.price ?? r.value[1].close;
        const change24h  = ((current - baseline) / baseline) * 100;
        next[key] = { ...(next[key] ?? { price: current, flash: null }), change24h };
      });
      return next;
    });
  };

  useEffect(() => {
    loadPrices();
    loadDaily();
    const priceId = setInterval(loadPrices, 5_000);
    const dailyId = setInterval(loadDaily, 60_000);
    return () => {
      clearInterval(priceId);
      clearInterval(dailyId);
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (Object.keys(tickers).length === 0) return null;

  return (
    <div style={wrapStyle}>
      {SYMS.map(({ key, label }) => {
        const t = tickers[key];
        if (!t) return null;
        const priceColor  = t.flash === 'up' ? '#26a69a' : t.flash === 'down' ? '#ef5350' : '#c8c8c8';
        const changeColor = t.change24h == null ? '#555' : t.change24h >= 0 ? '#26a69a' : '#ef5350';
        const fmtPrice    = t.price >= 1_000
          ? t.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : t.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
          <div key={key} style={entryStyle}>
            <span style={labelStyle}>{label}</span>
            <span style={{ ...priceStyle, color: priceColor }}>${fmtPrice}</span>
            {t.change24h != null && (
              <span style={{ ...changeStyle, color: changeColor }}>
                {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrapStyle: CSSProperties = {
  display:    'flex',
  gap:        '16px',
  alignItems: 'center',
};

const entryStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'baseline',
  gap:        '4px',
};

const labelStyle: CSSProperties = {
  fontSize:      '10px',
  fontWeight:    700,
  color:         '#555',
  letterSpacing: '0.05em',
};

const priceStyle: CSSProperties = {
  fontSize:   '12px',
  fontWeight: 600,
  fontFamily: 'monospace',
  transition: 'color 0.4s ease',
};

const changeStyle: CSSProperties = {
  fontSize:   '10px',
  fontWeight: 500,
  fontFamily: 'monospace',
};
