import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerSignals, fetchContextScore } from '../../api';
import type { ScannerResponse, SymbolScanResult, ContextScore } from '../../api';
import { Card, Badge, ScoreBar, FactorCard, SectionHeader, colors, space, font, Tone } from '../../theme';

/**
 * OverviewSection — Context Desk landing view (Phase 82 upgrade).
 *
 * Context Score is now the unified composite of crypto (60%) + macro (40%) factor
 * scores. The PREVIEW/CRYPTO-ONLY badges are removed; data is live from Phase 82
 * Factor Scoring Engine. Asset Signal Tower (scanner signals) is unchanged.
 */

const DISPLAY: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

const REGIME_LABELS: Record<string, string> = {
  risk_on:         'Risk-On',
  neutral_bullish: 'Neutral-Bullish',
  neutral:         'Neutral',
  neutral_bearish: 'Neutral-Bearish',
  risk_off:        'Risk-Off',
};

function regimeTone(regime: string): Tone {
  if (regime === 'risk_on')         return 'bull';
  if (regime === 'risk_off')        return 'bear';
  if (regime === 'neutral_bearish') return 'warn';
  return 'neutral';
}

function envTone(env: string): Tone {
  if (env === 'Favorable') return 'bull';
  if (env === 'Avoid')     return 'bear';
  return 'warn';
}

function biasToTone(bias: string): Tone {
  return bias === 'bullish' ? 'bull' : bias === 'bearish' ? 'bear' : 'neutral';
}

function biasToDirection(bias: string): string {
  return bias === 'bullish' ? '▲ Long' : bias === 'bearish' ? '▼ Short' : '─ Neutral';
}

function subDir(score: number | null | undefined): 'long' | 'short' | 'neutral' {
  if (score == null) return 'neutral';
  if (score > 15)   return 'long';
  if (score < -15)  return 'short';
  return 'neutral';
}

function fmt(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${score >= 0 ? '+' : ''}${score.toFixed(1)}`;
}

function toBarScore(score: number | null | undefined): number {
  if (score == null) return 50;
  return Math.max(0, Math.min(100, 50 + score / 2));
}

export default function OverviewSection() {
  const [scanner, setScanner] = useState<ScannerResponse | null>(null);
  const [ctx,     setCtx]     = useState<ContextScore | null>(null);

  useEffect(() => {
    const loadScanner = () => fetchScannerSignals().then(setScanner).catch(() => {});
    const loadCtx     = () => fetchContextScore('BTCUSDT').then(setCtx).catch(() => {});

    loadScanner();
    loadCtx();

    const scanId = setInterval(loadScanner, 30_000);
    const ctxId  = setInterval(loadCtx, 15 * 60 * 1000);
    return () => { clearInterval(scanId); clearInterval(ctxId); };
  }, []);

  const symbols     = scanner?.symbols ?? [];
  const regime      = ctx?.regime            ?? 'neutral';
  const env         = ctx?.trade_environment ?? '—';
  const rawScore    = ctx?.context_score     ?? 0;
  const cryptoScore = ctx?.crypto_score      ?? null;
  const macroScore  = ctx?.macro_score       ?? null;
  const consensus   = ctx?.consensus         ?? 'neutral';
  const confidence  = ctx?.confidence        ?? 0;
  const barScore    = toBarScore(rawScore);
  const tone        = regimeTone(regime);

  return (
    <div style={scrollWrap}>
      {/* ── Context Score header ─────────────────────────────────────────── */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.textSecondary }}>
              Context Score
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
          <Meta label="Trade Environment" value={env}                              tone={envTone(env)} />
          <Meta label="Crypto 60%"        value={fmt(cryptoScore)}                 sub="derivatives · liquidity · sentiment" />
          <Meta label="Macro 40%"         value={fmt(macroScore)}                  sub={macroScore == null ? 'no data' : 'DXY · rates · VIX · SPX'} />
          <Meta label="Confidence"        value={`${(confidence * 100).toFixed(0)}%`} />
        </div>

        {/* Consensus bar */}
        <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, paddingTop: space.md, display: 'flex', flexDirection: 'column', gap: space.sm }}>
          <span style={{ fontSize: font.size.sm, color: colors.textDim, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            Consensus
          </span>
          <ConsensusBar consensus={consensus} />
        </div>
      </Card>

      {/* ── Factor Contribution Cards ────────────────────────────────────── */}
      <SectionHeader title="Factor Contributions" />
      <div style={grid}>
        <FactorCard
          label="Crypto Factors"
          value={fmt(cryptoScore)}
          direction={subDir(cryptoScore)}
          score={toBarScore(cryptoScore)}
          sub="60% weight · Phase 79"
        />
        <FactorCard
          label="Macro Factors"
          value={fmt(macroScore)}
          direction={subDir(macroScore)}
          score={toBarScore(macroScore)}
          sub="40% weight · Phase 81"
        />
        <FactorCard
          label="News / Catalyst"
          value="—"
          direction="neutral"
          score={50}
          sub="0% weight · Phase 96"
        />
      </div>

      {/* ── Asset Signal Tower ───────────────────────────────────────────── */}
      <SectionHeader title="Asset Signal Tower" right={<Badge tone="neutral">live scanner</Badge>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {symbols.length === 0 && (
          <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic' }}>Loading scanner…</span>
        )}
        {symbols.map((s) => <SignalRow key={s.symbol} s={s} />)}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Meta({ label, value, tone, sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '110px' }}>
      <span style={{ fontSize: font.size.sm, color: colors.textDim, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: tone === 'bull' ? colors.bull : tone === 'bear' ? colors.bear : tone === 'warn' ? colors.warn : colors.text }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: font.size.xs, color: colors.textFaint }}>{sub}</span>}
    </div>
  );
}

const CONSENSUS_SEGMENTS: { key: string; label: string; colorFn: (c: typeof colors) => string }[] = [
  { key: 'short',   label: '▼ Short',   colorFn: (c) => c.bear },
  { key: 'neutral', label: '─ Neutral', colorFn: (c) => c.textMuted },
  { key: 'long',    label: '▲ Long',    colorFn: (c) => c.bull },
];

function ConsensusBar({ consensus }: { consensus: string }) {
  return (
    <div style={{ display: 'flex', gap: space.sm }}>
      {CONSENSUS_SEGMENTS.map(({ key, label, colorFn }) => {
        const active = key === consensus;
        const color  = active ? colorFn(colors) : colors.textFaint;
        return (
          <div
            key={key}
            style={{
              flex:            1,
              textAlign:       'center',
              padding:         `${space.sm} ${space.md}`,
              border:          `1px solid ${active ? color : colors.borderSubtle}`,
              borderRadius:    '4px',
              fontSize:        font.size.md,
              fontWeight:      active ? font.weight.semibold : font.weight.normal,
              color,
              backgroundColor: active ? `${color}1a` : 'transparent',
            }}
          >
            {label}
          </div>
        );
      })}
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

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  display:    'flex',
  flexWrap:   'wrap',
  gap:        space.xl,
  borderTop:  `1px solid ${colors.borderSubtle}`,
  paddingTop: space.md,
};

const grid: CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap:                 space.md,
};
