import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
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
    { to: '/warehouse/dashboard', label: 'Dashboard' },
    { to: '/warehouse/alerts', label: 'Alerts' },
    { to: '/warehouse/stock', label: 'Stock' },
    { to: '/warehouse/boxes', label: 'Boxes' },
    { to: '/warehouse/assign', label: 'Assign' },
    { to: '/warehouse/tracking', label: 'Tracking' },
    { to: '/warehouse/history', label: 'History' },
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

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  return (
    <div className="app-shell">
      <nav>
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end>{item.label}</NavLink>
            </li>
          ))}
        </ul>
        {user?.role === 'store_admin' && user.store && (
          <div className="store-info" aria-label="Your store">
            <strong>{user.store.name}</strong>
            {user.store.address && <div>{user.store.address}</div>}
          </div>
        )}
        {user && <button onClick={logout}>Log out</button>}
      </nav>
      <main>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
        <Outlet />
      </main>
    </div>
  );
}
