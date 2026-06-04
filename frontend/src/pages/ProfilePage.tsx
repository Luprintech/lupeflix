import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { getHistory, deleteHistory } from '../lib/services';
import { tmdbPoster } from '../lib/tmdb';
import { PosterGridSkeleton } from '../components/ui/Skeleton';
import type { WatchHistory } from '../types';

export function ProfilePage() {
  const { user, isAdmin } = useAuth();
  const { openCard } = useModal();
  const qc = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: getHistory,
  });

  const remove = useMutation({
    mutationFn: (movieId: number) => deleteHistory(movieId),
    onSuccess: () => {
      toast.success('Eliminado del historial');
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
    onError: () => toast.error('No se pudo eliminar'),
  });

  const initials = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="px-4 pb-12 pt-20 sm:px-12">
      <header className="mb-8 flex items-center gap-4">
        {user?.picture ? (
          <img src={user.picture} alt={user.name} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-netflix-red text-2xl font-black text-white">
            {initials}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-black text-white">{user?.name}</h1>
          <p className="text-sm text-netflix-muted">{user?.email}</p>
          {isAdmin && (
            <a
              href="/admin.html"
              className="mt-1 inline-block text-sm font-medium text-netflix-red hover:underline"
            >
              Panel de administración →
            </a>
          )}
        </div>
      </header>

      <h2 className="mb-4 text-xl font-bold text-white">Historial</h2>
      {isLoading ? (
        <PosterGridSkeleton count={8} />
      ) : !history?.length ? (
        <p className="text-netflix-muted">Aún no has visto nada.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <HistoryRow
              key={h.id}
              item={h}
              onOpen={() => openCard(h)}
              onRemove={() => remove.mutate(h.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryRow({
  item,
  onOpen,
  onRemove,
}: {
  item: WatchHistory;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const progress =
    item.h_duration && item.progress ? Math.min(item.progress / item.h_duration, 1) : 0;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-netflix-border bg-netflix-surface p-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <img
          src={tmdbPoster(item)}
          alt={item.title}
          className="h-20 w-14 shrink-0 rounded object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{item.series_title || item.title}</p>
          <p className="text-xs text-netflix-muted">
            {item.completed ? 'Terminado' : progress ? `${Math.round(progress * 100)}% visto` : 'Empezado'}
          </p>
          {progress > 0 && (
            <div className="mt-1 h-1 w-32 overflow-hidden rounded bg-black/40">
              <div className="h-full bg-netflix-red" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Eliminar del historial"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-netflix-muted transition-colors hover:bg-netflix-surface2 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
