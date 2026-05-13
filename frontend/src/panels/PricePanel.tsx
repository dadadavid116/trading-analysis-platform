import { useState, useEffect, useRef, CSSProperties } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, LineStyle, IPriceLine, LineData } from 'lightweight-charts';
import { fetchKlines, fetchAlerts, createAlert, requestChartAnalysis, fetchPriceLevels, PriceCandle, KlineCandle, Alert } from '../api';
import { panelStyles } from './panelStyles';

// ── Indicator definitions ──────────────────────────────────────────────────────

const INDICATOR_OPTIONS: { key: string; label: string; description: string; phase?: number }[] = [
  { key: 'price_levels', label: 'Price Levels',     description: 'Support & resistance from candle structure (always on)' },
  { key: 'rsi',          label: 'RSI (14)',          description: 'Momentum oscillator — oversold / neutral / overbought' },
  { key: 'macd',         label: 'MACD (12/26/9)',    description: 'Trend & momentum — histogram positive = bullish' },
  { key: 'ema',          label: 'EMA (20, 50)',       description: 'Price position relative to trend EMAs' },
  { key: 'bollinger',    label: 'Bollinger Bands',   description: 'Volatility bands — price near upper / lower band' },
  { key: 'oi',           label: 'Open Interest',     description: 'OI expansion/contraction — requires derivatives collector data' },
  { key: 'funding_rate', label: 'Funding Rate',      description: 'Perpetual contract bias — requires derivatives collector data' },
  { key: 'ls_ratio',     label: 'Long/Short Ratio',  description: 'Top-trader crowd positioning — requires derivatives collector data' },
];

const ALWAYS_ON = new Set(['price_levels']);

const STORAGE_KEY = 'tap_active_indicators';

function loadIndicators(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as string[];
  } catch { /* ignore */ }
  return ['price_levels', 'rsi', 'macd', 'ema'];
}

function saveIndicators(keys: string[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
}

// ── Time-period definitions ────────────────────────────────────────────────────

const INTERVALS = [
  { label: '3m',  value: '3m',  limit: 200, seconds: 180    },
  { label: '5m',  value: '5m',  limit: 200, seconds: 300    },
  { label: '15m', value: '15m', limit: 200, seconds: 900    },
  { label: '1H',  value: '1h',  limit: 200, seconds: 3600   },
  { label: '4H',  value: '4h',  limit: 200, seconds: 14400  },
  { label: '1D',  value: '1d',  limit: 200, seconds: 86400  },
  { label: '1M',  value: '1M',  limit: 24,  seconds: 0      }, // monthly varies — no countdown
] as const;

type IntervalValue = typeof INTERVALS[number]['value'];

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2a2a2e',
    paddingBottom: '8px',
  },
  switcherRow: {
    display: 'flex',
    gap: '4px',
  },
  switcherBtn: (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#1e3a5f' : '#111114',
    border: `1px solid ${active ? '#3a6a9f' : '#2a2a2e'}`,
    borderRadius: '4px',
    color: active ? '#90b8e0' : '#888',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    padding: '3px 8px',
    transition: 'all 0.15s',
  }),
  chartContainer: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    borderRadius: '4px',
    overflow: 'hidden',
    cursor: 'crosshair',
  },
};

// ── Chart overlay definitions ─────────────────────────────────────────────────

const OVERLAY_OPTIONS = [
  { key: 'ema20',  label: 'EMA 20',  color: '#f5a623' },
  { key: 'ema50',  label: 'EMA 50',  color: '#ff6b35' },
  { key: 'ema200', label: 'EMA 200', color: '#9b59b6' },
  { key: 'vwap',   label: 'VWAP',    color: '#4a9eff' },
] as const;

const OVERLAY_STORAGE_KEY = 'tap_chart_overlays';

function loadOverlays(): Set<string> {
  try {
    const saved = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved) as string[]);
  } catch { /* ignore */ }
  return new Set(['ema20', 'ema50']);
}

function computeEMA(closes: LineData[], period: number): LineData[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  let ema = (closes.slice(0, period).reduce((s, d) => s + d.value, 0)) / period;
  const result: LineData[] = [{ time: closes[period - 1].time, value: ema }];
  for (let i = period; i < closes.length; i++) {
    ema = closes[i].value * k + ema * (1 - k);
    result.push({ time: closes[i].time, value: ema });
  }
  return result;
}

function computeVWAP(candles: KlineCandle[]): LineData[] {
  const result: LineData[] = [];
  let pvSum = 0, volSum = 0, lastDay = -1;
  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (day !== lastDay) { pvSum = 0; volSum = 0; lastDay = day; }
    const tp = (c.high + c.low + c.close) / 3;
    pvSum  += tp * c.volume;
    volSum += c.volume;
    if (volSum > 0) result.push({ time: c.time as UTCTimestamp, value: pvSum / volSum });
  }
  return result;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface PricePanelProps {
  symbol:     string;
  onAnalysis: (message: string) => void;
}

function PricePanel({ symbol, onAnalysis }: PricePanelProps) {
  const [candle, setCandle] = useState<PriceCandle | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [latestLoading, setLatestLoading] = useState(true);

  const [timeframe, setTimeframe] = useState<IntervalValue>('5m');
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  // ── Countdown timer state ───────────────────────────────────────────────────
  const [countdown, setCountdown] = useState<string>('');
  const lastCandleTimeRef = useRef<number>(0); // Unix seconds — open time of rightmost candle

  // ── Crosshair hover state ───────────────────────────────────────────────────
  // Tracks the price under the cursor as the user moves across the chart.
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const seriesRef         = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const alertLinesRef     = useRef<Map<number, IPriceLine>>(new Map());

  // ── Chart analysis (Phase 23/26) ─────────────────────────────────────────
  const [analyzing, setAnalyzing]           = useState(false);
  const [analyzeError, setAnalyzeError]     = useState<string | null>(null);
  const [bias, setBias]                     = useState<'auto' | 'long' | 'short'>('auto');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(loadIndicators);
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const analysisLinesRef = useRef<IPriceLine[]>([]);
  const levelsLinesRef   = useRef<IPriceLine[]>([]);

  // Overlay line series (EMA 20/50/200, VWAP)
  const ema20Ref  = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref  = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const [overlays, setOverlays] = useState<Set<string>>(loadOverlays);

  function toggleOverlay(key: string) {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  // Alert popover shown on chart click.
  const [popover, setPopover]           = useState<{ x: number; y: number; price: number } | null>(null);
  const [popoverSaving, setPopoverSaving] = useState(false);
  const [popoverError, setPopoverError]   = useState<string | null>(null);

  // ── Live price via SSE ────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/price/stream?symbol=${symbol}`);
    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as PriceCandle;
        setCandle(data);
        setLatestError(null);
        setLatestLoading(false);
      } catch { /* malformed frame — skip */ }
    };
    es.onerror = () => setLatestError('Live stream reconnecting…');
    return () => es.close();
  }, [symbol]);

  // ── Countdown ticker (updates every second) ───────────────────────────────
  useEffect(() => {
    const cfg = INTERVALS.find((i) => i.value === timeframe);
    const intervalSecs = cfg?.seconds ?? 0;

    const tick = () => {
      if (!intervalSecs || !lastCandleTimeRef.current) { setCountdown(''); return; }
      const closeTime  = lastCandleTimeRef.current + intervalSecs;
      const remaining  = closeTime - Math.floor(Date.now() / 1000);
      if (remaining <= 0) { setCountdown('closing…'); return; }
      if (remaining >= 3600) {
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        setCountdown(`${h}h ${m}m`);
      } else if (remaining >= 60) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setCountdown(`${m}m ${s}s`);
      } else {
        setCountdown(`${remaining}s`);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timeframe]);

  // ── Sync alert price lines every 15 s ────────────────────────────────────
  useEffect(() => {
    const syncLines = () => {
      fetchAlerts()
        .then((data: Alert[]) => {
          if (!seriesRef.current) return;
          const priceAlerts = data.filter(
            (a) => a.is_active && !a.triggered_at &&
              (a.condition_type === 'price_above' || a.condition_type === 'price_below'),
          );
          const series   = seriesRef.current;
          const linesMap = alertLinesRef.current;
          const activeIds = new Set(priceAlerts.map((a) => a.id));

          for (const [id, line] of linesMap) {
            if (!activeIds.has(id)) { series.removePriceLine(line); linesMap.delete(id); }
          }
          for (const alert of priceAlerts) {
            if (linesMap.has(alert.id)) continue;
            const isAbove = alert.condition_type === 'price_above';
            const line = series.createPriceLine({
              price: alert.threshold, color: '#f5a623', lineWidth: 1,
              lineStyle: LineStyle.Dashed, axisLabelVisible: true,
              title: `${isAbove ? '↑' : '↓'} ${alert.name}`,
            });
            linesMap.set(alert.id, line);
          }
        })
        .catch(() => {});
    };
    syncLines();
    const id = setInterval(syncLines, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Create chart once on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1a1a1f' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#222226' },
        horzLines: { color: '#222226' },
      },
      crosshair: {
        vertLine: { color: '#3a3a4e', labelBackgroundColor: '#1e3a5f' },
        horzLine: { color: '#3a3a4e', labelBackgroundColor: '#1e3a5f' },
      },
      rightPriceScale: { borderColor: '#2a2a2e' },
      timeScale: { borderColor: '#2a2a2e', timeVisible: true, secondsVisible: false },
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 320,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      borderUpColor: '#26a69a', borderDownColor: '#ef5350',
      wickUpColor:   '#26a69a', wickDownColor:   '#ef5350',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Overlay line series — hidden by default; visibility managed separately
    const mkLine = (color: string, dashed = false) => chart.addLineSeries({
      color, lineWidth: 1,
      lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false, visible: false,
    });
    ema20Ref.current  = mkLine('#f5a623');
    ema50Ref.current  = mkLine('#ff6b35');
    ema200Ref.current = mkLine('#9b59b6');
    vwapRef.current   = mkLine('#4a9eff', true);

    // ── Crosshair move → show floating price label ──────────────────────────
    // Fires continuously as the user moves their cursor anywhere on the chart.
    // The price is read directly from the Y coordinate — not snapped to any candle.
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0) {
        setCrosshair(null);
        return;
      }
      const price = series.coordinateToPrice(param.point.y);
      if (price === null || price <= 0) { setCrosshair(null); return; }
      setCrosshair({ x: param.point.x, y: param.point.y, price: Math.round(price) });
    });

    // ── Click → open alert popover at the exact crosshair price ───────────
    chart.subscribeClick((param) => {
      if (!param.point) { setPopover(null); return; }
      const price = series.coordinateToPrice(param.point.y);
      if (price === null || price <= 0) { setPopover(null); return; }
      setPopoverError(null);
      setPopover({ x: param.point.x, y: param.point.y, price: Math.round(price) });
    });

    // ResizeObserver keeps the chart in sync with panel width changes.
    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current)
        chart.applyOptions({
          width:  chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      ema20Ref.current  = null;
      ema50Ref.current  = null;
      ema200Ref.current = null;
      vwapRef.current   = null;
    };
  }, []);

  // ── Refresh the rightmost candle every 10 s ───────────────────────────────
  useEffect(() => {
    const refreshLiveCandle = () => {
      if (!seriesRef.current) return;
      fetchKlines(timeframe, 1, symbol)
        .then((data: KlineCandle[]) => {
          if (!seriesRef.current || data.length === 0) return;
          const c = data[0];
          seriesRef.current.update({
            time: c.time as UTCTimestamp,
            open: c.open, high: c.high, low: c.low, close: c.close,
          });
          lastCandleTimeRef.current = c.time;
        })
        .catch(() => {});
    };
    const id = setInterval(refreshLiveCandle, 10_000);
    return () => clearInterval(id);
  }, [timeframe, symbol]);

  // ── Clear analysis + S&R lines when symbol changes ───────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;
    for (const line of analysisLinesRef.current) {
      try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
    }
    analysisLinesRef.current = [];
    for (const line of levelsLinesRef.current) {
      try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
    }
    levelsLinesRef.current = [];
  }, [symbol]);

  // ── Draw S&R level lines on symbol change ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchPriceLevels(symbol)
      .then((data) => {
        if (cancelled || !seriesRef.current) return;
        const series = seriesRef.current;
        for (const line of levelsLinesRef.current) {
          try { series.removePriceLine(line); } catch { /* ignore */ }
        }
        levelsLinesRef.current = [];
        for (const lv of data.support) {
          const line = series.createPriceLine({
            price: lv.price, color: '#26a69a', lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true,
            title: `S×${lv.touches}`,
          });
          levelsLinesRef.current.push(line);
        }
        for (const lv of data.resistance) {
          const line = series.createPriceLine({
            price: lv.price, color: '#ef5350', lineWidth: 1,
            lineStyle: LineStyle.Dashed, axisLabelVisible: true,
            title: `R×${lv.touches}`,
          });
          levelsLinesRef.current.push(line);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // ── Sync overlay visibility when toggles change ───────────────────────────
  useEffect(() => {
    ema20Ref.current?.applyOptions({ visible: overlays.has('ema20') });
    ema50Ref.current?.applyOptions({ visible: overlays.has('ema50') });
    ema200Ref.current?.applyOptions({ visible: overlays.has('ema200') });
    vwapRef.current?.applyOptions({ visible: overlays.has('vwap') });
  }, [overlays]);

  // ── Load full candle series on timeframe or symbol change ─────────────────
  useEffect(() => {
    if (!seriesRef.current) return;
    const cfg = INTERVALS.find((i) => i.value === timeframe);
    if (!cfg) return;

    setChartLoading(true);
    setChartError(null);

    fetchKlines(timeframe, cfg.limit, symbol)
      .then((data: KlineCandle[]) => {
        const chartData: CandlestickData[] = data.map((c) => ({
          time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
        }));
        seriesRef.current!.setData(chartData);
        chartRef.current!.timeScale().fitContent();
        if (chartData.length > 0)
          lastCandleTimeRef.current = chartData[chartData.length - 1].time as number;

        // Compute and set overlay data
        const closeLD: LineData[] = data.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }));
        ema20Ref.current?.setData(computeEMA(closeLD, 20));
        ema50Ref.current?.setData(computeEMA(closeLD, 50));
        ema200Ref.current?.setData(computeEMA(closeLD, 200));
        vwapRef.current?.setData(computeVWAP(data));

        setChartLoading(false);
      })
      .catch((err: Error) => {
        setChartError(err.message);
        setChartLoading(false);
      });
  }, [timeframe, symbol]);

  // ── Create alert from popover ─────────────────────────────────────────────
  async function setAlertFromChart(conditionType: 'price_above' | 'price_below') {
    if (!popover) return;
    setPopoverSaving(true);
    setPopoverError(null);
    try {
      const baseAsset = symbol.replace('USDT', '');
      await createAlert({
        name: `${baseAsset} ${conditionType === 'price_above' ? 'above' : 'below'} $${popover.price.toLocaleString()}`,
        symbol,
        condition_type: conditionType,
        threshold: popover.price,
        trigger_mode: 'once',
      });
      setPopover(null);
    } catch (err: unknown) {
      setPopoverError(err instanceof Error ? err.message : 'Could not create alert.');
    } finally {
      setPopoverSaving(false);
    }
  }

  // ── Chart analysis (Phase 23) ─────────────────────────────────────────────
  async function handleAnalyze() {
    if (!seriesRef.current) return;
    setAnalyzing(true);
    setAnalyzeError(null);

    try {
      const userBias = bias === 'auto' ? '' : bias === 'long' ? 'bullish — looking for a long setup' : 'bearish — looking for a short setup';
      const result = await requestChartAnalysis(timeframe, userBias, activeIndicators);
      const series = seriesRef.current;

      // Clear previous analysis lines
      for (const line of analysisLinesRef.current) {
        try { series.removePriceLine(line); } catch { /* already removed */ }
      }
      analysisLinesRef.current = [];

      const addLine = (price: number, color: string, title: string) => {
        const line = series.createPriceLine({
          price, color, lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title,
        });
        analysisLinesRef.current.push(line);
      };

      const isShort = result.direction === 'short';

      result.support_levels.forEach((p, i) => addLine(p, '#26a69a', `Support ${i + 1}`));
      result.resistance_levels.forEach((p, i) => addLine(p, '#ef5350', `Resistance ${i + 1}`));
      addLine(result.entry_zone.low,  '#4a90d9', isShort ? 'Short entry low'  : 'Entry low');
      addLine(result.entry_zone.high, '#4a90d9', isShort ? 'Short entry high' : 'Entry high');
      addLine(result.stop_loss, '#f5a623', 'Stop loss');
      result.take_profit.forEach((p, i) => addLine(p, isShort ? '#26a69a' : '#ef5350', `TP ${i + 1}`));

      // Format markdown message for ChatPanel
      const trendEmoji = result.trend === 'bullish' ? '📈' : result.trend === 'bearish' ? '📉' : '➡️';
      const dirEmoji   = isShort ? '🔴 SHORT' : '🟢 LONG';
      const fmt = (n: number) => `$${n.toLocaleString()}`;
      const baseAsset  = symbol.replace('USDT', '');
      const msg =
        `## Chart Analysis — ${baseAsset}/USDT (${result.timeframe.toUpperCase()})\n\n` +
        `**Trend:** ${trendEmoji} ${result.trend.charAt(0).toUpperCase() + result.trend.slice(1)} · **Setup:** ${dirEmoji}\n\n` +
        `**Support:** ${result.support_levels.map(fmt).join(' · ')}\n` +
        `**Resistance:** ${result.resistance_levels.map(fmt).join(' · ')}\n\n` +
        `**Entry zone:** ${fmt(result.entry_zone.low)} – ${fmt(result.entry_zone.high)}\n` +
        `**Stop loss:** ${fmt(result.stop_loss)}\n` +
        `**Take profit:** ${result.take_profit.map(fmt).join(' · ')}\n\n` +
        `${result.reasoning}\n\n` +
        `*Lines on chart — green: support, red: resistance, blue: entry zone, orange: stop loss.*`;

      onAnalysis(msg);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const containerWidth = chartContainerRef.current?.clientWidth ?? 400;

  return (
    <div style={{ ...panelStyles.card, position: 'relative' }}>
      {/* Header: title + interval switcher */}
      <div style={styles.header}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Price — {symbol.replace('USDT', '')}/USDT
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={styles.switcherRow}>
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                style={styles.switcherBtn(timeframe === iv.value)}
                onClick={() => setTimeframe(iv.value)}
              >
                {iv.label}
              </button>
            ))}
          </div>
          {/* Bias selector */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['auto', 'long', 'short'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBias(b)}
                style={{
                  backgroundColor: bias === b ? (b === 'long' ? '#1e3a1e' : b === 'short' ? '#3a1e1e' : '#1e2a3a') : '#111114',
                  border: `1px solid ${bias === b ? (b === 'long' ? '#2a6a2a' : b === 'short' ? '#6a2a2a' : '#3a5a7a') : '#2a2a2e'}`,
                  borderRadius: '4px',
                  color: bias === b ? (b === 'long' ? '#66bb6a' : b === 'short' ? '#ef5350' : '#90b8e0') : '#666',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 7px',
                  transition: 'all 0.15s',
                }}
              >
                {b === 'auto' ? 'Auto' : b === 'long' ? '↑ Long' : '↓ Short'}
              </button>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              backgroundColor: analyzing ? '#111114' : '#1e2a3a',
              border: '1px solid #3a5a7a',
              borderRadius: '4px',
              color: analyzing ? '#555' : '#90b8e0',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 10px',
              whiteSpace: 'nowrap' as const,
              transition: 'all 0.15s',
            }}
          >
            {analyzing ? 'Analyzing…' : '✦ Analyze'}
          </button>
          {/* Indicator preferences gear */}
          <button
            onClick={() => setShowIndicatorModal((v) => !v)}
            title="Analysis indicator preferences"
            style={{
              background: showIndicatorModal ? '#1e2a3a' : 'none',
              border: `1px solid ${showIndicatorModal ? '#3a5a7a' : '#2a2a2e'}`,
              borderRadius: '4px',
              color: showIndicatorModal ? '#90b8e0' : '#555',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '3px 7px',
              lineHeight: 1,
              transition: 'all 0.15s',
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Overlay toggle chips */}
      <div style={overlayRowStyle}>
        {OVERLAY_OPTIONS.map((opt) => {
          const active = overlays.has(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => toggleOverlay(opt.key)}
              title={`Toggle ${opt.label} overlay`}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                backgroundColor: active ? `${opt.color}18` : 'transparent',
                border: `1px solid ${active ? opt.color + '66' : '#2a2a2e'}`,
                borderRadius: '3px', color: active ? opt.color : '#444',
                cursor: 'pointer', fontSize: '10px', fontWeight: active ? 600 : 400,
                padding: '2px 6px', transition: 'all 0.12s',
              }}
            >
              <span style={{ display: 'inline-block', width: '8px', height: '2px', backgroundColor: active ? opt.color : '#444', borderRadius: '1px' }} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Indicator preferences modal */}
      {showIndicatorModal && (
        <div style={indicatorModalStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#d0d0d0' }}>Analysis Indicators</span>
            <button onClick={() => setShowIndicatorModal(false)} style={modalCloseBtnStyle}>×</button>
          </div>
          <p style={{ fontSize: '10px', color: '#666', marginBottom: '8px', lineHeight: 1.4 }}>
            Selected indicators are computed from chart data and included in the AI analysis prompt.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {INDICATOR_OPTIONS.map((opt) => {
              const isAlwaysOn = ALWAYS_ON.has(opt.key);
              const isPhase27  = !!opt.phase;
              const isActive   = activeIndicators.includes(opt.key);
              const toggle = () => {
                if (isAlwaysOn || isPhase27) return;
                const next = isActive
                  ? activeIndicators.filter((k) => k !== opt.key)
                  : [...activeIndicators, opt.key];
                setActiveIndicators(next);
                saveIndicators(next);
              };
              return (
                <div
                  key={opt.key}
                  onClick={toggle}
                  title={opt.description}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    cursor: isAlwaysOn || isPhase27 ? 'default' : 'pointer',
                    backgroundColor: isActive && !isPhase27 ? 'rgba(74,144,217,0.08)' : 'transparent',
                    opacity: isPhase27 ? 0.4 : 1,
                  }}
                >
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                    backgroundColor: isActive && !isPhase27 ? '#4a90d9' : 'transparent',
                    border: `1px solid ${isActive && !isPhase27 ? '#4a90d9' : '#444'}`,
                  }}>
                    {isActive && !isPhase27 && (
                      <span style={{ display: 'block', textAlign: 'center', fontSize: '9px', color: '#fff', lineHeight: '12px' }}>✓</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '11px', color: isPhase27 ? '#555' : '#ccc' }}>{opt.label}</span>
                    {opt.phase && (
                      <span style={{ fontSize: '9px', color: '#444', marginLeft: '6px' }}>Phase {opt.phase}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Price data grid */}
      {latestLoading && <p style={panelStyles.muted}>Loading…</p>}
      {latestError && (
        <p style={panelStyles.error}>Could not load price data — check that the API is running.</p>
      )}
      {candle && !latestLoading && (
        <div style={panelStyles.dataGrid}>
          <DataRow label="Close"  value={`$${candle.close.toLocaleString()}`} highlight />
          <DataRow label="Open"   value={`$${candle.open.toLocaleString()}`} />
          <DataRow label="High"   value={`$${candle.high.toLocaleString()}`} />
          <DataRow label="Low"    value={`$${candle.low.toLocaleString()}`} />
          <DataRow label="Volume" value={candle.volume.toLocaleString()} />
          <DataRow label="Time"   value={new Date(candle.timestamp).toLocaleTimeString()} />
          {/* Countdown timer — shows how long until the current candle closes */}
          {countdown && (
            <DataRow label="Candle closes" value={countdown} />
          )}
        </div>
      )}

      {analyzeError && (
        <p style={{ ...panelStyles.error, margin: 0 }}>Analysis error: {analyzeError}</p>
      )}

      {/* Chart — grows to fill all remaining panel space */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {chartLoading && (
          <p style={{ ...panelStyles.muted, position: 'absolute', top: 8, left: 8, zIndex: 1 }}>
            Loading chart…
          </p>
        )}
        {chartError && (
          <p style={{ ...panelStyles.error, position: 'absolute', top: 8, left: 8, zIndex: 1 }}>
            Chart error: {chartError}
          </p>
        )}
        <div ref={chartContainerRef} style={styles.chartContainer} />

        {/* Crosshair price label — follows cursor, hidden while popover is open */}
        {crosshair && !popover && (
          <div style={{
            position: 'absolute',
            left: Math.min(crosshair.x + 14, containerWidth - 160) + 'px',
            top:  Math.max(crosshair.y - 14, 2) + 'px',
            backgroundColor: 'rgba(26,26,46,0.92)',
            border: '1px solid #3a3a5e',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            color: '#f5a623',
            pointerEvents: 'none',   // must not block chart events
            zIndex: 5,
            whiteSpace: 'nowrap',
          }}>
            ${crosshair.price.toLocaleString()} — click to set alert
          </div>
        )}

        {/* Alert popover (appears on click) */}
        {popover && (
          <div style={{
            position: 'absolute',
            left: `${Math.min(popover.x + 8, containerWidth - 190)}px`,
            top:  `${Math.max(popover.y - 20, 0)}px`,
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5e',
            borderRadius: '7px',
            padding: '10px 12px',
            zIndex: 10,
            width: '178px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            {/* Price + close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: '#f5a623', fontWeight: 700, fontSize: '13px' }}>
                ${popover.price.toLocaleString()}
              </span>
              <button
                onClick={() => setPopover(null)}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>

            {/* Alert buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <button
                disabled={popoverSaving}
                onClick={() => setAlertFromChart('price_above')}
                style={popoverButtonStyle('#1e3a1e', '#2a6a2a', '#66bb6a')}
              >
                ↑ Alert above
              </button>
              <button
                disabled={popoverSaving}
                onClick={() => setAlertFromChart('price_below')}
                style={popoverButtonStyle('#3a1e1e', '#6a2a2a', '#ef5350')}
              >
                ↓ Alert below
              </button>
            </div>

            {popoverError && (
              <p style={{ color: '#f44336', fontSize: '10px', margin: '6px 0 0' }}>{popoverError}</p>
            )}
            {popoverSaving && (
              <p style={{ color: '#888', fontSize: '10px', margin: '6px 0 0' }}>Saving…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PricePanel;

// ── Helpers ────────────────────────────────────────────────────────────────────

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={panelStyles.row}>
      <span style={panelStyles.label}>{label}</span>
      <span style={highlight ? panelStyles.valueHighlight : panelStyles.value}>{value}</span>
    </div>
  );
}

function popoverButtonStyle(bg: string, border: string, color: string): React.CSSProperties {
  return {
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: '5px',
    color,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '5px 0',
    width: '100%',
    textAlign: 'center',
  };
}

const indicatorModalStyle: CSSProperties = {
  position: 'absolute',
  top: '48px',
  right: '8px',
  zIndex: 20,
  backgroundColor: '#16161a',
  border: '1px solid #2a2a2e',
  borderRadius: '7px',
  padding: '10px 12px',
  width: '240px',
  boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
};

const modalCloseBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: 1,
  padding: '0 2px',
};

const overlayRowStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '4px 0 2px',
  flexWrap: 'wrap',
};
