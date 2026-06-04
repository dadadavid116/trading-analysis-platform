import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerSignals, fetchFearGreed, fetchMarketGlobal } from '../../api';
import type { ScannerResponse, SymbolScanResult, FearGreedData, MarketGlobalData } from '../../api';
import { Card, Badge, ScoreBar, SectionHeader, colors, space, font, Tone } from '../../theme';

/**
 * OverviewSection — Context Desk landing view (Phase 75 shell).
 *
 * Shows a regime header + context score + asset signal tower built ENTIRELY from
 * existing endpoints (scanner signals, Fear & Greed, CoinGecko global stats).
 *
 * IMPORTANT: the score + regime here are a transparent PREVIEW heuristic, not the
 * deterministic scoring engine. That lands in Phase 82 (and macro inputs in 79–81).
 * The preview is clearly badged so it is never mistaken for authoritative output.
 */

const DISPLAY: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

function regimeFromScore(score: number): { regime: string; env: string; tone: Tone } {
  if (score >= 66) return { regime: 'Risk-On',  env: 'Favorable', tone: 'bull' };
  if (score >= 45) return { regime: 'Neutral',  env: 'Caution',   tone: 'neutral' };
  if (score >= 30) return { regime: 'Fragile',  env: 'Caution',   tone: 'warn' };
  return { regime: 'Risk-Off', env: 'Avoid', tone: 'bear' };
}

function biasToTone(bias: string): Tone {
  return bias === 'bullish' ? 'bull' : bias === 'bearish' ? 'bear' : 'neutral';
}
function biasToDirection(bias: string): string {
  return bias === 'bullish' ? '▲ Long' : bias === 'bearish' ? '▼ Short' : '─ Neutral';
}

export default function OverviewSection() {
  const [scanner, setScanner] = useState<ScannerResponse | null>(null);
  const [fng, setFng]         = useState<FearGreedData | null>(null);
  const [global, setGlobal]   = useState<MarketGlobalData | null>(null);

  useEffect(() => {
    const load = () => {
      fetchScannerSignals().then(setScanner).catch(() => {});
      fetchFearGreed().then(setFng).catch(() => {});
      fetchMarketGlobal().then(setGlobal).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const symbols      = scanner?.symbols ?? [];
  const composites   = symbols.map((s) => s.composite);
  const avgComposite = composites.length ? composites.reduce((a, b) => a + b, 0) / composites.length : 0;
  const fngVal       = fng?.value ?? 50;
  const mcap24       = global?.market_cap_change_24h ?? 0;

  // ── PREVIEW heuristic (NOT the Phase 82 engine) ───────────────────────────
  const score = Math.max(0, Math.min(100, 50 + 0.3 * (fngVal - 50) + 25 * avgComposite + 2 * mcap24));
  const { regime, env, tone } = regimeFromScore(score);

  // Primary driver = most extreme normalized input
  const drivers: { label: string; weight: number }[] = [
    { label: 'Sentiment', weight: Math.abs(fngVal - 50) / 50 },
    { label: 'Momentum',  weight: Math.abs(avgComposite) },
    { label: 'Macro',     weight: Math.min(Math.abs(mcap24) / 5, 1) },
  ];
  const primaryDriver = drivers.sort((a, b) => b.weight - a.weight)[0]?.label ?? '—';

  return (
    <div style={scrollWrap}>
      {/* Preview / education banner */}
      <Card padding={space.md} style={{ borderColor: colors.warn + '55', backgroundColor: colors.warnTint, display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
        <span style={{ fontSize: font.size.lg }}>⚠</span>
        <span style={{ fontSize: font.size.md, color: colors.textSecondary, lineHeight: font.lineHeight.normal }}>
          <strong style={{ color: colors.warn }}>Preview.</strong> This Context Desk reads the trading
          environment from existing crypto data. The score and regime below are a transparent heuristic —
          the deterministic scoring engine arrives in Phase 82 and macro factors in Phases 79–81.
        </span>
      </Card>

      {/* Regime header */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.textSecondary }}>
              Crypto Regime
            </span>
            <Badge tone={tone}>{regime}</Badge>
            <Badge tone="neutral">PREVIEW</Badge>
          </div>
          <span style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.text, fontFamily: font.mono }}>
            {Math.round(score)}<span style={{ fontSize: font.size.md, color: colors.textFaint }}> / 100</span>
          </span>
        </div>

        <ScoreBar value={score} tone={tone} showValue={false} />

        <div style={metaRow}>
          <Meta label="Trade Environment" value={env} tone={tone} />
          <Meta label="Primary Driver"    value={primaryDriver} />
          <Meta label="Next Major Event"  value="—" sub="macro calendar: Phase 81" />
          <Meta label="Fear & Greed"      value={fng ? `${fng.value} ${fng.label}` : '—'} />
        </div>
      </Card>

      {/* Asset Signal Tower */}
      <SectionHeader title="Asset Signal Tower" right={<Badge tone="neutral">crypto · live scanner</Badge>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {symbols.length === 0 && (
          <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic' }}>Loading scanner…</span>
        )}
        {symbols.map((s) => <SignalRow key={s.symbol} s={s} />)}
        {/* Non-crypto rows (DXY/Gold/UST/SPX) are context-only and arrive with macro factors. */}
        <span style={{ fontSize: font.size.sm, color: colors.textFaint, fontStyle: 'italic', paddingTop: space.xs }}>
          Macro rows (DXY · Gold · UST 10Y · SPX) are added in Phase 81 — context only, not cross-asset trading.
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function Meta({ label, value, tone, sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '120px' }}>
      <span style={{ fontSize: font.size.sm, color: colors.textDim, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: tone === 'bull' ? colors.bull : tone === 'bear' ? colors.bear : tone === 'warn' ? colors.warn : colors.text }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: font.size.xs, color: colors.textFaint }}>{sub}</span>}
    </div>
  );
}

function SignalRow({ s }: { s: SymbolScanResult }) {
  const tone      = biasToTone(s.bias);
  const keyDriver = s.signals[0]?.label ?? 'no active signals';
  const keyRisk   = s.signals.find((sig) => sig.direction !== s.bias && sig.direction !== 'neutral')?.label;
  const c         = tone === 'bull' ? colors.bull : tone === 'bear' ? colors.bear : colors.textMuted;
  return (
    <Card padding={space.md} style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, width: '42px', flexShrink: 0 }}>
        {DISPLAY[s.symbol] ?? s.symbol}
      </span>
      <span style={{ width: '74px', flexShrink: 0 }}>
        <Badge tone={tone}>{biasToDirection(s.bias)}</Badge>
      </span>
      <span style={{ fontFamily: font.mono, fontSize: font.size.md, color: c, width: '54px', flexShrink: 0 }}>
        {s.composite > 0 ? '+' : ''}{s.composite.toFixed(2)}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: font.size.md, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {keyDriver}
        </span>
        {keyRisk && (
          <span style={{ fontSize: font.size.xs, color: colors.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            risk: {keyRisk}
          </span>
        )}
      </div>
      <span style={{ fontSize: font.size.sm, color: colors.textFaint, flexShrink: 0 }}>{s.signal_count} sig</span>
    </Card>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const scrollWrap: CSSProperties = {
  height:        '100%',
  overflowY:     'auto',
  padding:       space.lg,
  display:       'flex',
  flexDirection: 'column',
  gap:           space.lg,
  boxSizing:     'border-box',
};

const metaRow: CSSProperties = {
  display:  'flex',
  flexWrap: 'wrap',
  gap:      space.xl,
  borderTop: `1px solid ${colors.borderSubtle}`,
  paddingTop: space.md,
};
