interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** A row of poster-shaped skeletons for loading carousels/grids. */
export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full" />
      ))}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="mb-8">
      <Skeleton className="mb-3 ml-4 h-6 w-48" />
      <div className="flex gap-3 overflow-hidden px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-32 shrink-0 sm:w-40 md:w-44" />
        ))}
      </div>
    </div>
  );
}
