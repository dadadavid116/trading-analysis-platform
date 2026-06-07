/**
 * AuthContext.tsx — App-level JWT authentication state (Phase 95).
 *
 * Flow:
 *  1. On mount: call GET /api/auth/status to check if JWT auth is enabled.
 *  2. If disabled (JWT_SECRET_KEY not set on server): skip login, show app.
 *  3. If enabled: look for a stored token in localStorage.
 *     - Valid token → load user profile, show app.
 *     - No / invalid token → show LoginPage.
 *
 * Token is sent as the X-App-Token header (not Authorization: Bearer) to
 * avoid conflicting with Caddy Basic Auth at the proxy layer.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';

const BASE_URL = '/api';
const TOKEN_KEY = 'tap_auth_token';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  jwtEnabled: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  jwtEnabled: false,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,       setUser]       = useState<AuthUser | null>(null);
  const [token,      setToken]      = useState<string | null>(null);
  const [jwtEnabled, setJwtEnabled] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Check if JWT is configured on the server.
        const statusRes = await fetch(`${BASE_URL}/auth/status`);
        const { enabled } = await statusRes.json();
        if (!enabled || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }
        setJwtEnabled(true);

        // 2. Try to restore session from localStorage.
        const stored = localStorage.getItem(TOKEN_KEY);
        if (!stored) {
          if (!cancelled) setLoading(false);
          return;
        }

        // 3. Validate the stored token with the server.
        const meRes = await fetch(`${BASE_URL}/auth/me`, {
          headers: { 'X-App-Token': stored },
        });
        if (meRes.ok && !cancelled) {
          const userData: AuthUser = await meRes.json();
          setUser(userData);
          setToken(stored);
        } else if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        // Network error — assume JWT not available, let app through.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? 'Login failed');
    }
    const data = await res.json() as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, jwtEnabled, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
