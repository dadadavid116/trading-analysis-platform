import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AIModelPrefs {
  chat:     'claude' | 'openai';
  analysis: 'claude' | 'openai';
  scanner:  'claude' | 'openai';
}

export interface NotificationPrefs {
  browserEnabled:    boolean;
  telegramEnabled:   boolean;
  webhookUrl:        string;
  quietHoursEnabled: boolean;
  quietFrom:         string;
  quietTo:           string;
}

export interface FactorWeights {
  derivatives:   number;
  liquidity:     number;
  momentum:      number;
  macroPressure: number;
  volatility:    number;
  newsCatalyst:  number;
}

export interface AppSettings {
  density:       'compact' | 'normal';
  aiModel:       AIModelPrefs;
  notifications: NotificationPrefs;
  factorWeights: FactorWeights;
  exportFormat:  'csv' | 'json';
}

export const DEFAULT_SETTINGS: AppSettings = {
  density: 'compact',
  aiModel: {
    chat:     'claude',
    analysis: 'claude',
    scanner:  'claude',
  },
  notifications: {
    browserEnabled:    false,
    telegramEnabled:   true,
    webhookUrl:        '',
    quietHoursEnabled: false,
    quietFrom:         '22:00',
    quietTo:           '08:00',
  },
  factorWeights: {
    derivatives:   25,
    liquidity:     20,
    momentum:      20,
    macroPressure: 15,
    volatility:    10,
    newsCatalyst:  10,
  },
  exportFormat: 'csv',
};

// ── Context ────────────────────────────────────────────────────────────────────

interface SettingsCtx {
  settings:       AppSettings;
  saving:         boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const Ctx = createContext<SettingsCtx>({
  settings:       DEFAULT_SETTINGS,
  saving:         false,
  updateSettings: async () => {},
});

export function useSettings() {
  return useContext(Ctx);
}

// ── Provider ───────────────────────────────────────────────────────────────────

const LS_KEY = 'tap_settings';

function mergeDefaults(stored: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    aiModel:       { ...DEFAULT_SETTINGS.aiModel,       ...(stored.aiModel       ?? {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications ?? {}) },
    factorWeights: { ...DEFAULT_SETTINGS.factorWeights, ...(stored.factorWeights ?? {}) },
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, jwtEnabled } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving]     = useState(false);
  const isAuthenticated = jwtEnabled ? !!user : true;

  // Load settings when auth state resolves
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (jwtEnabled && user) {
        try {
          const token = localStorage.getItem('tap_auth_token') ?? '';
          const resp = await fetch('/api/settings', {
            headers: token ? { 'X-App-Token': token } : {},
          });
          if (!cancelled && resp.ok) {
            const data = await resp.json();
            setSettings(mergeDefaults(data));
            return;
          }
        } catch {
          // fall through to localStorage
        }
      }
      if (cancelled) return;
      // localStorage fallback
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setSettings(mergeDefaults(JSON.parse(raw)));
      } catch {
        // use defaults
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user, jwtEnabled]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = mergeDefaults({ ...settings, ...patch });
    setSettings(next);

    if (jwtEnabled && user) {
      setSaving(true);
      try {
        const token = localStorage.getItem('tap_auth_token') ?? '';
        await fetch('/api/settings', {
          method:  'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-App-Token': token } : {}),
          },
          body: JSON.stringify(next),
        });
      } catch {
        // ignore network errors; settings already applied locally
      } finally {
        setSaving(false);
      }
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    }
  }, [settings, user, jwtEnabled]);

  return (
    <Ctx.Provider value={{ settings, saving, updateSettings }}>
      {children}
    </Ctx.Provider>
  );
}

// Expose whether current user has backend-persisted settings
export function useIsAuthenticated() {
  const { user, jwtEnabled } = useAuth();
  return jwtEnabled ? !!user : false;
}
