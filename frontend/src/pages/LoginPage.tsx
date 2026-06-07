/**
 * LoginPage.tsx — App-level login form (Phase 95).
 *
 * Shown when JWT auth is enabled and no valid token is in localStorage.
 * Caddy Basic Auth is a separate layer handled by the browser before this
 * page is ever reached.
 */

import { CSSProperties, FormEvent, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={logoRow}>
          <span style={logoMark}>◈</span>
          <span style={logoText}>Trading Analysis Platform</span>
        </div>

        <p style={subtitle}>Sign in to continue</p>

        <form onSubmit={handleSubmit} style={form}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            style={inputStyle}
            autoComplete="email"
          />

          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={inputStyle}
            autoComplete="current-password"
          />

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" disabled={busy} style={submitBtn(busy)}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position:        'fixed',
  inset:           0,
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  backgroundColor: '#0a0c12',
};

const card: CSSProperties = {
  width:           '100%',
  maxWidth:        '380px',
  backgroundColor: '#111318',
  border:          '1px solid #1e2028',
  borderRadius:    '10px',
  padding:         '36px 32px',
  margin:          '0 16px',
};

const logoRow: CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            '10px',
  marginBottom:   '4px',
};

const logoMark: CSSProperties = {
  fontSize:   '22px',
  color:      '#3a6aaf',
  lineHeight: 1,
};

const logoText: CSSProperties = {
  fontSize:   '14px',
  fontWeight: 600,
  color:      '#c9d1d9',
  letterSpacing: '0.02em',
};

const subtitle: CSSProperties = {
  fontSize:     '12px',
  color:        '#6e7681',
  margin:       '0 0 24px',
};

const form: CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           '10px',
};

const labelStyle: CSSProperties = {
  fontSize:    '11px',
  fontWeight:  600,
  color:       '#8b949e',
  marginBottom: '-4px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const inputStyle: CSSProperties = {
  width:           '100%',
  backgroundColor: '#0d0f14',
  border:          '1px solid #2a2d35',
  borderRadius:    '6px',
  color:           '#e6edf3',
  fontSize:        '13px',
  padding:         '9px 12px',
  outline:         'none',
  boxSizing:       'border-box',
};

const errorStyle: CSSProperties = {
  fontSize:      '12px',
  color:         '#f85149',
  margin:        '2px 0 0',
  padding:       '8px 10px',
  backgroundColor: 'rgba(248,81,73,0.08)',
  borderRadius:  '5px',
  border:        '1px solid rgba(248,81,73,0.2)',
};

const submitBtn = (busy: boolean): CSSProperties => ({
  marginTop:       '8px',
  padding:         '10px',
  backgroundColor: busy ? '#1a2a4a' : '#1f4080',
  border:          'none',
  borderRadius:    '6px',
  color:           busy ? '#5a7aaa' : '#90b8e0',
  fontSize:        '13px',
  fontWeight:      600,
  cursor:          busy ? 'not-allowed' : 'pointer',
  transition:      'background 0.15s',
});
