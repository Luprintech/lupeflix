const TOKEN_KEY = 'lupeflix_token';
const USER_KEY = 'lupeflix_user';
const LEGACY_SESSION_KEY = 'lupeflix_session';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

export function getStoredUser(): string | null {
  return localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
}

export function setStoredUser(json: string): void {
  localStorage.setItem(USER_KEY, json);
  localStorage.setItem(LEGACY_SESSION_KEY, json);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-user-token'] = token;
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  /** If true, a 401 will throw but will NOT clear the token or redirect. Use for silent auth checks. */
  silent401?: boolean;
}

async function request<T>(url: string, options?: RequestOptions): Promise<T> {
  const { silent401, ...fetchOptions } = options ?? {};

  const res = await fetch(url, {
    ...fetchOptions,
    headers: { ...authHeaders(), ...(fetchOptions?.headers ?? {}) },
  });

  if (res.status === 401) {
    if (!silent401) {
      // Mid-session expiry: drop credentials and hard-redirect.
      clearToken();
      if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    throw new ApiError('No autenticado', 401);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
  }

  // Some endpoints (logout) may return empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export { request, TOKEN_KEY, USER_KEY, LEGACY_SESSION_KEY };
export type { RequestOptions };
