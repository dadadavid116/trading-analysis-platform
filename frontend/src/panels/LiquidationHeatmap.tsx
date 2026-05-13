import { useRef, useEffect, useCallback } from 'react';
import type { LiquidationHeatmapData } from '../api';

export type HeatMode = 'total' | 'long' | 'short';

interface Props {
  data:          LiquidationHeatmapData;
  mode:          HeatMode;
  currentPrice?: number;
}

// ── Color stops ───────────────────────────────────────────────────────────────
// Each stop: [position 0-1, R, G, B, A 0-255]
type Stop = [number, number, number, number, number];

const STOPS_TOTAL: Stop[] = [
  [0.00,  13,  13,  16,   0],   // transparent background
  [0.08,  30,   8,  55, 160],   // dark indigo
  [0.30, 110,  12,  38, 210],   // blood red
  [0.55, 210,  70,  12, 235],   // orange-red
  [0.80, 245, 155,   0, 248],   // amber
  [1.00, 255, 235,  20, 255],   // bright yellow
];

const STOPS_LONG: Stop[] = [    // longs liquidated → bearish → red
  [0.00,  13,  13,  16,   0],
  [0.10,  45,   5,   5, 160],
  [0.35, 165,  18,  18, 215],
  [0.70, 245,  55,  30, 245],
  [1.00, 255, 200, 150, 255],
];

const STOPS_SHORT: Stop[] = [   // shorts liquidated → bullish → green
  [0.00,  13,  13,  16,   0],
  [0.10,   5,  35,  30, 160],
  [0.35,  15, 135,  90, 215],
  [0.70,  30, 210, 120, 245],
  [1.00, 150, 255, 200, 255],
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function colorAt(t: number, stops: Stop[]): string {
  if (t <= 0) return 'rgba(0,0,0,0)';
  const last = stops[stops.length - 1];
  if (t >= 1) return `rgba(${last[1]},${last[2]},${last[3]},${last[4] / 255})`;

  for (let i = 1; i < stops.length; i++) {
    const [p0, r0, g0, b0, a0] = stops[i - 1];
    const [p1, r1, g1, b1, a1] = stops[i];
    if (t <= p1) {
      const s = (t - p0) / (p1 - p0);
      const r = Math.round(lerp(r0, r1, s));
      const g = Math.round(lerp(g0, g1, s));
      const b = Math.round(lerp(b0, b1, s));
      const a = lerp(a0, a1, s) / 255;
      return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
  }
  return `rgba(${last[1]},${last[2]},${last[3]},${last[4] / 255})`;
}

function fmtPrice(v: number): string {
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1_000)  return `${(v / 1000).toFixed(2)}k`;
  return v.toFixed(0);
}

function fmtTime(d: Date, hours: number): string {
  if (hours <= 24) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', hour12: false });
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

function render(
  canvas: HTMLCanvasElement,
  data: LiquidationHeatmapData,
  mode: HeatMode,
  currentPrice: number | undefined,
) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  // Margins
  const ML = 56; // left  (price axis)
  const MB = 22; // bottom (time axis)
  const MR = 8;
  const MT = 4;
  const PW = W - ML - MR;
  const PH = H - MT - MB;

  // Background
  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0, 0, W, H);

  const { price_bins, time_bins, price_min, price_max, cells } = data;

  if (!cells.length || time_bins === 0) {
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No liquidations recorded in this period', W / 2, H / 2);
    return;
  }

  // Build value grid
  const grid = new Float64Array(price_bins * time_bins);
  let maxVal = 0;
  for (const cell of cells) {
    const v = mode === 'long'  ? cell.sell_usd          // longs liquidated  = sell order
            : mode === 'short' ? cell.buy_usd            // shorts liquidated = buy order
            : cell.buy_usd + cell.sell_usd;
    grid[cell.pi * time_bins + cell.ti] = v;
    if (v > maxVal) maxVal = v;
  }

  const logMax = Math.log1p(maxVal);
  const stops  = mode === 'long' ? STOPS_LONG : mode === 'short' ? STOPS_SHORT : STOPS_TOTAL;
  const cellW  = PW / time_bins;
  const cellH  = PH / price_bins;

  // Heat cells
  for (let pi = 0; pi < price_bins; pi++) {
    for (let ti = 0; ti < time_bins; ti++) {
      const v = grid[pi * time_bins + ti];
      if (v === 0) continue;
      const t = Math.log1p(v) / logMax;
      ctx.fillStyle = colorAt(t, stops);
      const x = ML + ti * cellW;
      const y = MT + (price_bins - 1 - pi) * cellH; // flip Y: high price = top
      ctx.fillRect(x, y, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
    }
  }

  // Price axis grid lines + labels
  ctx.font = '9px "Fira Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const priceRange = price_max - price_min;
  const priceLabelCount = Math.min(6, Math.floor(PH / 22));
  for (let i = 0; i <= priceLabelCount; i++) {
    const frac  = i / priceLabelCount;
    const price = price_min + frac * priceRange;
    const y     = MT + PH - frac * PH;
    ctx.strokeStyle = 'rgba(42,42,46,0.8)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(ML, y);
    ctx.lineTo(ML + PW, y);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText(`$${fmtPrice(price)}`, ML - 4, y);
  }

  // Time axis labels
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = '#555';
  const tStart     = new Date(data.time_start).getTime();
  const tEnd       = new Date(data.time_end).getTime();
  const tSpan      = tEnd - tStart;
  const labelEvery = Math.max(1, Math.floor(time_bins / 7));
  for (let ti = 0; ti < time_bins; ti += labelEvery) {
    const x  = ML + (ti + 0.5) * cellW;
    const ts = new Date(tStart + (ti / (time_bins - 1 || 1)) * tSpan);
    ctx.fillText(fmtTime(ts, data.hours), x, MT + PH + 5);
  }

  // Plot border
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth   = 1;
  ctx.strokeRect(ML, MT, PW, PH);

  // Current price line
  if (currentPrice !== undefined && priceRange > 0) {
    const frac = (currentPrice - price_min) / priceRange;
    if (frac >= 0 && frac <= 1) {
      const y = Math.round(MT + PH - frac * PH) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(ML, y);
      ctx.lineTo(ML + PW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle    = 'rgba(255,255,255,0.75)';
      ctx.font         = '9px "Fira Mono", monospace';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${fmtPrice(currentPrice)}`, ML - 4, y);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiquidationHeatmap({ data, mode, currentPrice }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    if (canvasRef.current) render(canvasRef.current, data, mode, currentPrice);
  }, [data, mode, currentPrice]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
