import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Plans 2-4 append entries for their own routes as those screens ship.
const NAV_ITEMS = {
  superadmin: [{ to: '/admin/users', label: 'Users' }],
  warehouse_admin: [],
  store_admin: [],
  driver: [{ to: '/driver', label: 'My Deliveries' }],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const items = (user && NAV_ITEMS[user.role]) || [];

  return (
    <div className="app-shell">
      <nav>
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>{item.label}</Link>
            </li>
          ))}
        </ul>
        {user && <button onClick={logout}>Log out</button>}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
