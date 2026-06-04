import React from 'react';

/**
 * panelStyles — shared inline styles for the original dashboard panels.
 *
 * NOTE (Phase 74): the canonical design system now lives in `src/theme/`
 * (`tokens.ts` + `primitives.tsx`). New components should import tokens/primitives
 * from `../theme` rather than adding ad-hoc inline styles here. These legacy
 * panelStyles values intentionally match the theme palette and are kept as-is so
 * existing panels render unchanged; migrate them onto the theme incrementally.
 */
export const panelStyles: Record<string, React.CSSProperties> = {
  // ── Panel card container ─────────────────────────────────────────────────
  // Borderless, background-less — panels fill their grid cell seamlessly.
  // The 1px gap lines between cells (set in Layout) act as the only dividers.
  card: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    height: '100%',
    boxSizing: 'border-box' as const,
  },

  // ── [Later] placeholder card — slightly different border to indicate status ─
  placeholderCard: {
    borderStyle: 'dashed',
    opacity: 0.75,
  },

  // ── Typography ───────────────────────────────────────────────────────────
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#c8c8c8',
    borderBottom: '1px solid #2a2a2e',
    paddingBottom: '8px',
  },
  label: {
    fontSize: '12px',
    color: '#888',
  },
  value: {
    fontSize: '13px',
    color: '#d0d0d0',
  },
  valueHighlight: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#f0c040',
  },
  muted: {
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic',
  },
  error: {
    fontSize: '12px',
    color: '#f44336',
    fontStyle: 'italic',
  },
  placeholderLabel: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },

  // ── Data grid (key-value rows) ────────────────────────────────────────────
  dataGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid #222',
  },

  // ── Table ────────────────────────────────────────────────────────────────
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  th: {
    textAlign: 'left' as const,
    color: '#888',
    padding: '4px 6px',
    borderBottom: '1px solid #2a2a2e',
    fontWeight: 500,
  },
  td: {
    padding: '4px 6px',
    color: '#c8c8c8',
    borderBottom: '1px solid #1e1e22',
  },
};
