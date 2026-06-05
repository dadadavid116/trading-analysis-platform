import { useState, useEffect, CSSProperties } from 'react';
import { fetchScannerSignals, fetchFactorSnapshot } from '../../api';
import type { ScannerResponse, SymbolScanResult, FactorSnapshot } from '../../api';
import { Card, Badge, ScoreBar, SectionHeader, colors, space, font, Tone } from '../../theme';

/**
 * OverviewSection — Context Desk landing view (Phase 79 upgrade).
 *
 * Regime, score, and trade environment are now computed from live crypto factor
 * data (Phase 79 factor_scorer). The PREVIEW heuristic has been replaced by the
 * deterministic scoring engine. Macro factors add in Phase 81.
 *
 * Asset Signal Tower continues to use scanner signals (live, no change).
 */

const DISPLAY: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

const REGIME_LABELS: Record<string, string> = {
  risk_on:       'Risk-On',
  neutral:       'Neutral',
  fragile:       'Fragile',
  risk_off:      'Risk-Off',
  crowded_long:  'Crowded Long',
  crowded_short: 'Crowded Short',
};

function regimeTone(regime: string): Tone {
  if (regime === 'risk_on')       return 'bull';
  if (regime === 'risk_off')      return 'bear';
  if (regime === 'crowded_long' || regime === 'crowded_short') return 'warn';
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

export default function OverviewSection() {
  const [scanner,  setScanner]  = useState<ScannerResponse | null>(null);
  const [snapshot, setSnapshot] = useState<FactorSnapshot | null>(null);

  useEffect(() => {
    const loadScanner = () =>
      fetchScannerSignals().then(setScanner).catch(() => {});
    const loadFactor = () =>
      fetchFactorSnapshot('BTCUSDT').then(setSnapshot).catch(() => {});

    loadScanner();
    loadFactor();

    const scanId   = setInterval(loadScanner, 30_000);
    const factorId = setInterval(loadFactor, 3 * 60 * 1000);
    return () => { clearInterval(scanId); clearInterval(factorId); };
  }, []);

  const symbols  = scanner?.symbols ?? [];
  const regime   = snapshot?.regime ?? 'neutral';
  const env      = snapshot?.trade_environment ?? '—';
  const driver   = snapshot?.primary_driver ?? '—';
  const rawScore = snapshot?.crypto_score ?? 0;    // -100 to +100
  const barScore = Math.max(0, Math.min(100, 50 + rawScore / 2));  // map to 0–100

  const fngFactor = snapshot?.factors.find((f) => f.factor_name === 'fear_greed');

  const tone = regimeTone(regime);

  return (
    <div style={scrollWrap}>
      {/* Info banner */}
      <Card padding={space.md} style={{ borderColor: colors.borderSubtle, backgroundColor: '#12131a', display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
        <span style={{ fontSize: font.size.lg }}>ℹ</span>
        <span style={{ fontSize: font.size.md, color: colors.textSecondary, lineHeight: font.lineHeight.normal }}>
          <strong style={{ color: colors.text }}>Crypto factors only.</strong> Regime and score are computed from live
          derivatives, liquidity, and sentiment data. Macro factors (DXY · yields · SPX · VIX) add in Phase 81.
        </span>
      </Card>

      {/* Regime header */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.textSecondary }}>
              Crypto Regime
            </span>
            <Badge tone={tone}>{REGIME_LABELS[regime] ?? regime}</Badge>
            <Badge tone="neutral">CRYPTO ONLY</Badge>
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
          <Meta label="Next Major Event"  value="—" sub="macro calendar: Phase 81" />
          <Meta
            label="Fear & Greed"
            value={fngFactor ? `${fngFactor.raw_value?.toFixed(0)} · ${fngFactor.direction}` : snapshot ? '—' : '…'}
          />
        </div>
      </Card>

      {/* Asset Signal Tower */}
      <SectionHeader title="Asset Signal Tower" right={<Badge tone="neutral">crypto · live scanner</Badge>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {symbols.length === 0 && (
          <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic' }}>Loading scanner…</span>
        )}
        {symbols.map((s) => <SignalRow key={s.symbol} s={s} />)}
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
  display:    'flex',
  flexWrap:   'wrap',
  gap:        space.xl,
  borderTop:  `1px solid ${colors.borderSubtle}`,
  paddingTop: space.md,
};
