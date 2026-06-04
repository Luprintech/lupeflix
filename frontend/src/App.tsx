import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { ModalProvider } from './contexts/ModalContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { MoviesPage } from './pages/MoviesPage';
import { SeriesPage } from './pages/SeriesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { ProfilePage } from './pages/ProfilePage';

/** Authenticated shell: navbar + modals available on every app route. */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ModalProvider>
        <Layout>{children}</Layout>
      </ModalProvider>
    </ProtectedRoute>
  );
}

/** The vanilla admin panel lives outside React at /admin.html. */
function AdminRedirect() {
  useEffect(() => {
    window.location.href = '/admin.html';
  }, []);
  return null;
}

/** Redirect "/" to home or login based on auth handled inside ProtectedRoute. */
function RootRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/home', { replace: true });
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminRedirect />} />

      <Route
        path="/home"
        element={
          <AppShell>
            <HomePage />
          </AppShell>
        }
      />
      <Route
        path="/movies"
        element={
          <AppShell>
            <MoviesPage />
          </AppShell>
        }
      />
      <Route
        path="/series"
        element={
          <AppShell>
            <SeriesPage />
          </AppShell>
        }
      />
      <Route
        path="/favorites"
        element={
          <AppShell>
            <FavoritesPage />
          </AppShell>
        }
      />
      <Route
        path="/watchlist"
        element={
          <AppShell>
            <WatchlistPage />
          </AppShell>
        }
      />
      <Route
        path="/profile"
        element={
          <AppShell>
            <ProfilePage />
          </AppShell>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RootRedirect />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
