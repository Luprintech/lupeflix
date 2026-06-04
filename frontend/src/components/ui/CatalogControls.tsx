export type CatalogView = 'grid' | 'compact' | 'list';
export type PosterSize = 'small' | 'medium' | 'large';

interface CatalogControlsProps {
  view: CatalogView;
  size: PosterSize;
  onViewChange: (view: CatalogView) => void;
  onSizeChange: (size: PosterSize) => void;
}

const VIEW_OPTIONS: Array<{ value: CatalogView; label: string }> = [
  { value: 'grid', label: 'Grid' },
  { value: 'compact', label: 'Compacta' },
  { value: 'list', label: 'Lista' },
];

const SIZE_TO_RANGE: Record<PosterSize, number> = {
  small: 0,
  medium: 1,
  large: 2,
};

const RANGE_TO_SIZE: PosterSize[] = ['small', 'medium', 'large'];

export function CatalogControls({ view, size, onViewChange, onSizeChange }: CatalogControlsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-netflix-border bg-netflix-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onViewChange(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              view === option.value
                ? 'bg-netflix-red text-white'
                : 'bg-netflix-surface2 text-netflix-muted hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-3 text-sm text-netflix-muted">
        <span>Portadas</span>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={SIZE_TO_RANGE[size]}
          onChange={(e) => onSizeChange(RANGE_TO_SIZE[Number(e.target.value)] ?? 'medium')}
          className="accent-netflix-red"
          disabled={view === 'list'}
        />
        <span className="w-16 text-right text-white">
          {size === 'small' ? 'Pequeñas' : size === 'large' ? 'Grandes' : 'Medias'}
        </span>
      </label>
    </div>
  );
}
