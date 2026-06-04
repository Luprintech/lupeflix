import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FullPageSpinner } from './ui/Spinner';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
