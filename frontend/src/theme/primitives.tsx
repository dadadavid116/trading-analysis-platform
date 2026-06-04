/**
 * theme/primitives.tsx — reusable UI primitives built on the design tokens.
 *
 * Phase 74 (Design System Foundation). These are the shared building blocks for new
 * workspaces (Context Desk, future Execution/Review). They use inline styles sourced
 * from tokens.ts — no CSS framework, consistent with the existing codebase — but
 * centralize the look so panels stop re-deriving it.
 *
 * Provided: Card, Button, Badge, Tabs, SectionHeader, MetricCard, ScoreBar,
 * FactorCard, WorkspaceShell.
 */

import { CSSProperties, ReactNode } from 'react';
import { colors, space, radius, font, Tone, toneColor, toneTint } from './tokens';
import { useIsMobile } from '../hooks/useIsMobile';

// ── Card ────────────────────────────────────────────────────────────────────────

export function Card({
  children, style, padding = space.lg, raised = false,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: string;
  raised?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: colors.surface,
        border:          `1px solid ${colors.border}`,
        borderRadius:    radius.lg,
        padding,
        boxShadow:       raised ? '0 4px 16px rgba(0,0,0,0.5)' : 'none',
        boxSizing:       'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { backgroundColor: colors.accentBg,  border: `1px solid ${colors.accentStrong}`, color: colors.accent },
  ghost:   { backgroundColor: 'transparent',    border: `1px solid ${colors.border}`,       color: colors.textMuted },
  danger:  { backgroundColor: 'transparent',    border: `1px solid ${colors.bear}`,         color: colors.bearAlt },
  subtle:  { backgroundColor: colors.surfaceAlt, border: `1px solid ${colors.borderSubtle}`, color: colors.textSecondary },
};

export function Button({
  children, onClick, variant = 'ghost', size = 'md', disabled = false, title, style,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
}) {
  const pad = size === 'sm' ? `${space.xs} ${space.md}` : `${space.sm} ${space.lg}`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...buttonVariants[variant],
        borderRadius: radius.md,
        padding:      pad,
        fontSize:     size === 'sm' ? font.size.md : font.size.base,
        fontWeight:   font.weight.semibold,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        opacity:      disabled ? 0.5 : 1,
        whiteSpace:   'nowrap',
        transition:   'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────────

export function Badge({
  children, tone = 'neutral', style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: CSSProperties;
}) {
  const c = toneColor[tone];
  return (
    <span
      style={{
        display:         'inline-block',
        fontSize:        font.size.xs,
        fontWeight:      font.weight.bold,
        letterSpacing:   '0.04em',
        padding:         `1px ${space.sm}`,
        borderRadius:    radius.sm,
        color:           c,
        backgroundColor: toneTint[tone],
        border:          `1px solid ${tone === 'neutral' ? colors.border : c + '55'}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────────

export interface TabDef { id: string; label: string; }

export function Tabs({
  items, active, onChange, variant = 'top',
}: {
  items: TabDef[];
  active: string;
  onChange: (id: string) => void;
  variant?: 'top' | 'bottom';
}) {
  const isBottom = variant === 'bottom';
  return (
    <div
      style={{
        display:         'flex',
        gap:             isBottom ? 0 : space.xs,
        padding:         isBottom ? 0 : `${space.md} ${space.lg}`,
        borderTop:       isBottom ? `1px solid ${colors.borderSubtle}` : undefined,
        borderBottom:    isBottom ? undefined : `1px solid ${colors.borderSubtle}`,
        backgroundColor: colors.surfaceAlt,
        flexShrink:      0,
        height:          isBottom ? '52px' : undefined,
      }}
    >
      {items.map((t) => {
        const on = t.id === active;
        const base: CSSProperties = isBottom
          ? {
              flex:            1,
              backgroundColor: on ? colors.accentBg : 'transparent',
              border:          'none',
              borderTop:       on ? `2px solid ${colors.accentStrong}` : '2px solid transparent',
              color:           on ? colors.accent : colors.textFaint,
              fontWeight:      on ? font.weight.bold : font.weight.medium,
              padding:         '4px 0 6px',
            }
          : {
              backgroundColor: on ? colors.accentBg : 'transparent',
              border:          `1px solid ${on ? colors.accentStrong : 'transparent'}`,
              borderRadius:    radius.md,
              color:           on ? colors.accent : colors.textFaint,
              fontWeight:      on ? font.weight.bold : font.weight.normal,
              padding:         `${space.sm} ${space.lg}`,
            };
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{ ...base, cursor: 'pointer', fontSize: font.size.md, transition: 'all 0.15s' }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({
  title, right,
}: {
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        borderBottom:   `1px solid ${colors.border}`,
        paddingBottom:  space.md,
      }}
    >
      <span style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.textSecondary }}>
        {title}
      </span>
      {right}
    </div>
  );
}

// ── MetricCard ──────────────────────────────────────────────────────────────────

export function MetricCard({
  label, value, sub, delta, deltaTone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaTone?: Tone;
}) {
  return (
    <Card padding={space.lg} style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      <span style={{ fontSize: font.size.sm, color: colors.textDim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md }}>
        <span style={{ fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.text, fontFamily: font.mono }}>
          {value}
        </span>
        {delta != null && (
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: toneColor[deltaTone] }}>
            {delta}
          </span>
        )}
      </div>
      {sub != null && <span style={{ fontSize: font.size.sm, color: colors.textFaint }}>{sub}</span>}
    </Card>
  );
}

// ── ScoreBar ────────────────────────────────────────────────────────────────────

export function ScoreBar({
  value, max = 100, tone = 'accent', label, showValue = true,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: ReactNode;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const c = toneColor[tone];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs }}>
      {(label != null || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm }}>
          {label != null && <span style={{ color: colors.textMuted }}>{label}</span>}
          {showValue && <span style={{ color: c, fontFamily: font.mono, fontWeight: font.weight.semibold }}>{Math.round(value)}</span>}
        </div>
      )}
      <div style={{ position: 'relative', height: '8px', backgroundColor: colors.surfaceInk, borderRadius: radius.md, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: c + '99', borderRadius: radius.md, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── FactorCard ────────────────────────────────────────────────────────────────

type Direction = 'long' | 'short' | 'neutral';

const directionTone: Record<Direction, Tone> = { long: 'bull', short: 'bear', neutral: 'neutral' };
const directionLabel: Record<Direction, string> = { long: '▲ Long', short: '▼ Short', neutral: '─ Neutral' };

export function FactorCard({
  label, value, direction = 'neutral', score, sub,
}: {
  label: ReactNode;
  value: ReactNode;
  direction?: Direction;
  score?: number;
  sub?: ReactNode;
}) {
  return (
    <Card padding={space.md} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <span style={{ fontSize: font.size.md, color: colors.textMuted }}>{label}</span>
        <Badge tone={directionTone[direction]}>{directionLabel[direction]}</Badge>
      </div>
      <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, fontFamily: font.mono }}>
        {value}
      </span>
      {score != null && <ScoreBar value={score} tone={directionTone[direction]} showValue={false} />}
      {sub != null && <span style={{ fontSize: font.size.sm, color: colors.textFaint }}>{sub}</span>}
    </Card>
  );
}

// ── WorkspaceShell ────────────────────────────────────────────────────────────
// Standardizes the "single tabbed pane" workspace pattern: desktop shows a top tab
// bar + scrollable content; mobile shows scrollable content + a bottom tab bar.

export function WorkspaceShell({
  tabs, activeTab, onTabChange, children,
}: {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  const content = <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>;
  const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' };

  if (isMobile) {
    return (
      <div style={wrap}>
        {content}
        <Tabs items={tabs} active={activeTab} onChange={onTabChange} variant="bottom" />
      </div>
    );
  }
  return (
    <div style={wrap}>
      <Tabs items={tabs} active={activeTab} onChange={onTabChange} variant="top" />
      {content}
    </div>
  );
}
