import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../Auth/authContext.jsx';
export function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Restoring your session…</p>;
  return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
}
