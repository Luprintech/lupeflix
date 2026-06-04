import { useEffect, useState } from 'react';
import type { CatalogView, PosterSize } from '../components/ui/CatalogControls';

const VIEW_KEY = 'lupeflix_catalog_view';
const SIZE_KEY = 'lupeflix_poster_size';

function isCatalogView(value: string | null): value is CatalogView {
  return value === 'grid' || value === 'compact' || value === 'list';
}

function isPosterSize(value: string | null): value is PosterSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function useCatalogPreferences() {
  const [view, setView] = useState<CatalogView>(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    return isCatalogView(stored) ? stored : 'grid';
  });
  const [size, setSize] = useState<PosterSize>(() => {
    const stored = localStorage.getItem(SIZE_KEY);
    return isPosterSize(stored) ? stored : 'small';
  });

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(SIZE_KEY, size);
  }, [size]);

  return { view, size, setView, setSize };
}
