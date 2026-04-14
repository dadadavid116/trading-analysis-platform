import { useState, useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, LineStyle, IPriceLine } from 'lightweight-charts';
import { fetchKlines, fetchAlerts, createAlert, PriceCandle, KlineCandle, Alert } from '../api';
import { panelStyles } from './panelStyles';

// ── Time-period definitions ────────────────────────────────────────────────────

const INTERVALS = [
  { label: '3m',  value: '3m',  limit: 100, seconds: 180    },
  { label: '5m',  value: '5m',  limit: 100, seconds: 300    },
  { label: '15m', value: '15m', limit: 100, seconds: 900    },
  { label: '1H',  value: '1h',  limit: 100, seconds: 3600   },
  { label: '4H',  value: '4h',  limit: 100, seconds: 14400  },
  { label: '1D',  value: '1d',  limit: 90,  seconds: 86400  },
  { label: '1M',  value: '1M',  limit: 24,  seconds: 0      }, // monthly varies — no countdown
] as const;

type IntervalValue = typeof INTERVALS[number]['value'];

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
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

// ── Component ──────────────────────────────────────────────────────────────────

function PricePanel() {
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

  // Alert popover shown on chart click.
  const [popover, setPopover]           = useState<{ x: number; y: number; price: number } | null>(null);
  const [popoverSaving, setPopoverSaving] = useState(false);
  const [popoverError, setPopoverError]   = useState<string | null>(null);

  // ── Live price via SSE ────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/price/stream');
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
  }, []);

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
    };
  }, []);

  // ── Refresh the rightmost candle every 10 s ───────────────────────────────
  useEffect(() => {
    const refreshLiveCandle = () => {
      if (!seriesRef.current) return;
      fetchKlines(timeframe, 1)
        .then((data: KlineCandle[]) => {
          if (!seriesRef.current || data.length === 0) return;
          const c = data[0];
          seriesRef.current.update({
            time: c.time as UTCTimestamp,
            open: c.open, high: c.high, low: c.low, close: c.close,
          });
          lastCandleTimeRef.current = c.time; // keep countdown in sync
        })
        .catch(() => {});
    };
    const id = setInterval(refreshLiveCandle, 10_000);
    return () => clearInterval(id);
  }, [timeframe]);

  // ── Load full candle series on timeframe change ───────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;
    const cfg = INTERVALS.find((i) => i.value === timeframe);
    if (!cfg) return;

    setChartLoading(true);
    setChartError(null);

    fetchKlines(timeframe, cfg.limit)
      .then((data: KlineCandle[]) => {
        const chartData: CandlestickData[] = data.map((c) => ({
          time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
        }));
        seriesRef.current!.setData(chartData);
        chartRef.current!.timeScale().fitContent();
        // Seed the countdown with the open time of the rightmost candle.
        if (chartData.length > 0)
          lastCandleTimeRef.current = chartData[chartData.length - 1].time as number;
        setChartLoading(false);
      })
      .catch((err: Error) => {
        setChartError(err.message);
        setChartLoading(false);
      });
  }, [timeframe]);

  // ── Create alert from popover ─────────────────────────────────────────────
  async function setAlertFromChart(conditionType: 'price_above' | 'price_below') {
    if (!popover) return;
    setPopoverSaving(true);
    setPopoverError(null);
    try {
      await createAlert({
        name: `BTC ${conditionType === 'price_above' ? 'above' : 'below'} $${popover.price.toLocaleString()}`,
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

  // ── Render ────────────────────────────────────────────────────────────────

  const containerWidth = chartContainerRef.current?.clientWidth ?? 400;

  return (
    <div style={panelStyles.card}>
      {/* Header: title + interval switcher */}
      <div style={styles.header}>
        <h2 style={{ ...panelStyles.title, border: 'none', paddingBottom: 0, margin: 0 }}>
          Price — BTC/USDT
        </h2>
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
      </div>

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
