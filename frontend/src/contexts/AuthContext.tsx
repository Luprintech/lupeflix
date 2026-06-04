import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import {
  getToken,
  setToken as persistToken,
  clearToken,
  getStoredUser,
  setStoredUser,
  ApiError,
} from '../lib/api';
import { fetchMe, checkAdmin, logout as logoutRequest } from '../lib/services';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Optimistic init: if a token exists in localStorage trust it immediately.
  // This prevents a flash-to-login on every page refresh while we validate.
  const initialToken = getToken();
  const [user, setUser] = useState<User | null>(() => {
    const cached = getStoredUser();
    if (!cached) return null;
    try { return JSON.parse(cached) as User; } catch { return null; }
  });
  const [token, setTokenState] = useState<string | null>(initialToken);
  const [isAdmin, setIsAdmin] = useState(false);
  // isLoading is false immediately if we already have a token (optimistic).
  // We still validate in the background; only an explicit 401 kicks the user out.
  const [isLoading, setIsLoading] = useState(!initialToken);

  const resolveAdmin = useCallback(async (email: string) => {
    try {
      const { allowed } = await checkAdmin(email);
      setIsAdmin(allowed);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // On mount: validate the token with the server.
  // If we had a token (optimistic path), isLoading is already false — this runs silently.
  // If we had no token, isLoading is true and we wait for this to finish.
  useEffect(() => {
    const storedToken = getToken();

    // No token at all — nothing to validate, mark loading done and stay on login.
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { user: me, token: freshToken } = await fetchMe();
        if (cancelled) return;

        // Server may return a refreshed token (future-proofing).
        if (freshToken && freshToken !== storedToken) {
          persistToken(freshToken);
          setTokenState(freshToken);
        }

        setUser(me);
        setStoredUser(JSON.stringify(me));
        await resolveAdmin(me.email);
      } catch (err) {
        if (cancelled) return;

        const is401 = err instanceof ApiError && err.status === 401;
        if (is401) {
          // Server explicitly rejected the token — log out cleanly.
          clearToken();
          setUser(null);
          setTokenState(null);
          setIsAdmin(false);
        }
        // For network errors or 5xx: keep the cached auth state.
        // The user is probably offline or the server is temporarily down.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveAdmin]);

  const login = useCallback(
    (newToken: string, newUser: User) => {
      persistToken(newToken);
      setStoredUser(JSON.stringify(newUser));
      setTokenState(newToken);
      setUser(newUser);
      void resolveAdmin(newUser.email);
    },
    [resolveAdmin]
  );

  const logout = useCallback(() => {
    void logoutRequest().catch(() => undefined);
    clearToken();
    setUser(null);
    setTokenState(null);
    setIsAdmin(false);
    window.location.href = '/login';
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isAdmin,
    isAuthenticated: !!token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
