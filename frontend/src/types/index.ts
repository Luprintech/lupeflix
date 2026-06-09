export type MediaType = 'movie' | 'tv' | 'documentary';

export interface Movie {
  id: number;
  title: string;
  original_title?: string;
  year?: number;
  description?: string;
  genres?: string;
  director?: string;
  cast?: string;
  rating?: number;
  duration?: number;
  type: MediaType;
  poster_path?: string;
  backdrop_path?: string;
  tmdb_id?: number;
  tmdb_media_type?: string;
  file_path?: string;
  file_size?: number;
  views?: number;
  is_series?: number;
  series_key?: string;
  series_id?: number;
  series_title?: string;
  series_poster?: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  episode_count?: number;
  season_count?: number;
  added_at?: string;
}

export interface Episode {
  id: number;
  title: string;
  season_number: number;
  episode_number: number;
  episode_title?: string;
  description?: string;
  poster_path?: string;
  backdrop_path?: string;
  duration?: number;
  rating?: number;
  file_path?: string;
  episode_air_date?: string;
}

export interface SeriesEnrichment {
  updated?: number;
  tmdb_id?: number | null;
  title?: string;
  seasons?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export interface SeriesDetail {
  series_key: string;
  series_id?: number;
  tmdb_id?: number;
  series_title: string;
  series_poster?: string;
  backdrop_path?: string;
  description?: string;
  genres?: string;
  rating?: number;
  year?: number;
  season_count: number;
  episode_count: number;
  seasons: Record<string, Episode[]>;
  enrichment?: SeriesEnrichment | null;
}

export interface User {
  name: string;
  email: string;
  picture?: string;
  role?: string;
}

export interface WatchHistory extends Movie {
  progress?: number;
  h_duration?: number;
  completed?: number;
  watched_at?: string;
}

export interface FavoriteState {
  is_favorite: boolean;
  in_watchlist: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
}

export interface PersonDetail {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  profile_path?: string | null;
  known_for_department?: string;
  biography_source?: string;
}

export interface SimilarItem {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  description?: string | null;
  year?: number | null;
  rating?: number | null;
  in_library?: boolean;
  library_id?: number | null;
}

export interface Provider {
  id: number;
  name: string;
  logo_path?: string | null;
}

export interface ProviderSummary {
  region: string;
  link: string | null;
  flatrate: Provider[];
  rent: Provider[];
  buy: Provider[];
}

export interface Extras {
  trailer: string | null;
  cast: CastMember[];
  director?: string;
  similar: SimilarItem[];
  providers: ProviderSummary;
  error?: string;
}

export interface PersonResponse {
  person: PersonDetail;
  credits: SimilarItem[];
}

export interface TmdbContentDetail {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  providers: ProviderSummary;
}

export interface ExternalWatchlistItem {
  id: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year?: number | null;
  poster_path?: string | null;
  rating?: number | null;
  providers?: ProviderSummary | null;
  added_at?: string;
}

export interface UpcomingResponse {
  results: SimilarItem[];
}

export interface PaginatedMovies {
  results: Movie[];
  total: number;
}

export interface BecauseWatched {
  title: string | null;
  items: Movie[];
}

export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

export interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

export type ListType = 'favorite' | 'watchlist';

// ── Player / Subtitles ────────────────────────────────────────────────────────

export interface SubtitleTrack {
  lang: string;
  label: string;
  file: string;   // base64-encoded absolute path, used in /api/subtitles/:id/serve
  format: 'vtt' | 'srt' | 'ass';
}

export interface OsSearchResult {
  file_id: number | null;
  language: string;
  filename: string;
  download_count: number;
  upload_date: string;
  hearing_impaired: boolean;
}

export interface OsSearchResponse {
  available: boolean;
  message?: string;
  results?: OsSearchResult[];
}
