import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const NAV_LINKS = [
  { to: '/home', label: 'Inicio' },
  { to: '/movies', label: 'Películas' },
  { to: '/series', label: 'Series' },
  { to: '/favorites', label: 'Favoritos' },
  { to: '/watchlist', label: 'Ver después' },
];

export function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) navigate(`/movies?search=${encodeURIComponent(q)}`);
  };

  const initials = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled ? 'bg-netflix-bg/95 backdrop-blur' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <nav className="flex items-center gap-4 px-4 py-3 sm:px-12">
        <Link to="/home" className="shrink-0 text-2xl font-black tracking-tight text-netflix-red">
          LUPEFLIX
        </Link>

        {/* Desktop / scrollable nav links */}
        <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto sm:gap-2">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `shrink-0 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-netflix-muted hover:text-white'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={submitSearch} className="flex items-center">
          <div
            className={`flex items-center overflow-hidden rounded border transition-all duration-300 ${
              searchOpen
                ? 'w-40 border-netflix-border bg-black/60 sm:w-56'
                : 'w-9 border-transparent'
            }`}
          >
            <button
              type="button"
              aria-label="Buscar"
              onClick={() => setSearchOpen((o) => !o)}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <input
              ref={searchRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Títulos..."
              className={`w-full bg-transparent pr-2 text-sm text-white placeholder:text-netflix-muted focus:outline-none ${
                searchOpen ? 'block' : 'hidden'
              }`}
              onBlur={() => !searchValue && setSearchOpen(false)}
            />
          </div>
        </form>

        {/* User menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5"
            aria-label="Menú de usuario"
          >
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="h-8 w-8 rounded object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded bg-netflix-red text-sm font-bold text-white">
                {initials}
              </span>
            )}
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 text-white transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-md border border-netflix-border bg-netflix-surface shadow-card">
              <div className="border-b border-netflix-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                <p className="truncate text-xs text-netflix-muted">{user?.email}</p>
              </div>
              <MenuItem to="/profile" onClick={() => setMenuOpen(false)}>
                Mi perfil
              </MenuItem>
              <MenuItem to="/profile" onClick={() => setMenuOpen(false)}>
                Historial
              </MenuItem>
              {isAdmin && (
                <a
                  href="/admin.html"
                  className="block px-4 py-2.5 text-sm text-netflix-muted transition-colors hover:bg-netflix-surface2 hover:text-white"
                >
                  Panel de administración
                </a>
              )}
              <button
                type="button"
                onClick={logout}
                className="block w-full border-t border-netflix-border px-4 py-2.5 text-left text-sm text-netflix-muted transition-colors hover:bg-netflix-surface2 hover:text-white"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

function MenuItem({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-2.5 text-sm text-netflix-muted transition-colors hover:bg-netflix-surface2 hover:text-white"
    >
      {children}
    </Link>
  );
}
