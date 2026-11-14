import { useAuth } from '../Auth/authContext.jsx';
export default function RoleGate({ role = 'admin', children, fallback = null }) {
  const { user } = useAuth();
  return user?.role === role ? children : fallback;
}
export { RoleGate };
