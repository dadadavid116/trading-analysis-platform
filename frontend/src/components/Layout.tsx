import { ReactNode } from 'react';
import type { CSSProperties } from 'react';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Layout — shared dashboard shell.
 *
 * Renders a fixed header and a responsive panel grid.
 * All dashboard panels are passed as children from App.tsx.
 *
 * Styling is intentionally minimal for this scaffold phase.
 * A proper CSS solution (CSS Modules, Tailwind, etc.) can be added [Later].
 */
function Layout({ children }: LayoutProps) {
  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <span style={styles.logo}>📈</span>
        <h1 style={styles.title}>Trading Analysis Platform</h1>
        <span style={styles.subtitle}>BTC · MVP Dashboard</span>
      </header>

      {/* ── Panel grid ── */}
      <main style={styles.grid}>
        {children}
      </main>
    </div>
  );
}

export default Layout;

// ── Inline styles (MVP — replace with CSS modules or Tailwind later) ──────────

const styles: Record<string, CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0f1117',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 24px',
    borderBottom: '1px solid #2a2a2e',
    backgroundColor: '#16161a',
  },
  logo: {
    fontSize: '24px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#f0f0f0',
  },
  subtitle: {
    fontSize: '13px',
    color: '#888',
    marginLeft: 'auto',
  },
  grid: {
    display: 'grid',
    // Two columns on wider screens; single column on narrow screens.
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: '16px',
    padding: '24px',
    flex: 1,
    alignContent: 'start',
  },
};
