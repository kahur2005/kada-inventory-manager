import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Plans 2-4 change these targets as each role's real landing screen ships.
export const ROLE_HOME = {
  superadmin: '/admin/users',
  warehouse_admin: '/warehouse/alerts',
  store_admin: '/store/scan',
  driver: '/driver',
  unassigned: '/pending',
};

export default function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/pending'} replace />;
}
