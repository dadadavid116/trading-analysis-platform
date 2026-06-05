import { useState, useEffect, CSSProperties } from 'react';
import { fetchFactorSnapshot } from '../../api';
import type { FactorSnapshot, FactorObservation } from '../../api';
import { FactorCard, SectionHeader, Card, colors, space, font } from '../../theme';

/**
 * CryptoFactorsSection — Context Desk "Crypto" tab (Phase 79).
 *
 * Upgraded from Phase 75 placeholder to live normalized factor scores.
 * All directions are now deterministic (computed from live DB data + external APIs).
 * Macro factors add in Phase 81.
 */

type FcDir = 'long' | 'short' | 'neutral';

function toDir(d: string): FcDir {
  if (d === 'bullish') return 'long';
  if (d === 'bearish') return 'short';
  return 'neutral';
}

function toBarScore(normalizedScore: number): number {
  return Math.round(50 + normalizedScore * 50);
}

function findFactor(factors: FactorObservation[], name: string): FactorObservation | undefined {
  return factors.find((f) => f.factor_name === name);
}

function fmtPct(v: number | null | undefined, decimals = 4): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtRaw(v: number | null | undefined, decimals = 3): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function SubScore({
  label, score, description,
}: {
  label: string; score: number; description: string;
}) {
  const dir: FcDir = score > 0.1 ? 'long' : score < -0.1 ? 'short' : 'neutral';
  const color = dir === 'long' ? colors.bull : dir === 'short' ? colors.bear : colors.textMuted;
  return (
    <Card padding={space.md} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      <span style={{ fontSize: font.size.md, color: colors.textMuted }}>{label}</span>
      <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, fontFamily: font.mono, color }}>
        {score >= 0 ? '+' : ''}{score.toFixed(2)}
      </span>
      <span style={{ fontSize: font.size.sm, color: colors.textFaint }}>{description}</span>
    </Card>
  );
}

export default function CryptoFactorsSection() {
  const [snapshot, setSnapshot] = useState<FactorSnapshot | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchFactorSnapshot('BTCUSDT');
        if (!cancelled) { setSnapshot(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 3 * 60 * 1000);  // refresh every 3 min
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const factors = snapshot?.factors ?? [];

  const fundingF  = findFactor(factors, 'funding_rate');
  const oiF       = findFactor(factors, 'oi_delta');
  const lsF       = findFactor(factors, 'ls_ratio');
  const liqF      = findFactor(factors, 'liq_pressure');
  const obF       = findFactor(factors, 'ob_imbalance');
  const fngF      = findFactor(factors, 'fear_greed');
  const mcapF     = findFactor(factors, 'total_mcap_24h');

  const deriv = snapshot?.derivatives_pressure ?? 0;
  const liqP  = snapshot?.liquidity_pressure  ?? 0;

  const ts = snapshot?.computed_at
    ? new Date(snapshot.computed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={scrollWrap}>
      <SectionHeader
        title="Crypto Factors"
        right={
          <span style={{ fontSize: font.size.sm, color: colors.textFaint }}>
            {loading ? 'computing…' : error ? 'error' : `updated ${ts}`}
          </span>
        }
      />

      {error && (
        <Card padding={space.md} style={{ borderColor: '#5f2a2a', backgroundColor: '#1a0a0a' }}>
          <span style={{ color: '#f44336', fontSize: font.size.md }}>{error}</span>
        </Card>
      )}

      {/* Sub-score summary row */}
      <div style={subScoreGrid}>
        <SubScore
          label="Derivatives Pressure"
          score={deriv}
          description="Funding · L/S ratio · OI delta"
        />
        <SubScore
          label="Liquidity Pressure"
          score={liqP}
          description="Liq flow · Order book depth"
        />
      </div>

      {/* Individual factor cards */}
      <SectionHeader title="Factor Details" />
      <div style={grid}>
        {fundingF && (
          <FactorCard
            label="BTC Funding Rate"
            value={fmtPct(fundingF.raw_value)}
            direction={toDir(fundingF.direction)}
            score={toBarScore(fundingF.normalized_score)}
            sub={`confidence ${(fundingF.confidence * 100).toFixed(0)}% · binance`}
          />
        )}
        {lsF && (
          <FactorCard
            label="BTC Long / Short"
            value={`${((lsF.raw_value ?? 0) * 100).toFixed(1)}% long`}
            direction={toDir(lsF.direction)}
            score={toBarScore(lsF.normalized_score)}
            sub={`confidence ${(lsF.confidence * 100).toFixed(0)}% · binance`}
          />
        )}
        {oiF && (
          <FactorCard
            label="OI Delta (1H)"
            value={`${(oiF.raw_value ?? 0) >= 0 ? '+' : ''}${fmtRaw(oiF.raw_value, 2)}%`}
            direction={toDir(oiF.direction)}
            score={toBarScore(oiF.normalized_score)}
            sub={`confidence ${(oiF.confidence * 100).toFixed(0)}% · binance`}
          />
        )}
        {liqF && (
          <FactorCard
            label="Liq Pressure (1H)"
            value={`${((liqF.raw_value ?? 0) * 100).toFixed(1)}% sell-side`}
            direction={toDir(liqF.direction)}
            score={toBarScore(liqF.normalized_score)}
            sub={`confidence ${(liqF.confidence * 100).toFixed(0)}% · okx`}
          />
        )}
        {obF && (
          <FactorCard
            label="OB Imbalance"
            value={`${((obF.raw_value ?? 0) * 100).toFixed(1)}% bid-side`}
            direction={toDir(obF.direction)}
            score={toBarScore(obF.normalized_score)}
            sub={`confidence ${(obF.confidence * 100).toFixed(0)}% · okx`}
          />
        )}
        {fngF && (
          <FactorCard
            label="Fear & Greed"
            value={`${fngF.raw_value?.toFixed(0) ?? '—'} · ${fngF.direction}`}
            direction={toDir(fngF.direction)}
            score={toBarScore(fngF.normalized_score)}
            sub="contrarian · alternative.me"
          />
        )}
        {mcapF && (
          <FactorCard
            label="Total MCap 24H"
            value={`${(mcapF.raw_value ?? 0) >= 0 ? '+' : ''}${fmtRaw(mcapF.raw_value, 2)}%`}
            direction={toDir(mcapF.direction)}
            score={toBarScore(mcapF.normalized_score)}
            sub="market momentum · coingecko"
          />
        )}
        {!loading && factors.length === 0 && (
          <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic', gridColumn: '1 / -1' }}>
            No factor data — collectors may still be warming up.
          </span>
        )}
      </div>

      <span style={{ fontSize: font.size.sm, color: colors.textFaint, fontStyle: 'italic' }}>
        Crypto factors only — macro layer (DXY · yields · SPX · VIX) adds in Phase 81.
      </span>
    </div>
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

const grid: CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap:                 space.md,
};

const subScoreGrid: CSSProperties = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap:                 space.md,
};
