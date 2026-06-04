import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getFavoriteState,
  addFavorite,
  removeFavorite,
} from '../lib/services';
import type { FavoriteState, ListType } from '../types';

export function useFavoriteState(movieId: number | null) {
  return useQuery<FavoriteState>({
    queryKey: ['favorite-state', movieId],
    queryFn: () => getFavoriteState(movieId as number),
    enabled: movieId != null,
    staleTime: 30_000,
  });
}

/**
 * Toggle a favorite/watchlist entry with optimistic UI.
 * Returns a mutate function and pending state.
 */
export function useToggleFavorite(movieId: number | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ listType, active }: { listType: ListType; active: boolean }) => {
      if (movieId == null) throw new Error('No movie selected');
      // `active` is the CURRENT state; toggling means doing the opposite.
      if (active) {
        await removeFavorite(movieId, listType);
        return { listType, nowActive: false };
      }
      await addFavorite(movieId, listType);
      return { listType, nowActive: true };
    },
    onMutate: async ({ listType, active }) => {
      await qc.cancelQueries({ queryKey: ['favorite-state', movieId] });
      const prev = qc.getQueryData<FavoriteState>(['favorite-state', movieId]);
      const key = listType === 'favorite' ? 'is_favorite' : 'in_watchlist';
      qc.setQueryData<FavoriteState>(['favorite-state', movieId], (old) => ({
        is_favorite: old?.is_favorite ?? false,
        in_watchlist: old?.in_watchlist ?? false,
        [key]: !active,
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['favorite-state', movieId], ctx.prev);
      toast.error('No se pudo actualizar tu lista');
    },
    onSuccess: ({ listType, nowActive }) => {
      const label = listType === 'favorite' ? 'Favoritos' : 'Ver después';
      toast.success(nowActive ? `Añadido a ${label}` : `Quitado de ${label}`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['favorite-state', movieId] });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
