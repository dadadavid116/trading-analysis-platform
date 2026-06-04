/**
 * theme/tokens.ts — design tokens for the platform UI.
 *
 * Phase 74 (Design System Foundation). The app has historically used ad-hoc inline
 * CSSProperties everywhere. These tokens are the single source of truth for colors,
 * spacing, typography, radius, shadows, and density so future redesign work does not
 * mean editing hex values per panel.
 *
 * Values match the existing dark palette so adopting tokens causes no visual drift.
 * New components (see primitives.tsx) should consume these; existing panels can be
 * migrated incrementally.
 */

export const colors = {
  // ── Surfaces ──────────────────────────────────────────────────────────────
  appBg:        '#0f1117',   // page background
  surface:      '#16161a',   // panel header / card background
  surfaceAlt:   '#111115',   // toolbars, console bars
  surfaceInput: '#111114',   // input fields
  surfaceInk:   '#0d0d10',   // deepest insets

  // ── Borders ───────────────────────────────────────────────────────────────
  border:       '#2a2a2e',
  borderSubtle: '#1e1e22',
  borderStrong: '#3a3a4e',

  // ── Text ──────────────────────────────────────────────────────────────────
  text:          '#e0e0e0',
  textSecondary: '#c8c8c8',
  textMuted:     '#888888',
  textDim:       '#666666',
  textFaint:     '#555555',

  // ── Accent (blue) ───────────────────────────────────────────────────────────
  accent:       '#90b8e0',
  accentStrong: '#3a6a9f',
  accentBg:     '#1a2a4a',
  accentBgSoft: '#1e3a5f',

  // ── Semantic ────────────────────────────────────────────────────────────────
  bull:    '#33aa66',
  bullAlt: '#26a69a',
  bear:    '#cc3333',
  bearAlt: '#ef5350',
  warn:    '#f5a623',
  warnAlt: '#f0a020',
  gold:    '#ffd54f',
  danger:  '#f44336',

  // ── Tints (low-opacity fills for badges/bars) ─────────────────────────────
  bullTint: '#33aa6618',
  bearTint: '#cc333318',
  warnTint: '#f5a62318',
  accentTint: '#90b8e018',
} as const;

export const space = {
  xs:  '2px',
  sm:  '4px',
  md:  '8px',
  lg:  '12px',
  xl:  '16px',
  xxl: '24px',
} as const;

export const radius = {
  sm:   '3px',
  md:   '4px',
  lg:   '6px',
  xl:   '8px',
  pill: '999px',
} as const;

export const font = {
  family: 'inherit',
  mono:   "'SF Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
  size: {
    xs:   '9px',
    sm:   '10px',
    md:   '11px',
    base: '12px',
    lg:   '13px',
    xl:   '15px',
    xxl:  '20px',
  },
  weight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  lineHeight: {
    tight:  1.2,
    normal: 1.5,
  },
} as const;

export const shadow = {
  sm: '0 2px 8px rgba(0,0,0,0.4)',
  md: '0 4px 16px rgba(0,0,0,0.5)',
  lg: '0 6px 24px rgba(0,0,0,0.6)',
} as const;

/**
 * Density modes — later wired to a Settings preference (Phase 96).
 * For now `compact` matches the current dense dashboard feel.
 */
export const density = {
  compact: { rowPadY: '2px', gap: space.sm, fontSize: font.size.md },
  normal:  { rowPadY: '4px', gap: space.md, fontSize: font.size.base },
} as const;

export type DensityMode = keyof typeof density;

/** Semantic tone → color, used by Badge / FactorCard / ScoreBar. */
export type Tone = 'neutral' | 'accent' | 'bull' | 'bear' | 'warn';

export const toneColor: Record<Tone, string> = {
  neutral: colors.textMuted,
  accent:  colors.accent,
  bull:    colors.bull,
  bear:    colors.bear,
  warn:    colors.warn,
};

export const toneTint: Record<Tone, string> = {
  neutral: 'transparent',
  accent:  colors.accentTint,
  bull:    colors.bullTint,
  bear:    colors.bearTint,
  warn:    colors.warnTint,
};
