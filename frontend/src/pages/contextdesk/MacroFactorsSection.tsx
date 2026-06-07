import { useState, useEffect, CSSProperties } from 'react';
import { fetchMacroSnapshot } from '../../api';
import type { MacroSnapshot, MacroFactor } from '../../api';
import { FactorCard, SectionHeader, Card, Badge, ScoreBar, colors, space, font } from '../../theme';
import type { Tone } from '../../theme';

/**
 * MacroFactorsSection — Context Desk "Macro" tab (Phase 81).
 *
 * Sources: yfinance (DXY, SPX, VIX, Gold) + FRED API (UST 10Y, HY spread, CPI).
 * 15-minute DB cache — first call fetches live, subsequent calls return cached.
 * FRED factors require FRED_API_KEY on the VPS; yfinance factors always run.
 */

type FcDir = 'long' | 'short' | 'neutral';

function toDir(d: string): FcDir {
  if (d === 'bullish') return 'long';
  if (d === 'bearish') return 'short';
  return 'neutral';
}

function toBarScore(n: number): number {
  return Math.round(50 + n * 50);
}

function findF(factors: MacroFactor[], name: string) {
  return factors.find((f) => f.factor_name === name);
}

const REGIME_LABELS: Record<string, string> = {
  macro_bullish:  'Macro Bullish',
  macro_neutral:  'Macro Neutral',
  macro_cautious: 'Macro Cautious',
  macro_bearish:  'Macro Bearish',
};

function regimeTone(r: string): Tone {
  if (r === 'macro_bullish')  return 'bull';
  if (r === 'macro_bearish')  return 'bear';
  if (r === 'macro_cautious') return 'warn';
  return 'neutral';
}

function envTone(e: string): Tone {
  if (e === 'Favorable') return 'bull';
  if (e === 'Avoid')     return 'bear';
  return 'warn';
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtLevel(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—';
  return `${v.toFixed(dec)}%`;
}

function fmtBps(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(0)} bps`;
}

function fmtFactor(name: string, raw: number | null | undefined): string {
  if (raw == null) return '—';
  switch (name) {
    case 'dxy':       return fmtLevel(raw, 2);
    case 'spx':       return fmtLevel(raw, 0);
    case 'vix':       return fmtLevel(raw, 2);
    case 'gold':      return `$${fmtLevel(raw, 0)}`;
    case 'ust_10y':   return fmtPct(raw, 2);
    case 'hy_spread': return fmtBps(raw);
    case 'cpi':       return `${fmtPct(raw, 1)} YoY`;
    default:          return fmtLevel(raw, 2);
  }
}

function labelFor(name: string): string {
  const map: Record<string, string> = {
    dxy:       'DXY (USD Index)',
    spx:       'S&P 500',
    vix:       'VIX',
    gold:      'Gold (GC=F)',
    ust_10y:   'UST 10Y Yield',
    hy_spread: 'HY Credit Spread',
    cpi:       'CPI (YoY)',
  };
  return map[name] ?? name;
}

function subFor(f: MacroFactor): string {
  const conf = `${(f.confidence * 100).toFixed(0)}%`;
  return `conf ${conf} · ${f.source}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MacroFactorsSection() {
  const [snap,    setSnap]    = useState<MacroSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchMacroSnapshot();
        if (!cancelled) { setSnap(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const factors   = snap?.factors ?? [];
  const regime    = snap?.macro_regime      ?? 'macro_neutral';
  const env       = snap?.trade_environment ?? '—';
  const driver    = snap?.primary_driver    ?? '—';
  const rawScore  = snap?.macro_score       ?? 0;
  const barScore  = Math.max(0, Math.min(100, 50 + rawScore / 2));
  const tone      = regimeTone(regime);
  const fomcDays  = snap?.fomc_days;

  const hasFred = factors.some((f) => f.source === 'fred');
  const ts = snap?.computed_at
    ? new Date(snap.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  const FACTOR_ORDER = ['dxy', 'spx', 'vix', 'ust_10y', 'hy_spread', 'cpi', 'gold'];

  return (
    <div style={scrollWrap}>
      <SectionHeader
        title="Macro Factors"
        right={
          <span style={{ fontSize: font.size.sm, color: colors.textFaint }}>
            {loading ? 'fetching…' : error ? 'error' : `updated ${ts}`}
          </span>
        }
      />

      {error && (
        <Card padding={space.md} style={{ borderColor: '#5f2a2a', backgroundColor: '#1a0a0a' }}>
          <span style={{ color: '#f44336', fontSize: font.size.md }}>{error}</span>
        </Card>
      )}

      {!hasFred && !loading && !error && (
        <Card padding={space.md} style={{ borderColor: colors.borderSubtle, backgroundColor: '#12131a', display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
          <span style={{ fontSize: font.size.lg }}>ℹ</span>
          <span style={{ fontSize: font.size.sm, color: colors.textSecondary, lineHeight: font.lineHeight.normal }}>
            <strong style={{ color: colors.text }}>FRED_API_KEY not set.</strong>{' '}
            Yield, credit spread, and CPI factors are unavailable. Add{' '}
            <code style={{ color: colors.accent }}>FRED_API_KEY</code> to the VPS{' '}
            <code style={{ color: colors.accent }}>.env</code> to enable them.
          </span>
        </Card>
      )}

      {/* Macro regime header */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.textSecondary }}>
              Macro Regime
            </span>
            <Badge tone={tone}>{REGIME_LABELS[regime] ?? regime}</Badge>
          </div>
          <span style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.text, fontFamily: font.mono }}>
            {rawScore >= 0 ? '+' : ''}{rawScore.toFixed(1)}
            <span style={{ fontSize: font.size.md, color: colors.textFaint }}> / 100</span>
          </span>
        </div>

        <ScoreBar value={barScore} tone={tone} showValue={false} />

        <div style={metaRow}>
          <Meta label="Trade Environment" value={env}    tone={envTone(env)} />
          <Meta label="Primary Driver"    value={driver} />
          <Meta
            label="Next FOMC"
            value={fomcDays != null ? `${fomcDays}d` : '—'}
            sub={fomcDays != null && fomcDays <= 7 ? 'this week' : undefined}
            tone={fomcDays != null && fomcDays <= 7 ? 'warn' : undefined}
          />
          <Meta label="Factors Active"
            value={loading ? '…' : `${factors.length} / 7`}
            sub={hasFred ? undefined : 'add FRED_API_KEY for +3'}
          />
        </div>
      </Card>

      {/* Factor cards */}
      <SectionHeader title="Factor Details" />
      <div style={grid}>
        {FACTOR_ORDER.map((name) => {
          const f = findF(factors, name);
          if (!f) return null;
          return (
            <FactorCard
              key={name}
              label={labelFor(name)}
              value={fmtFactor(name, f.raw_value)}
              direction={toDir(f.direction)}
              score={toBarScore(f.normalized_score)}
              sub={subFor(f)}
            />
          );
        })}
        {!loading && factors.length === 0 && (
          <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic', gridColumn: '1 / -1' }}>
            No macro data — check that the api container can reach yfinance and FRED.
          </span>
        )}
      </div>

      <span style={{ fontSize: font.size.sm, color: colors.textFaint, fontStyle: 'italic' }}>
        Macro is context only (40% weight in unified Context Score). Overview tab shows the combined score.
      </span>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Meta({ label, value, tone, sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '110px' }}>
      <span style={{ fontSize: font.size.sm, color: colors.textDim, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: tone === 'bull' ? colors.bull : tone === 'bear' ? colors.bear : tone === 'warn' ? colors.warn : colors.text }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: font.size.xs, color: colors.textFaint }}>{sub}</span>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const scrollWrap: CSSProperties = {
  height:        '100%',
  overflowY:     'auto',
  padding:       space.lg,
  display:       'flex',
  flexDirection: 'column',
  gap:           space.lg,
  boxSizing:     'border-box',
};

const grid: CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap:                 space.md,
};

const metaRow: CSSProperties = {
  display:    'flex',
  flexWrap:   'wrap',
  gap:        space.xl,
  borderTop:  `1px solid ${colors.borderSubtle}`,
  paddingTop: space.md,
};
