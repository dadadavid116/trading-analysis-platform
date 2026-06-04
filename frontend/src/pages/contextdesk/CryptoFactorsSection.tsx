import { useState, useEffect, CSSProperties } from 'react';
import {
  fetchFearGreed, fetchMarketGlobal, fetchFundingRate, fetchOpenInterest,
  fetchLSRatio, fetchRelativeStrength,
} from '../../api';
import type {
  FearGreedData, MarketGlobalData, FundingRateData, OpenInterestData,
  LSRatioData, RelativeStrengthEntry,
} from '../../api';
import { FactorCard, SectionHeader, Card, colors, space, font } from '../../theme';

/**
 * CryptoFactorsSection — Context Desk "Crypto" tab (Phase 75 shell).
 *
 * A grid of crypto-native factor cards built from existing endpoints, using BTC as the
 * market bellwether for derivatives factors. No new collectors — that is Phase 79.
 * Directions shown are indicative previews, not the Phase 82 scored stance.
 */

const DISPLAY: Record<string, string> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

type Direction = 'long' | 'short' | 'neutral';

function fmtUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  return `$${n.toLocaleString()}`;
}

export default function CryptoFactorsSection() {
  const [fng, setFng]       = useState<FearGreedData | null>(null);
  const [global, setGlobal] = useState<MarketGlobalData | null>(null);
  const [funding, setFund]  = useState<FundingRateData | null>(null);
  const [oi, setOi]         = useState<OpenInterestData | null>(null);
  const [ls, setLs]         = useState<LSRatioData | null>(null);
  const [rs, setRs]         = useState<RelativeStrengthEntry[]>([]);

  useEffect(() => {
    const load = () => {
      fetchFearGreed().then(setFng).catch(() => {});
      fetchMarketGlobal().then(setGlobal).catch(() => {});
      fetchFundingRate('BTCUSDT').then(setFund).catch(() => {});
      fetchOpenInterest('BTCUSDT').then(setOi).catch(() => {});
      fetchLSRatio('BTCUSDT').then(setLs).catch(() => {});
      fetchRelativeStrength().then(setRs).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const fngDir: Direction   = fng ? (fng.value > 55 ? 'long' : fng.value < 45 ? 'short' : 'neutral') : 'neutral';
  const mcap24              = global?.market_cap_change_24h ?? 0;
  const mcapDir: Direction  = mcap24 > 0.2 ? 'long' : mcap24 < -0.2 ? 'short' : 'neutral';
  const fundDir: Direction  = funding ? (funding.sentiment === 'bullish' ? 'long' : funding.sentiment === 'bearish' ? 'short' : 'neutral') : 'neutral';
  const lsGlobal            = ls?.global_account ?? ls?.top_account ?? null;

  return (
    <div style={scrollWrap}>
      <SectionHeader title="Crypto Factors" right={<span style={{ fontSize: font.size.sm, color: colors.textFaint }}>BTC bellwether · live</span>} />

      <div style={grid}>
        <FactorCard
          label="Fear & Greed"
          value={fng ? `${fng.value} · ${fng.label}` : '—'}
          direction={fngDir}
          score={fng?.value}
        />
        <FactorCard
          label="Total Mkt Cap 24h"
          value={`${mcap24 >= 0 ? '+' : ''}${mcap24.toFixed(2)}%`}
          direction={mcapDir}
          sub={global ? fmtUsd(global.total_market_cap_usd) : undefined}
        />
        <FactorCard
          label="BTC Dominance"
          value={global ? `${global.btc_dominance.toFixed(1)}%` : '—'}
          direction="neutral"
          sub={global ? `ETH ${global.eth_dominance.toFixed(1)}%` : undefined}
        />
        <FactorCard
          label="BTC Funding"
          value={funding ? `${(funding.funding_rate * 100).toFixed(4)}%` : '—'}
          direction={fundDir}
          sub={funding?.sentiment}
        />
        <FactorCard
          label="BTC Open Interest"
          value={oi ? oi.oi_value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
          direction="neutral"
          sub={oi?.trend}
        />
        <FactorCard
          label="BTC Long/Short"
          value={lsGlobal ? `${lsGlobal.long_pct.toFixed(0)}% / ${lsGlobal.short_pct.toFixed(0)}%` : '—'}
          direction="neutral"
          sub={lsGlobal ? 'long / short accounts' : undefined}
        />
      </div>

      {/* Relative strength strip */}
      <SectionHeader title="Relative Strength (24h)" />
      <Card padding={space.md} style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap' }}>
        {rs.length === 0 && <span style={{ fontSize: font.size.md, color: colors.textFaint, fontStyle: 'italic' }}>Loading…</span>}
        {rs.map((e) => {
          const up = e.change_pct_24h >= 0;
          return (
            <div key={e.symbol} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: font.size.md, color: colors.textMuted }}>{DISPLAY[e.symbol] ?? e.display_name}</span>
              <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, fontFamily: font.mono, color: up ? colors.bull : colors.bear }}>
                {up ? '+' : ''}{e.change_pct_24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </Card>

      <span style={{ fontSize: font.size.sm, color: colors.textFaint, fontStyle: 'italic' }}>
        Directions are indicative previews. Normalized factor scoring + weights arrive in Phases 79/82.
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
