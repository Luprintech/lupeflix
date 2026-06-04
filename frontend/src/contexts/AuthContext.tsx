import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import {
  getToken,
  setToken as persistToken,
  clearToken,
  getStoredUser,
  setStoredUser,
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
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const resolveAdmin = useCallback(async (email: string) => {
    try {
      const { allowed } = await checkAdmin(email);
      setIsAdmin(allowed);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // On mount: hydrate from localStorage, then validate the token with the server.
  useEffect(() => {
    const stored = getToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }

    const cachedUser = getStoredUser();
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser) as User);
      } catch {
        /* ignore malformed cache */
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const { user: me } = await fetchMe();
        if (cancelled) return;
        setUser(me);
        setStoredUser(JSON.stringify(me));
        await resolveAdmin(me.email);
      } catch {
        if (cancelled) return;
        // Invalid/expired token.
        clearToken();
        setUser(null);
        setTokenState(null);
        setIsAdmin(false);
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
