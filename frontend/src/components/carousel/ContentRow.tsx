import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { Movie } from '../../types';
import { HoverCard } from '../ui/HoverCard';

interface ContentRowProps {
  title: string;
  items: Movie[];
  onCardClick: (m: Movie) => void;
  isSeries?: boolean;
  showRating?: boolean;
  /** Map of movieId -> progress (0..1) for continue-watching rows. */
  progressMap?: Record<number, number>;
  onSeeMore?: () => void;
}

export function ContentRow({
  title,
  items,
  onCardClick,
  isSeries,
  showRating,
  progressMap,
  onSeeMore,
}: ContentRowProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    dragFree: true,
    containScroll: 'trimSnaps',
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  if (!items.length) return null;

  return (
    <section className="group/row mb-8">
      <div className="mb-2 flex items-baseline justify-between px-4 md:px-12">
        <h2 className="text-lg font-bold text-white sm:text-xl">{title}</h2>
        {onSeeMore && (
          <button
            type="button"
            onClick={onSeeMore}
            className="text-sm font-medium text-netflix-muted transition-colors hover:text-white"
          >
            Ver más
          </button>
        )}
      </div>

      <div className="relative">
        {/* Prev arrow */}
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => emblaApi?.scrollPrev()}
          className={`absolute left-0 top-0 z-30 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-netflix-bg to-transparent text-white transition-opacity md:flex ${
            canPrev ? 'opacity-0 group-hover/row:opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <ChevronLeft />
        </button>

        {/* overflow-hidden is on the Embla root — the hover portal renders via
            createPortal to document.body so it's never clipped here. */}
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex gap-3 px-4 md:px-12">
            {items.map((m) => (
              <div
                key={`${m.id}-${m.series_key ?? ''}`}
                className="w-28 shrink-0 sm:w-36 md:w-44"
              >
                <HoverCard
                  movie={m}
                  isSeries={isSeries}
                  showRating={showRating}
                  progress={progressMap?.[m.id]}
                  onClick={() => onCardClick(m)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Next arrow */}
        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => emblaApi?.scrollNext()}
          className={`absolute right-0 top-0 z-30 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-netflix-bg to-transparent text-white transition-opacity md:flex ${
            canNext ? 'opacity-0 group-hover/row:opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
    </svg>
  );
}
