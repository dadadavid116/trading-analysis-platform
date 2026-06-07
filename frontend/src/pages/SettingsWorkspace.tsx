import { useState, CSSProperties } from 'react';
import { WorkspaceShell, SectionHeader, Card, Button, Badge } from '../theme/primitives';
import { colors, space, font, radius } from '../theme/tokens';
import { useSettings, useIsAuthenticated, DEFAULT_SETTINGS, FactorWeights } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { id: 'general',       label: 'General'        },
  { id: 'models',        label: 'AI Models'       },
  { id: 'notifications', label: 'Notifications'   },
  { id: 'account',       label: 'Account'         },
  { id: 'weights',       label: 'Factor Weights'  },
  { id: 'export',        label: 'Export'          },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function SettingsWorkspace() {
  const [activeTab, setActiveTab] = useState('general');

  const content = (() => {
    switch (activeTab) {
      case 'general':       return <GeneralTab />;
      case 'models':        return <ModelsTab />;
      case 'notifications': return <NotificationsTab />;
      case 'account':       return <AccountTab />;
      case 'weights':       return <WeightsTab />;
      case 'export':        return <ExportTab />;
      default:              return null;
    }
  })();

  return (
    <WorkspaceShell tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <div style={scrollWrap}>
        {content}
      </div>
    </WorkspaceShell>
  );
}

// ── General tab ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const { settings, updateSettings, saving } = useSettings();

  return (
    <Section title="Display">
      <Row label="Density mode" hint="Affects panel row height and spacing">
        <ToggleGroup
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'normal',  label: 'Normal'  },
          ]}
          value={settings.density}
          onChange={(v) => updateSettings({ density: v as 'compact' | 'normal' })}
        />
      </Row>

      <Row label="Theme" hint="Additional themes coming in a future update">
        <ToggleGroup
          options={[{ value: 'dark', label: 'Dark (default)' }]}
          value="dark"
          onChange={() => {}}
        />
      </Row>

      {saving && <SaveIndicator />}
    </Section>
  );
}

// ── AI Models tab ──────────────────────────────────────────────────────────────

function ModelsTab() {
  const { settings, updateSettings, saving } = useSettings();

  const rows: { key: keyof typeof settings.aiModel; label: string; hint: string }[] = [
    { key: 'chat',     label: 'Chat Assistant',   hint: 'Model used for the AI chat panel' },
    { key: 'analysis', label: 'Chart Analysis',   hint: 'Model used for trade setup analysis' },
    { key: 'scanner',  label: 'Scanner Insights', hint: 'Model used for scanner signal rationale' },
  ];

  return (
    <Section title="AI Model Preferences">
      {rows.map((r) => (
        <Row key={r.key} label={r.label} hint={r.hint}>
          <ToggleGroup
            options={[
              { value: 'claude', label: 'Claude (Anthropic)' },
              { value: 'openai', label: 'GPT-4o (OpenAI)'    },
            ]}
            value={settings.aiModel[r.key]}
            onChange={(v) =>
              updateSettings({ aiModel: { ...settings.aiModel, [r.key]: v as 'claude' | 'openai' } })
            }
          />
        </Row>
      ))}
      {saving && <SaveIndicator />}
    </Section>
  );
}

// ── Notifications tab ──────────────────────────────────────────────────────────

function NotificationsTab() {
  const { settings, updateSettings, saving } = useSettings();
  const n = settings.notifications;

  async function requestBrowser() {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        updateSettings({ notifications: { ...n, browserEnabled: true } });
      }
    }
  }

  return (
    <>
      <Section title="Alert Channels">
        <Row label="Browser notifications" hint="Push alerts to this browser tab">
          <div style={rowRight}>
            <Toggle
              value={n.browserEnabled}
              onChange={(v) => {
                if (v) { requestBrowser(); }
                else updateSettings({ notifications: { ...n, browserEnabled: false } });
              }}
            />
            <span style={hintStyle}>
              {typeof Notification !== 'undefined' && Notification.permission === 'denied'
                ? 'Blocked by browser — enable in site settings'
                : ''}
            </span>
          </div>
        </Row>

        <Row label="Telegram alerts" hint="Send price / signal alerts via the configured Telegram bot">
          <Toggle
            value={n.telegramEnabled}
            onChange={(v) => updateSettings({ notifications: { ...n, telegramEnabled: v } })}
          />
        </Row>

        <Row label="Webhook URL" hint="POST alert payload to a custom endpoint (leave blank to disable)">
          <input
            style={inputStyle}
            type="url"
            placeholder="https://your-webhook.example.com/alert"
            value={n.webhookUrl}
            onChange={(e) => updateSettings({ notifications: { ...n, webhookUrl: e.target.value } })}
          />
        </Row>
      </Section>

      <Section title="Quiet Hours">
        <Row label="Enable quiet hours" hint="Suppress non-critical alerts during the configured window">
          <Toggle
            value={n.quietHoursEnabled}
            onChange={(v) => updateSettings({ notifications: { ...n, quietHoursEnabled: v } })}
          />
        </Row>

        <Row label="Quiet from" hint="Start of the quiet window (local time)">
          <input
            style={{ ...inputStyle, width: '100px' }}
            type="time"
            value={n.quietFrom}
            disabled={!n.quietHoursEnabled}
            onChange={(e) => updateSettings({ notifications: { ...n, quietFrom: e.target.value } })}
          />
        </Row>

        <Row label="Quiet until" hint="End of the quiet window (local time)">
          <input
            style={{ ...inputStyle, width: '100px' }}
            type="time"
            value={n.quietTo}
            disabled={!n.quietHoursEnabled}
            onChange={(e) => updateSettings({ notifications: { ...n, quietTo: e.target.value } })}
          />
        </Row>
      </Section>

      {saving && <SaveIndicator />}
    </>
  );
}

// ── Account tab ────────────────────────────────────────────────────────────────

function AccountTab() {
  const { user, jwtEnabled } = useAuth();
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [status,   setStatus]   = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [errMsg,   setErrMsg]   = useState('');

  if (!jwtEnabled || !user) {
    return (
      <Section title="Account">
        <p style={{ color: colors.textMuted, fontSize: font.size.base }}>
          Account management is available when JWT authentication is enabled.
        </p>
      </Section>
    );
  }

  async function changePassword() {
    if (!next || next !== confirm) {
      setErrMsg('New passwords do not match.');
      setStatus('error');
      return;
    }
    if (next.length < 8) {
      setErrMsg('Password must be at least 8 characters.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setErrMsg('');
    try {
      const token = localStorage.getItem('tap_auth_token') ?? '';
      const resp = await fetch('/api/auth/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-App-Token': token } : {}) },
        body:    JSON.stringify({ current_password: current, new_password: next }),
      });
      if (resp.ok) {
        setStatus('ok');
        setCurrent(''); setNext(''); setConfirm('');
      } else {
        const j = await resp.json().catch(() => ({}));
        setErrMsg(j.detail ?? 'Password change failed.');
        setStatus('error');
      }
    } catch {
      setErrMsg('Network error.');
      setStatus('error');
    }
  }

  return (
    <Section title="Account">
      <Row label="Signed in as" hint="">
        <span style={{ color: colors.accent, fontSize: font.size.base, fontFamily: font.mono }}>
          {user.email ?? user.username}
        </span>
      </Row>

      <div style={dividerStyle} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg, maxWidth: '360px' }}>
        <span style={subheadStyle}>Change password</span>

        <LabeledInput
          label="Current password"
          type="password"
          value={current}
          onChange={setCurrent}
        />
        <LabeledInput
          label="New password"
          type="password"
          value={next}
          onChange={setNext}
        />
        <LabeledInput
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
        />

        {status === 'error' && (
          <span style={{ color: colors.bear, fontSize: font.size.md }}>{errMsg}</span>
        )}
        {status === 'ok' && (
          <span style={{ color: colors.bull, fontSize: font.size.md }}>Password changed successfully.</span>
        )}

        <Button
          variant="primary"
          onClick={changePassword}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving…' : 'Update password'}
        </Button>
      </div>
    </Section>
  );
}

// ── Factor Weights tab ─────────────────────────────────────────────────────────

function WeightsTab() {
  const { settings, updateSettings, saving } = useSettings();
  const w = settings.factorWeights;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const isBalanced = total === 100;

  const rows: { key: keyof FactorWeights; label: string }[] = [
    { key: 'derivatives',   label: 'Crypto Derivatives (Funding, OI, L/S)' },
    { key: 'liquidity',     label: 'Liquidity (Orderbook, Depth, Mcap)'     },
    { key: 'momentum',      label: 'Momentum (Relative Strength, Trend)'    },
    { key: 'macroPressure', label: 'Macro Pressure (DXY, Yields, SPX)'      },
    { key: 'volatility',    label: 'Volatility (VIX proxy, ATR regime)'     },
    { key: 'newsCatalyst',  label: 'News / Catalyst (Sentiment, Events)'    },
  ];

  function setWeight(key: keyof FactorWeights, val: number) {
    updateSettings({ factorWeights: { ...w, [key]: Math.max(0, Math.min(100, val)) } });
  }

  function resetWeights() {
    updateSettings({ factorWeights: { ...DEFAULT_SETTINGS.factorWeights } });
  }

  return (
    <Section
      title="Factor Weights"
      right={
        <Badge tone="warn">Phase 82 — display only</Badge>
      }
    >
      <p style={{ color: colors.textMuted, fontSize: font.size.md, margin: `0 0 ${space.xl}` }}>
        These weights configure the Context Score formula. They are saved now and will activate
        automatically when the Factor Scoring Engine is deployed in Phase 82. Weights should sum to 100.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md, maxWidth: '500px' }}>
        {rows.map((r) => (
          <div key={r.key} style={weightRowStyle}>
            <span style={weightLabelStyle}>{r.label}</span>
            <div style={weightInputWrap}>
              <input
                style={weightInputStyle}
                type="number"
                min={0}
                max={100}
                value={w[r.key]}
                onChange={(e) => setWeight(r.key, parseInt(e.target.value, 10) || 0)}
              />
              <span style={{ color: colors.textMuted, fontSize: font.size.md }}>%</span>
            </div>
            <div style={weightBarOuter}>
              <div
                style={{
                  ...weightBarInner,
                  width: `${w[r.key]}%`,
                  backgroundColor: isBalanced ? colors.accentStrong + '99' : colors.warn + '99',
                }}
              />
            </div>
          </div>
        ))}

        <div style={totalRowStyle}>
          <span style={{ color: colors.textSecondary, fontSize: font.size.base }}>Total</span>
          <span style={{
            color:      isBalanced ? colors.bull : colors.warn,
            fontSize:   font.size.lg,
            fontFamily: font.mono,
            fontWeight: font.weight.bold,
          }}>
            {total}%
          </span>
          {!isBalanced && (
            <span style={{ color: colors.warn, fontSize: font.size.md }}>
              (should be 100%)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: space.md }}>
          <Button variant="ghost" size="sm" onClick={resetWeights}>Reset to defaults</Button>
        </div>
      </div>

      {saving && <SaveIndicator />}
    </Section>
  );
}

// ── Export tab ─────────────────────────────────────────────────────────────────

function ExportTab() {
  const { settings, updateSettings, saving } = useSettings();

  return (
    <Section title="Export Preferences">
      <Row label="Default export format" hint="Format used when exporting journal entries, signals, or trade history">
        <ToggleGroup
          options={[
            { value: 'csv',  label: 'CSV'  },
            { value: 'json', label: 'JSON' },
          ]}
          value={settings.exportFormat}
          onChange={(v) => updateSettings({ exportFormat: v as 'csv' | 'json' })}
        />
      </Row>

      <div style={dividerStyle} />

      <p style={{ color: colors.textMuted, fontSize: font.size.md }}>
        Journal, signals, and performance export will be available once the Review &amp; Research
        workspace data is fully populated (Phase 90–91).
      </p>

      {saving && <SaveIndicator />}
    </Section>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function Section({
  title, right, children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card style={sectionCard}>
      <SectionHeader title={title} right={right} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xl, marginTop: space.xl }}>
        {children}
      </div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={rowLeft}>
        <span style={rowLabel}>{label}</span>
        {hint && <span style={hintStyle}>{hint}</span>}
      </div>
      <div style={rowRight}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={toggleStyle(value)}
      title={value ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <div style={toggleKnob(value)} />
    </button>
  );
}

function ToggleGroup({
  options, value, onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: space.xs }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={toggleGroupBtn(o.value === value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LabeledInput({
  label, type, value, onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
      <span style={{ fontSize: font.size.md, color: colors.textMuted }}>{label}</span>
      <input
        style={inputStyle}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === 'password' ? 'current-password' : undefined}
      />
    </label>
  );
}

function SaveIndicator() {
  return (
    <span style={{ fontSize: font.size.sm, color: colors.textDim, fontStyle: 'italic' }}>
      Saving…
    </span>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const scrollWrap: CSSProperties = {
  height:    '100%',
  overflowY: 'auto',
  padding:   space.xxl,
  display:   'flex',
  flexDirection: 'column',
  gap:       space.xxl,
  maxWidth:  '720px',
};

const sectionCard: CSSProperties = {
  padding: space.xxl,
};

const rowStyle: CSSProperties = {
  display:     'flex',
  alignItems:  'flex-start',
  gap:         space.xxl,
  flexWrap:    'wrap',
};

const rowLeft: CSSProperties = {
  flex:          1,
  minWidth:      '180px',
  display:       'flex',
  flexDirection: 'column',
  gap:           space.xs,
};

const rowRight: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        space.md,
  flexShrink: 0,
};

const rowLabel: CSSProperties = {
  fontSize:   font.size.base,
  fontWeight: font.weight.medium,
  color:      colors.textSecondary,
};

const hintStyle: CSSProperties = {
  fontSize: font.size.sm,
  color:    colors.textFaint,
};

const inputStyle: CSSProperties = {
  backgroundColor: colors.surfaceInput,
  border:          `1px solid ${colors.border}`,
  borderRadius:    radius.md,
  color:           colors.text,
  fontSize:        font.size.base,
  padding:         `${space.sm} ${space.md}`,
  width:           '100%',
  outline:         'none',
};

const dividerStyle: CSSProperties = {
  height:          '1px',
  backgroundColor: colors.borderSubtle,
  margin:          `${space.md} 0`,
};

const subheadStyle: CSSProperties = {
  fontSize:   font.size.base,
  fontWeight: font.weight.semibold,
  color:      colors.textSecondary,
};

const toggleStyle = (on: boolean): CSSProperties => ({
  width:           '40px',
  height:          '22px',
  borderRadius:    radius.pill,
  border:          'none',
  cursor:          'pointer',
  backgroundColor: on ? colors.accentStrong : colors.borderStrong,
  position:        'relative',
  flexShrink:      0,
  transition:      'background-color 0.2s',
  padding:         0,
});

const toggleKnob = (on: boolean): CSSProperties => ({
  position:        'absolute',
  top:             '3px',
  left:            on ? '21px' : '3px',
  width:           '16px',
  height:          '16px',
  borderRadius:    '50%',
  backgroundColor: '#fff',
  transition:      'left 0.2s',
});

const toggleGroupBtn = (active: boolean): CSSProperties => ({
  backgroundColor: active ? colors.accentBg : 'transparent',
  border:          `1px solid ${active ? colors.accentStrong : colors.border}`,
  borderRadius:    radius.md,
  color:           active ? colors.accent : colors.textMuted,
  cursor:          'pointer',
  fontSize:        font.size.md,
  fontWeight:      active ? font.weight.semibold : font.weight.normal,
  padding:         `${space.sm} ${space.lg}`,
  transition:      'all 0.15s',
});

const weightRowStyle: CSSProperties = {
  display:    'grid',
  gridTemplateColumns: '1fr 80px 1fr',
  alignItems: 'center',
  gap:        space.md,
};

const weightLabelStyle: CSSProperties = {
  fontSize: font.size.md,
  color:    colors.textSecondary,
};

const weightInputWrap: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        space.xs,
};

const weightInputStyle: CSSProperties = {
  backgroundColor: colors.surfaceInput,
  border:          `1px solid ${colors.border}`,
  borderRadius:    radius.md,
  color:           colors.text,
  fontSize:        font.size.base,
  fontFamily:      font.mono,
  padding:         `${space.xs} ${space.sm}`,
  width:           '56px',
  textAlign:       'right',
  outline:         'none',
};

const weightBarOuter: CSSProperties = {
  height:          '6px',
  backgroundColor: colors.surfaceInk,
  borderRadius:    radius.md,
  overflow:        'hidden',
};

const weightBarInner: CSSProperties = {
  height:          '100%',
  borderRadius:    radius.md,
  transition:      'width 0.3s ease',
};

const totalRowStyle: CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         space.lg,
  paddingTop:  space.md,
  borderTop:   `1px solid ${colors.borderSubtle}`,
};
