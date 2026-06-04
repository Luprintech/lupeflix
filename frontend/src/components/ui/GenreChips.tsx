interface GenreChipsProps {
  genres: string[];
  active: string | null;
  onSelect: (genre: string | null) => void;
}

export function GenreChips({ genres, active, onSelect }: GenreChipsProps) {
  if (!genres.length) return null;
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      <Chip label="Todos" selected={active === null} onClick={() => onSelect(null)} />
      {genres.map((g) => (
        <Chip key={g} label={g} selected={active === g} onClick={() => onSelect(g)} />
      ))}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        selected
          ? 'border-white bg-white text-black'
          : 'border-netflix-border bg-netflix-surface text-netflix-muted hover:border-white/40 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
