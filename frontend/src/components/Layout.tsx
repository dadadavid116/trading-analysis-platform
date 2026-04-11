import { ReactNode } from 'react';
import type { CSSProperties } from 'react';

interface LayoutProps {
  /** Dashboard panels rendered in the left grid (Price, Liquidation, etc.) */
  children: ReactNode;
  /** The ChatPanel component — rendered in the fixed right column. */
  chatPanel: ReactNode;
  /** Whether the right chat column is visible. */
  chatOpen: boolean;
  /** Callback to toggle the chat column. */
  onToggleChat: () => void;
}

/**
 * Layout — two-column dashboard shell.
 *
 * Left side  (~2/3): scrollable grid of dashboard panels.
 * Right side (~1/3): fixed chat column, full viewport height.
 *
 * The chat column collapses to zero width when chatOpen is false,
 * animated with a CSS transition. The toggle button lives in the header.
 */
function Layout({ children, chatPanel, chatOpen, onToggleChat }: LayoutProps) {
  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <span style={styles.logo}>📈</span>
        <h1 style={styles.title}>Trading Analysis Platform</h1>
        <span style={styles.subtitle}>BTC · Dashboard</span>

        {/* Chat toggle — sits at the far right of the header */}
        <button style={styles.chatToggle(chatOpen)} onClick={onToggleChat} title="Toggle AI Chat">
          {chatOpen ? 'Chat ◀' : 'Chat ▶'}
        </button>
      </header>

      {/* ── Body: left panel grid + right chat column ── */}
      <div style={styles.body}>

        {/* Left — scrollable dashboard panel grid */}
        <div style={styles.panelArea}>
          <div style={styles.grid}>
            {children}
          </div>
        </div>

        {/* Right — fixed-width chat column, collapses to 0 when hidden */}
        <div style={styles.chatColumn(chatOpen)}>
          {chatPanel}
        </div>

      </div>
    </div>
  );
}

export default Layout;

// ── Styles ────────────────────────────────────────────────────────────────────

const HEADER_HEIGHT = '56px';

const styles: Record<string, CSSProperties | ((...args: never[]) => CSSProperties)> = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0f1117',
    color: '#e0e0e0',
    overflow: 'hidden',
  } as CSSProperties,

  header: {
    height: HEADER_HEIGHT,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 24px',
    borderBottom: '1px solid #2a2a2e',
    backgroundColor: '#16161a',
  } as CSSProperties,

  logo:  { fontSize: '22px' } as CSSProperties,
  title: { fontSize: '17px', fontWeight: 600, color: '#f0f0f0', margin: 0 } as CSSProperties,
  subtitle: { fontSize: '12px', color: '#666', marginLeft: 'auto' } as CSSProperties,

  chatToggle: (open: boolean): CSSProperties => ({
    backgroundColor: open ? '#1e3a5f' : '#111114',
    border: `1px solid ${open ? '#3a6a9f' : '#2a2a2e'}`,
    borderRadius: '5px',
    color: open ? '#90b8e0' : '#888',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '5px 12px',
    marginLeft: '8px',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  }),

  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    height: `calc(100vh - ${HEADER_HEIGHT})`,
  } as CSSProperties,

  // Left area — no scroll, no padding; the 2×2 grid fills it completely.
  panelArea: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  } as CSSProperties,

  // 2×2 grid that fills the full available height.
  // gap:1px + backgroundColor creates the thin divider lines between panels.
  // Top row (Price + Liquidation): 3fr — chart needs the room.
  // Bottom row (OrderBook + Alerts): 2fr — alerts form needs reasonable space.
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '3fr 2fr',
    height: '100%',
    gap: '1px',
    backgroundColor: '#2a2a2e',
  } as CSSProperties,

  chatColumn: (open: boolean): CSSProperties => ({
    width: open ? 'clamp(340px, 33vw, 480px)' : '0',
    flexShrink: 0,
    overflow: 'hidden',
    borderLeft: open ? '1px solid #2a2a2e' : 'none',
    transition: 'width 0.25s ease',
    display: 'flex',
    flexDirection: 'column',
  }),
};
