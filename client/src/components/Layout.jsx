import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Plans 2-4 append entries for their own routes as those screens ship.
const NAV_ITEMS = {
  superadmin: [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/items', label: 'Items' },
    { to: '/admin/warehouses', label: 'Warehouses' },
    { to: '/admin/stores', label: 'Stores' },
    { to: '/admin/warehouse-stock', label: 'Warehouse Stock' },
  ],
  warehouse_admin: [
    { to: '/warehouse/alerts', label: 'Alerts' },
    { to: '/warehouse/stock', label: 'Stock' },
    { to: '/warehouse/boxes', label: 'Boxes' },
    { to: '/warehouse/assign', label: 'Assign' },
    { to: '/warehouse/tracking', label: 'Tracking' },
  ],
  store_admin: [
    { to: '/store/scan', label: 'Scan' },
    { to: '/store/stock', label: 'Stock' },
    { to: '/store/history', label: 'History' },
  ],
  driver: [
    { to: '/driver', label: 'My Deliveries' },
    { to: '/driver/qr', label: 'My QR' },
  ],
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
