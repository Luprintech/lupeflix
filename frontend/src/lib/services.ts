import { request, getToken } from './api';
import type {
  Movie,
  PaginatedMovies,
  SeriesDetail,
  Extras,
  WatchHistory,
  FavoriteState,
  BecauseWatched,
  ListType,
  TmdbSearchResponse,
  User,
  MediaType,
  PersonResponse,
  TmdbContentDetail,
} from '../types';

// ── MOVIES ──

export function getMovies(params: {
  type?: MediaType | 'all';
  genre?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<PaginatedMovies> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.genre) qs.set('genre', params.genre);
  if (params.search) qs.set('search', params.search);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  return request<PaginatedMovies>(`/api/movies?${qs.toString()}`);
}

export function getRecent(): Promise<Movie[]> {
  return request<Movie[]>('/api/movies/recent');
}

export function getFeatured(): Promise<Movie[]> {
  return request<Movie[]>('/api/movies/featured');
}

export function getTop(type?: 'movie' | 'tv', limit = 15): Promise<Movie[]> {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  qs.set('limit', String(limit));
  return request<Movie[]>(`/api/movies/top?${qs.toString()}`);
}

export function getMovie(id: number): Promise<Movie> {
  return request<Movie>(`/api/movies/${id}`);
}

export function getExtras(id: number): Promise<Extras> {
  return request<Extras>(`/api/movies/${id}/extras`);
}

export function getPerson(personId: number): Promise<PersonResponse> {
  return request<PersonResponse>(`/api/movies/person/${personId}`);
}

// ── SERIES ──

export function getSeries(limit = 300, search?: string): Promise<PaginatedMovies> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (search) qs.set('search', search);
  return request<PaginatedMovies>(`/api/series?${qs.toString()}`);
}

export function getSeriesDetail(key: string): Promise<SeriesDetail> {
  return request<SeriesDetail>(`/api/series/${encodeURIComponent(key)}/seasons`);
}

export function refreshSeriesMetadata(key: string): Promise<{ ok: boolean; series: SeriesDetail }> {
  return request(`/api/series/${encodeURIComponent(key)}/refresh-metadata`, {
    method: 'POST',
  });
}

// ── USER ──

export function getHistory(): Promise<WatchHistory[]> {
  return request<WatchHistory[]>('/api/user/history');
}

export function deleteHistory(movieId: number): Promise<{ ok: boolean }> {
  return request(`/api/user/history/${movieId}`, { method: 'DELETE' });
}

export function saveProgress(movieId: number, progress: number, duration: number): Promise<{ ok: boolean }> {
  return request('/api/user/history', {
    method: 'POST',
    body: JSON.stringify({ movie_id: movieId, progress, duration }),
  });
}

export function getRecommendations(type?: 'movie' | 'tv', limit = 24): Promise<Movie[]> {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  qs.set('limit', String(limit));
  return request<Movie[]>(`/api/user/recommendations?${qs.toString()}`);
}

export function getBecauseWatched(type?: 'movie' | 'tv', limit = 24): Promise<BecauseWatched> {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  qs.set('limit', String(limit));
  return request<BecauseWatched>(`/api/user/because-watched?${qs.toString()}`);
}

// ── FAVORITES / WATCHLIST ──

export function getFavorites(listType: ListType): Promise<Movie[]> {
  return request<Movie[]>(`/api/user/favorites?list_type=${listType}`);
}

export function getFavoriteState(movieId: number): Promise<FavoriteState> {
  return request<FavoriteState>(`/api/user/favorites/check/${movieId}`);
}

export function addFavorite(movieId: number, listType: ListType): Promise<{ ok: boolean; added: boolean }> {
  return request('/api/user/favorites', {
    method: 'POST',
    body: JSON.stringify({ movie_id: movieId, list_type: listType }),
  });
}

export function removeFavorite(movieId: number, listType: ListType): Promise<{ ok: boolean }> {
  return request(`/api/user/favorites/${movieId}?list_type=${listType}`, {
    method: 'DELETE',
  });
}

// ── AUTH ──

export interface AuthConfig {
  google_client_id: string | null;
}

export function getAuthConfig(): Promise<AuthConfig> {
  return request<AuthConfig>('/api/auth/config');
}

export interface AuthResponse {
  ok: boolean;
  token: string;
  user: User;
}

export function loginWithPassword(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function fetchMe(): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me');
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/api/auth/logout', { method: 'POST' });
}

export function checkAdmin(email: string): Promise<{ allowed: boolean }> {
  return request<{ allowed: boolean }>('/api/admin/check', {
    headers: { 'x-user-email': email },
  });
}

// ── TMDB / REMATCH (admin) ──

export function tmdbSearch(query: string, type: 'movie' | 'tv'): Promise<TmdbSearchResponse> {
  const qs = new URLSearchParams({ q: query, type });
  return request<TmdbSearchResponse>(`/api/tmdb/search?${qs.toString()}`);
}

export function getTmdbDetail(type: 'movie' | 'tv', tmdbId: number): Promise<TmdbContentDetail> {
  return request<TmdbContentDetail>(`/api/tmdb/detail/${type}/${tmdbId}`);
}

export function identifyMovie(
  movieId: number,
  tmdbId: number,
  type: 'movie' | 'tv',
  saveType?: MediaType
): Promise<{ ok: boolean; title: string }> {
  return request(`/api/rematch/${movieId}/identify`, {
    method: 'POST',
    body: JSON.stringify({ tmdb_id: tmdbId, type, save_type: saveType }),
  });
}

// ── STREAMING ──

export function buildStreamUrl(movieId: number): string {
  const token = getToken();
  const base = `/stream/${movieId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
