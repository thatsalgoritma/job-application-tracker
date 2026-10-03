import { Navigate } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { useAuth } from './auth-context';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p className="page-loading" role="status">Checking your session…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
