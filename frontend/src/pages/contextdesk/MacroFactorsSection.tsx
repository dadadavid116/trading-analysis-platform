import { CSSProperties } from 'react';
import { Card, SectionHeader, Badge, colors, space, font, radius } from '../../theme';

/**
 * MacroFactorsSection — Context Desk "Macro" tab (Phase 75 shell, placeholder).
 *
 * Macro factor collection is intentionally deferred:
 *   Phase 80 — Macro Source Decision Matrix (decide providers/limits/caching)
 *   Phase 81 — Macro Factor Collector Pack (actually collect)
 *   Phase 82 — Factor Scoring Engine (score + weight)
 *
 * This tab is an honest empty-state listing the planned factors so the workspace
 * shape is visible without faking data.
 */

const PLANNED = [
  { group: 'USD & Rates', items: ['DXY / USD pressure', 'UST 2Y / 10Y / 30Y', 'Yield-curve slope', 'Real yields'] },
  { group: 'Risk Assets', items: ['Gold', 'SPX / Nasdaq', 'VIX / MOVE'] },
  { group: 'Macro Events', items: ['CPI / PCE', 'NFP', 'FOMC calendar', 'Inflation-pressure proxy'] },
];

export default function MacroFactorsSection() {
  return (
    <div style={scrollWrap}>
      <SectionHeader title="Macro Factors" right={<Badge tone="warn">Pending · Phase 80–81</Badge>} />

      <Card padding={space.lg} style={{ display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
        <span style={{ fontSize: font.size.lg }}>🧭</span>
        <span style={{ fontSize: font.size.md, color: colors.textSecondary, lineHeight: font.lineHeight.normal }}>
          Macro context is added as a <strong style={{ color: colors.text }}>supporting</strong> layer — never the
          headline. Providers and rate/caching rules are decided in <strong style={{ color: colors.accent }}>Phase 80</strong>
          {' '}(Macro Source Decision Matrix), collected in <strong style={{ color: colors.accent }}>Phase 81</strong>, and
          scored in <strong style={{ color: colors.accent }}>Phase 82</strong>. No live macro data yet.
        </span>
      </Card>

      <div style={grid}>
        {PLANNED.map((g) => (
          <Card key={g.group} padding={space.md} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.textMuted }}>{g.group}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
              {g.items.map((it) => (
                <div key={it} style={planRow}>
                  <span style={{ fontSize: font.size.md, color: colors.textDim }}>{it}</span>
                  <span style={{ fontSize: font.size.xs, color: colors.textFaint }}>—</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
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
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap:                 space.md,
};

const planRow: CSSProperties = {
  display:         'flex',
  justifyContent:  'space-between',
  alignItems:      'center',
  padding:         `${space.xs} ${space.sm}`,
  backgroundColor: colors.surfaceInk,
  border:          `1px solid ${colors.borderSubtle}`,
  borderRadius:    radius.sm,
};
