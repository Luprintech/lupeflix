interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = 'h-8 w-8' }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin text-netflix-red ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Cargando"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-netflix-bg">
      <Spinner className="h-12 w-12" />
    </div>
  );
}
