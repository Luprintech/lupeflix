/**
 * VideoPlayer — Netflix-style full-screen player.
 *
 * Features:
 *  • Custom controls (no native browser bar)
 *  • Auto-hide controls after 3s of inactivity
 *  • Seek bar with buffered section and hover time tooltip
 *  • Volume slider + mute toggle (persisted to localStorage)
 *  • Speed selector (0.5x – 2x)
 *  • Picture-in-Picture
 *  • Fullscreen
 *  • Keyboard shortcuts (Space, arrows, F, M, P, C, 0-9…)
 *  • Mobile touch: tap to toggle controls, double-tap sides to seek ±10s
 *  • Subtitle system: local VTT/SRT/ASS + OpenSubtitles search
 *  • Resume from initialTime with a dismissible banner
 *  • "Next episode" prompt at 95% / last 30s (series only)
 *  • Progress saved every 10s + on pause/close
 */

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  saveProgress,
  getLocalSubtitles,
  buildSubtitleUrl,
  searchOpenSubtitles,
  downloadSubtitle,
  getNextEpisode,
} from '../../lib/services';
import type { OsSearchResult, SubtitleTrack } from '../../types';

// ── constants ─────────────────────────────────────────────────────────────────

const CONTROLS_HIDE_DELAY = 3_000;
const SAVE_INTERVAL_MS    = 10_000;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const SEEK_STEP = 10;

// ── types ─────────────────────────────────────────────────────────────────────

export interface VideoPlayerProps {
  movieId:      number;
  title:        string;
  src:          string;
  initialTime?: number;
  isSeries?:    boolean;
  onClose:      () => void;
}

interface SkipRipple { dir: 'left' | 'right'; id: number }

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function getStoredVolume() {
  try { return Number(localStorage.getItem('lupeflix_vol') ?? '1'); } catch { return 1; }
}
function setStoredVolume(v: number) {
  try { localStorage.setItem('lupeflix_vol', String(v)); } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VideoPlayer({
  movieId, title, src, initialTime = 0, isSeries = false, onClose,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const seekBarRef   = useRef<HTMLDivElement>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout>>();
  const saveTimer    = useRef<ReturnType<typeof setInterval>>();

  // ── state ──────────────────────────────────────────────────────────────────
  const [playing,     setPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [buffered,    setBuffered]    = useState(0);
  const [volume,      setVolumeState] = useState(getStoredVolume);
  const [muted,       setMuted]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip,       setIsPip]       = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading,   setIsLoading]   = useState(true);
  const [speed,       setSpeed]       = useState(1);
  const [seekHover,   setSeekHover]   = useState<{ time: number; x: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubMenu,  setShowSubMenu]  = useState(false);
  const [showOsSearch, setShowOsSearch] = useState(false);
  const [subTracks,   setSubTracks]   = useState<SubtitleTrack[]>([]);
  const [activeSub,   setActiveSub]   = useState<string | null>(null); // lang
  const [osLang,      setOsLang]      = useState('es');
  const [osResults,   setOsResults]   = useState<OsSearchResult[]>([]);
  const [osLoading,   setOsLoading]   = useState(false);
  const [osUnavailable, setOsUnavailable] = useState('');
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [showNextEp,  setShowNextEp]  = useState(false);
  const [nextEpData,  setNextEpData]  = useState<{ id: number; title: string } | null>(null);
  const [nextEpCountdown, setNextEpCountdown] = useState(5);
  const [skipRipple,  setSkipRipple]  = useState<SkipRipple | null>(null);
  const [audioTracks, setAudioTracks] = useState<{ id: string; label: string; language: string }[]>([]);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  // For double-tap detection on mobile
  const lastTapRef  = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // ── controls auto-hide ─────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  const handleMouseMove = useCallback(() => resetHideTimer(), [resetHideTimer]);

  // ── progress persistence ────────────────────────────────────────────────────
  const persistProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration || isNaN(v.duration) || movieId <= 0) return;
    void saveProgress(movieId, Math.floor(v.currentTime), Math.floor(v.duration)).catch(() => {});
  }, [movieId]);

  // ── mount / unmount ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Set initial volume
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, getStoredVolume()));
    }

    // Periodic save
    saveTimer.current = setInterval(persistProgress, SAVE_INTERVAL_MS);

    // Load local subtitles
    if (movieId > 0) {
      getLocalSubtitles(movieId).then(tracks => setSubTracks(tracks)).catch(() => {});
    }

    return () => {
      clearTimeout(hideTimer.current);
      clearInterval(saveTimer.current);
      persistProgress();
      document.body.style.overflow = prev;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

  // ── video event handlers ───────────────────────────────────────────────────
  const onVideoPlay     = () => { setPlaying(true);  resetHideTimer(); };
  const onVideoPause    = () => { setPlaying(false); setShowControls(true); clearTimeout(hideTimer.current); persistProgress(); };
  const onVideoEnded    = () => { setPlaying(false); setShowControls(true); };
  const onVideoWaiting  = () => setIsLoading(true);
  const onVideoPlaying  = () => setIsLoading(false);

  const onVideoLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setIsLoading(false);
    if (initialTime > 5) {
      v.currentTime = initialTime;
      setShowResumeBanner(true);
      setTimeout(() => setShowResumeBanner(false), 6000);
    }

    // Detect audio tracks (audioTracks API not in standard TS lib — use any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const at = (v as any).audioTracks as { length: number; [i: number]: { id: string; label: string; language: string; enabled: boolean } } | undefined;
    if (at && at.length > 1) {
      const tracks = Array.from({ length: at.length }, (_, i) => ({
        id: at[i].id || String(i),
        label: at[i].label || at[i].language || `Pista ${i + 1}`,
        language: at[i].language || '',
      }));
      setAudioTracks(tracks);
      const activeIdx = Array.from({ length: at.length }, (_, i) => at[i].enabled).findIndex(Boolean);
      setActiveAudio(tracks[activeIdx >= 0 ? activeIdx : 0]?.id ?? null);
    }

    void v.play().catch(() => {});
  };

  const onVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);

    // Buffered
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }

    // Next episode prompt
    if (isSeries && v.duration > 0) {
      const pct = v.currentTime / v.duration;
      if (!showNextEp && (pct >= 0.95 || v.duration - v.currentTime <= 30)) {
        setShowNextEp(true);
      }
    }
  };

  // ── fetch next episode ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSeries || movieId <= 0) return;
    getNextEpisode(movieId)
      .then(r => { if (r.next) setNextEpData({ id: r.next.id, title: r.next.title }); })
      .catch(() => {});
  }, [movieId, isSeries]);

  // ── next episode countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showNextEp || !nextEpData) return;
    const id = setInterval(() => {
      setNextEpCountdown(c => {
        if (c <= 1) {
          clearInterval(id);
          onClose(); // caller will open the next episode
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNextEp, nextEpData]);

  // ── fullscreen change ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── PiP events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const enterPip = () => setIsPip(true);
    const leavePip = () => setIsPip(false);
    v.addEventListener('enterpictureinpicture', enterPip);
    v.addEventListener('leavepictureinpicture', leavePip);
    return () => {
      v.removeEventListener('enterpictureinpicture', enterPip);
      v.removeEventListener('leavepictureinpicture', leavePip);
    };
  }, []);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      const v = videoRef.current;
      if (!v) return;
      resetHideTimer();

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          v.paused ? void v.play() : v.pause();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 30 : SEEK_STEP));
          triggerRipple('left');
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + (e.shiftKey ? 30 : SEEK_STEP));
          triggerRipple('right');
          break;
        case 'ArrowUp':
          e.preventDefault();
          applyVolume(Math.min(1, v.volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          applyVolume(Math.max(0, v.volume - 0.1));
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyP':
          e.preventDefault();
          togglePip();
          break;
        case 'KeyC':
        case 'KeyS':
          e.preventDefault();
          setShowSubMenu(s => !s);
          setShowSettings(false);
          break;
        case 'Escape':
          if (!document.fullscreenElement) onClose();
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const n = Number(e.code.replace('Digit', ''));
            if (!isNaN(n)) v.currentTime = (v.duration || 0) * (n / 10);
          }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── actions ────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? void v.play() : v.pause();
  };

  const applyVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (videoRef.current) videoRef.current.volume = clamped;
    setVolumeState(clamped);
    setStoredVolume(clamped);
    if (clamped > 0) setMuted(false);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch { /* PiP not supported or blocked */ }
  };

  const applySpeed = (s: number) => {
    if (videoRef.current) videoRef.current.playbackRate = s;
    setSpeed(s);
  };

  const triggerRipple = (dir: 'left' | 'right') => {
    setSkipRipple({ dir, id: Date.now() });
    setTimeout(() => setSkipRipple(null), 700);
  };

  // ── seek bar ──────────────────────────────────────────────────────────────
  const getSeekFraction = (e: React.MouseEvent | MouseEvent) => {
    if (!seekBarRef.current) return 0;
    const rect = seekBarRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const onSeekBarClick = (e: React.MouseEvent) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = getSeekFraction(e) * duration;
  };

  const onSeekBarMouseMove = (e: React.MouseEvent) => {
    if (!seekBarRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekHover({ time: frac * duration, x: e.clientX - rect.left });
  };

  // ── touch (mobile) ─────────────────────────────────────────────────────────
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const now   = Date.now();
    const width = containerRef.current?.clientWidth ?? window.innerWidth;
    const xPct  = touch.clientX / width;

    const timeDiff = now - lastTapRef.current.time;
    const xDiff    = Math.abs(touch.clientX - lastTapRef.current.x);

    if (timeDiff < 300 && xDiff < 60) {
      // Double-tap
      const v = videoRef.current;
      if (!v) return;
      if (xPct < 0.35) {
        v.currentTime = Math.max(0, v.currentTime - SEEK_STEP);
        triggerRipple('left');
      } else if (xPct > 0.65) {
        v.currentTime = Math.min(v.duration, v.currentTime + SEEK_STEP);
        triggerRipple('right');
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 }; // reset
    } else {
      // Single tap — toggle controls
      setShowControls(s => {
        if (!s) resetHideTimer();
        return !s;
      });
      lastTapRef.current = { time: now, x: touch.clientX };
    }
  };

  // ── audio track selection ──────────────────────────────────────────────────
  const selectAudioTrack = (id: string) => {
    const v = videoRef.current;
    if (!v) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const at = (v as any).audioTracks as { length: number; [i: number]: { id: string; enabled: boolean } } | undefined;
    if (!at) return;
    for (let i = 0; i < at.length; i++) {
      at[i].enabled = at[i].id === id || String(i) === id;
    }
    setActiveAudio(id);
    setShowAudioMenu(false);
  };

  // ── subtitle management ────────────────────────────────────────────────────
  const selectSubtitle = (lang: string | null) => {
    setActiveSub(lang);
    setShowSubMenu(false);
  };

  const searchOs = async () => {
    setOsLoading(true);
    try {
      const r = await searchOpenSubtitles(movieId, osLang);
      if (!r.available) {
        setOsUnavailable(r.message ?? 'No disponible');
        setOsResults([]);
      } else {
        setOsResults(r.results ?? []);
        setOsUnavailable('');
      }
    } catch (err) {
      setOsUnavailable(err instanceof Error ? err.message : 'Error de búsqueda');
    } finally {
      setOsLoading(false);
    }
  };

  const downloadOs = async (result: OsSearchResult) => {
    if (!result.file_id) return;
    try {
      const vtt  = await downloadSubtitle(movieId, result.file_id, osLang);
      const blob = new Blob([vtt], { type: 'text/vtt' });
      const url  = URL.createObjectURL(blob);
      const fake: SubtitleTrack = {
        lang: osLang, label: `OS – ${result.filename}`, file: url, format: 'vtt',
      };
      setSubTracks(prev => [fake, ...prev.filter(t => t.file !== url)]);
      setActiveSub(osLang);
      setShowOsSearch(false);
      toast.success('Subtítulos descargados');
    } catch {
      toast.error('Error al descargar subtítulos');
    }
  };

  // ── derived state ──────────────────────────────────────────────────────────
  const progressPct  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct  = duration > 0 ? (buffered    / duration) * 100 : 0;
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black select-none"
      style={{ cursor: showControls ? 'default' : 'none' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Video element ─── */}
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        onPlay={onVideoPlay}
        onPause={onVideoPause}
        onEnded={onVideoEnded}
        onWaiting={onVideoWaiting}
        onPlaying={onVideoPlaying}
        onLoadedMetadata={onVideoLoadedMetadata}
        onTimeUpdate={onVideoTimeUpdate}
        onClick={togglePlay}
      >
        {/* Active subtitle track */}
        {activeSub && subTracks.map(t => {
          const isActive = t.lang === activeSub;
          const trackSrc = t.file.startsWith('blob:')
            ? t.file
            : buildSubtitleUrl(movieId, t.file);
          return (
            <track
              key={t.file}
              kind="subtitles"
              src={trackSrc}
              srcLang={t.lang}
              label={t.label}
              default={isActive}
            />
          );
        })}
      </video>

      {/* ── Subtitle track activation effect ─── */}
      <SubtitleActivator videoRef={videoRef} activeLang={activeSub} tracks={subTracks} />

      {/* ── Spinner ─── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="spinner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-14 w-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Skip ripples ─── */}
      <AnimatePresence>
        {skipRipple && (
          <motion.div
            key={skipRipple.id}
            initial={{ opacity: 0.9, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-white ${skipRipple.dir === 'left' ? 'left-8' : 'right-8'}`}
          >
            <div className="flex gap-0.5">
              {[0, 1, 2].map(i => (
                <svg key={i} viewBox="0 0 24 24" className={`h-8 w-8 fill-white ${skipRipple.dir === 'right' ? '' : 'scale-x-[-1]'}`}>
                  <path d="M5 5v14l11-7z" />
                </svg>
              ))}
            </div>
            <span className="text-sm font-semibold">{skipRipple.dir === 'left' ? '-' : '+'}{SEEK_STEP}s</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resume banner ─── */}
      <AnimatePresence>
        {showResumeBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="absolute left-1/2 top-16 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-black/80 px-5 py-2 text-sm text-white backdrop-blur-sm"
          >
            <span>Continuando desde {fmtTime(initialTime)}</span>
            <button
              type="button"
              onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; setShowResumeBanner(false); }}
              className="underline opacity-70 hover:opacity-100"
            >
              Ver desde el principio
            </button>
            <button type="button" onClick={() => setShowResumeBanner(false)} className="opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Next episode prompt ─── */}
      <AnimatePresence>
        {showNextEp && nextEpData && (
          <motion.div
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            className="absolute bottom-24 right-6 z-20 flex flex-col items-end gap-2"
          >
            <p className="text-xs text-white/70">Siguiente episodio en {nextEpCountdown}s</p>
            <button
              type="button"
              onClick={() => {
                persistProgress();
                onClose();
              }}
              className="flex items-center gap-2 rounded bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-white/90"
            >
              Siguiente episodio
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M5 5v14l11-7z M18 5h2v14h-2z"/></svg>
            </button>
            <button
              type="button"
              onClick={() => { setShowNextEp(false); setNextEpCountdown(5); }}
              className="text-xs text-white/60 hover:text-white"
            >
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Controls overlay ─── */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none absolute inset-0 flex flex-col justify-between"
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/80 to-transparent px-4 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar reproductor"
              className="flex items-center gap-2 text-white/90 transition-colors hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="m15 18-6-6 6-6" />
              </svg>
              <span className="hidden text-sm font-medium sm:block">Volver</span>
            </button>
            <h3 className="flex-1 truncate text-sm font-semibold text-white sm:text-base">{title}</h3>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-4 pt-16 sm:px-8">
          {/* Seek bar */}
          <div
            ref={seekBarRef}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
            className="group mb-3 h-5 cursor-pointer flex items-center"
            onClick={onSeekBarClick}
            onMouseMove={onSeekBarMouseMove}
            onMouseLeave={() => setSeekHover(null)}
          >
            <div className="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover:h-1.5">
              {/* Buffered */}
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-white/40"
                style={{ width: `${bufferedPct}%` }}
              />
              {/* Played */}
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-netflix-red"
                style={{ width: `${progressPct}%` }}
              />
              {/* Scrubber thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow group-hover:opacity-100 transition-opacity"
                style={{ left: `${progressPct}%` }}
              />
              {/* Hover time tooltip */}
              {seekHover && (
                <div
                  className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-xs text-white"
                  style={{ left: seekHover.x }}
                >
                  {fmtTime(seekHover.time)}
                </div>
              )}
            </div>
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between gap-2">
            {/* Left side */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play/Pause */}
              <CtrlBtn onClick={togglePlay} label={playing ? 'Pausar' : 'Reproducir'}>
                {playing
                  ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  : <path d="M8 5v14l11-7z" />}
              </CtrlBtn>

              {/* Skip +10s */}
              <CtrlBtn onClick={() => { if (videoRef.current) { videoRef.current.currentTime += SEEK_STEP; triggerRipple('right'); } }} label="+10s">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                <text x="10" y="13" fontSize="5" fill="currentColor" textAnchor="middle" style={{fontFamily:'sans-serif'}}>10</text>
              </CtrlBtn>

              {/* Volume */}
              <VolumeControl
                volume={volume}
                muted={muted}
                onToggleMute={toggleMute}
                onVolumeChange={applyVolume}
              />

              {/* Time */}
              <span className="ml-1 font-mono text-xs text-white/80 sm:text-sm tabular-nums">
                {fmtTime(currentTime)}
                <span className="mx-1 text-white/40">/</span>
                {fmtTime(duration)}
              </span>
            </div>

            {/* Right side */}
            <div className="relative flex items-center gap-1 sm:gap-2">
              {/* Subtitles */}
              <div className="relative">
                <CtrlBtn
                  onClick={() => { setShowSubMenu(s => !s); setShowSettings(false); setShowAudioMenu(false); }}
                  label="Subtítulos"
                  active={activeSub !== null}
                >
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-9 7H9v-1H7v4h2v-1h2v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v2zm7 0h-2v-1h-2v4h2v-1h2v1c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v2z"/>
                </CtrlBtn>
                {showSubMenu && (
                  <SubtitleMenu
                    tracks={subTracks}
                    activeLang={activeSub}
                    onSelect={selectSubtitle}
                    onOpenOsSearch={() => { setShowOsSearch(true); setShowSubMenu(false); searchOs(); }}
                  />
                )}
              </div>

              {/* Audio tracks — only shown if > 1 track */}
              {audioTracks.length > 1 && (
                <div className="relative">
                  <CtrlBtn
                    onClick={() => { setShowAudioMenu(s => !s); setShowSubMenu(false); setShowSettings(false); }}
                    label="Idioma de audio"
                    active={showAudioMenu}
                  >
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6zm-2 16a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
                  </CtrlBtn>
                  {showAudioMenu && (
                    <AudioMenu
                      tracks={audioTracks}
                      activeId={activeAudio}
                      onSelect={selectAudioTrack}
                    />
                  )}
                </div>
              )}

              {/* Speed */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowSettings(s => !s); setShowSubMenu(false); setShowAudioMenu(false); }}
                  className={`rounded px-2 py-1 text-xs font-bold transition-colors hover:text-white ${speed !== 1 ? 'text-netflix-red' : 'text-white/70'}`}
                  title="Velocidad"
                >
                  {speed === 1 ? '1×' : `${speed}×`}
                </button>
                {showSettings && (
                  <SpeedMenu
                    current={speed}
                    onSelect={s => { applySpeed(s); setShowSettings(false); }}
                  />
                )}
              </div>

              {/* PiP */}
              {pipSupported && (
                <CtrlBtn onClick={togglePip} label="Picture in Picture" active={isPip}>
                  <path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V4.98h18V19z"/>
                </CtrlBtn>
              )}

              {/* Fullscreen */}
              <CtrlBtn onClick={toggleFullscreen} label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                {isFullscreen
                  ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>}
              </CtrlBtn>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── OpenSubtitles search overlay ─── */}
      <AnimatePresence>
        {showOsSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setShowOsSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-full max-w-md rounded-xl bg-netflix-surface p-5 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-white">Buscar subtítulos</h3>
                <button type="button" onClick={() => setShowOsSearch(false)} className="text-white/60 hover:text-white">✕</button>
              </div>

              <div className="mb-4 flex gap-2">
                <select
                  value={osLang}
                  onChange={e => setOsLang(e.target.value)}
                  className="rounded border border-netflix-border bg-netflix-bg px-2 py-1.5 text-sm text-white"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="it">Italiano</option>
                  <option value="pt">Português</option>
                </select>
                <button
                  type="button"
                  onClick={searchOs}
                  disabled={osLoading}
                  className="flex-1 rounded bg-netflix-red px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {osLoading ? 'Buscando…' : 'Buscar en OpenSubtitles'}
                </button>
              </div>

              {osUnavailable && (
                <p className="rounded bg-netflix-bg p-3 text-sm text-netflix-muted">{osUnavailable}</p>
              )}

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {osResults.map(r => (
                  <div key={r.file_id} className="flex items-center justify-between gap-2 rounded border border-netflix-border bg-netflix-bg p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-white">{r.filename}</p>
                      <p className="text-[11px] text-netflix-muted">↓ {r.download_count}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void downloadOs(r)}
                      className="shrink-0 rounded bg-netflix-red px-3 py-1 text-xs font-bold text-white hover:bg-netflix-red2"
                    >
                      Usar
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Syncs the HTML <track> element's mode to the active language */
function SubtitleActivator({
  videoRef,
  activeLang,
  tracks,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeLang: string | null;
  tracks: SubtitleTrack[];
}) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Give the DOM a tick to render <track> elements
    const id = setTimeout(() => {
      Array.from(v.textTracks).forEach(t => {
        t.mode = (activeLang && t.language === activeLang) ? 'showing' : 'hidden';
      });
    }, 50);
    return () => clearTimeout(id);
  }, [activeLang, tracks, videoRef]);
  return null;
}

function CtrlBtn({
  onClick, label, active = false, children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 ${active ? 'text-netflix-red' : 'text-white/80 hover:text-white'}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">{children}</svg>
    </button>
  );
}

function VolumeControl({
  volume, muted, onToggleMute, onVolumeChange,
}: {
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
}) {
  const [showSlider, setShowSlider] = useState(false);
  const effective = muted ? 0 : volume;

  return (
    <div
      className="relative flex items-center gap-1"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <button
        type="button"
        onClick={onToggleMute}
        title={muted ? 'Activar sonido' : 'Silenciar'}
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          {effective === 0
            ? <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            : effective < 0.5
            ? <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
            : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>}
        </svg>
      </button>
      <motion.div
        animate={{ width: showSlider ? 80 : 0, opacity: showSlider ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={effective}
          onChange={e => onVolumeChange(Number(e.target.value))}
          className="h-1 w-20 cursor-pointer accent-white"
        />
      </motion.div>
    </div>
  );
}

function SubtitleMenu({
  tracks, activeLang, onSelect, onOpenOsSearch,
}: {
  tracks: SubtitleTrack[];
  activeLang: string | null;
  onSelect: (lang: string | null) => void;
  onOpenOsSearch: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-12 right-0 z-50 min-w-[180px] rounded-lg border border-netflix-border bg-netflix-surface shadow-xl"
    >
      <p className="border-b border-netflix-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-netflix-muted">Subtítulos</p>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${activeLang === null ? 'text-netflix-red font-semibold' : 'text-white'}`}
      >
        Desactivados
      </button>
      {tracks.map(t => (
        <button
          key={t.file}
          type="button"
          onClick={() => onSelect(t.lang)}
          className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${activeLang === t.lang ? 'text-netflix-red font-semibold' : 'text-white'}`}
        >
          {t.label}
        </button>
      ))}
      <div className="border-t border-netflix-border">
        <button
          type="button"
          onClick={onOpenOsSearch}
          className="w-full px-3 py-2 text-left text-xs text-netflix-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          + Buscar en OpenSubtitles
        </button>
      </div>
    </motion.div>
  );
}

function AudioMenu({
  tracks, activeId, onSelect,
}: {
  tracks: { id: string; label: string; language: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-12 right-0 z-50 min-w-[180px] rounded-lg border border-netflix-border bg-netflix-surface shadow-xl"
    >
      <p className="border-b border-netflix-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-netflix-muted">Audio</p>
      {tracks.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${activeId === t.id ? 'text-netflix-red font-semibold' : 'text-white'}`}
        >
          {t.label}
        </button>
      ))}
    </motion.div>
  );
}

function SpeedMenu({ current, onSelect }: { current: number; onSelect: (s: number) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-12 right-0 z-50 min-w-[130px] rounded-lg border border-netflix-border bg-netflix-surface shadow-xl"
    >
      <p className="border-b border-netflix-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-netflix-muted">Velocidad</p>
      {SPEEDS.map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${current === s ? 'text-netflix-red font-semibold' : 'text-white'}`}
        >
          {s === 1 ? '1× Normal' : `${s}×`}
        </button>
      ))}
    </motion.div>
  );
}
