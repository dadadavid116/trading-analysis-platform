import { useState, useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, LineStyle, IPriceLine } from 'lightweight-charts';
import { fetchKlines, fetchAlerts, createAlert, PriceCandle, KlineCandle, Alert } from '../api';
import { panelStyles } from './panelStyles';

// ── Time-period definitions ────────────────────────────────────────────────────

const INTERVALS = [
  { label: '3m',  value: '3m',  limit: 100 },
  { label: '5m',  value: '5m',  limit: 100 },
  { label: '15m', value: '15m', limit: 100 },
  { label: '1H',  value: '1h',  limit: 100 },
  { label: '4H',  value: '4h',  limit: 100 },
  { label: '1D',  value: '1d',  limit: 90  },
  { label: '1M',  value: '1M',  limit: 24  },
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
    height: '320px',
    borderRadius: '4px',
    overflow: 'hidden',
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

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // Tracks the IPriceLine handle for each alert ID so we can remove them cleanly.
  const alertLinesRef = useRef<Map<number, IPriceLine>>(new Map());

  // Floating popover shown when user clicks the chart at a price level.
  const [popover, setPopover] = useState<{ x: number; y: number; price: number } | null>(null);
  const [popoverSaving, setPopoverSaving] = useState(false);
  const [popoverError, setPopoverError] = useState<string | null>(null);

  // ── Live price via Server-Sent Events ─────────────────────────────────────
  // The backend pushes the latest DB candle every ~1 s. The collector now
  // upserts on every Binance tick, so the displayed price is effectively live.
  // EventSource reconnects automatically on connection drop.
  useEffect(() => {
    const es = new EventSource('/api/price/stream');

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as PriceCandle;
        setCandle(data);
        setLatestError(null);
        setLatestLoading(false);
      } catch {
        // malformed frame — skip
      }
    };

    es.onerror = () => {
      setLatestError('Live stream reconnecting…');
      // EventSource auto-reconnects — no manual retry needed
    };

    return () => es.close();
  }, []);

  // ── Sync alert price lines onto the chart every 15 s ──────────────────────
  useEffect(() => {
    const syncLines = () => {
      fetchAlerts()
        .then((data: Alert[]) => {
          if (!seriesRef.current) return; // chart not mounted yet

          // Only price alerts that haven't triggered yet get a line.
          const priceAlerts = data.filter(
            (a) =>
              a.is_active &&
              !a.triggered_at &&
              (a.condition_type === 'price_above' || a.condition_type === 'price_below'),
          );

          const series    = seriesRef.current;
          const linesMap  = alertLinesRef.current;
          const activeIds = new Set(priceAlerts.map((a) => a.id));

          // Remove lines whose alerts no longer appear in the active list.
          for (const [id, line] of linesMap) {
            if (!activeIds.has(id)) {
              series.removePriceLine(line);
              linesMap.delete(id);
            }
          }

          // Add a new line for every alert we haven't drawn yet.
          for (const alert of priceAlerts) {
            if (linesMap.has(alert.id)) continue;
            const isAbove = alert.condition_type === 'price_above';
            const line = series.createPriceLine({
              price:            alert.threshold,
              color:            '#f5a623',
              lineWidth:        1,
              lineStyle:        LineStyle.Dashed,
              axisLabelVisible: true,
              title:            `${isAbove ? '↑' : '↓'} ${alert.name}`,
            });
            linesMap.set(alert.id, line);
          }
        })
        .catch(() => {}); // non-critical — silently skip on error
    };

    syncLines();
    const id = setInterval(syncLines, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Create the chart once on mount ─────────────────────────────────────────
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
      timeScale: {
        borderColor: '#2a2a2e',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 320,
    });

    const series = chart.addCandlestickSeries({
      upColor:          '#26a69a',
      downColor:        '#ef5350',
      borderUpColor:    '#26a69a',
      borderDownColor:  '#ef5350',
      wickUpColor:      '#26a69a',
      wickDownColor:    '#ef5350',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Click on the chart → compute the price at the clicked y-coordinate
    // and show a popover to create an alert above or below that level.
    chart.subscribeClick((param) => {
      if (!param.point) { setPopover(null); return; }
      const price = series.coordinateToPrice(param.point.y);
      if (price === null || price <= 0) { setPopover(null); return; }
      setPopoverError(null);
      setPopover({ x: param.point.x, y: param.point.y, price: Math.round(price) });
    });

    // Resize observer keeps the chart in sync with panel width changes.
    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Refresh the live (rightmost) candle on the chart every 10 s ───────────
  // Full chart data is loaded once per timeframe switch (setData below).
  // This effect only updates the LAST candle so the chart stays current
  // without re-rendering the entire series.
  useEffect(() => {
    const refreshLiveCandle = () => {
      if (!seriesRef.current) return;
      const cfg = INTERVALS.find((i) => i.value === timeframe);
      if (!cfg) return;

      fetchKlines(timeframe, 1)
        .then((data: KlineCandle[]) => {
          if (!seriesRef.current || data.length === 0) return;
          const c = data[0];
          seriesRef.current.update({
            time:  c.time as UTCTimestamp,
            open:  c.open,
            high:  c.high,
            low:   c.low,
            close: c.close,
          });
        })
        .catch(() => {}); // non-critical — skip on error
    };

    const id = setInterval(refreshLiveCandle, 10_000);
    return () => clearInterval(id);
  }, [timeframe]);

  // ── Load candle data whenever timeframe changes ────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    const cfg = INTERVALS.find((i) => i.value === timeframe);
    if (!cfg) return;

    setChartLoading(true);
    setChartError(null);

    fetchKlines(timeframe, cfg.limit)
      .then((data: KlineCandle[]) => {
        const chartData: CandlestickData[] = data.map((c) => ({
          time:  c.time as UTCTimestamp,
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        }));
        seriesRef.current!.setData(chartData);
        chartRef.current!.timeScale().fitContent();
        setChartLoading(false);
      })
      .catch((err: Error) => {
        setChartError(err.message);
        setChartLoading(false);
      });
  }, [timeframe]);

  // Create an alert from the chart-click popover.
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
      // Phase 19 polling will draw the alert line on the chart within 15 s.
    } catch (err: unknown) {
      setPopoverError(err instanceof Error ? err.message : 'Could not create alert.');
    } finally {
      setPopoverSaving(false);
    }
  }

  return (
    <div style={panelStyles.card}>
      {/* Header row: title + interval switcher */}
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

      {/* Latest price data grid */}
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
        </div>
      )}

      {/* K-line candlestick chart */}
      <div style={{ position: 'relative' }}>
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

        {/* Click-to-alert popover */}
        {popover && (
          <div style={{
            position: 'absolute',
            left: `${Math.min(popover.x + 8, (chartContainerRef.current?.clientWidth ?? 300) - 190)}px`,
            top: `${Math.max(popover.y - 20, 0)}px`,
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5e',
            borderRadius: '7px',
            padding: '10px 12px',
            zIndex: 10,
            width: '178px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            {/* Price label + close */}
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

// ── Helper ─────────────────────────────────────────────────────────────────────

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
