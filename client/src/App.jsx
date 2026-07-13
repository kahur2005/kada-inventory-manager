import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRedirect from './components/RoleRedirect';
import Login from './pages/Login';
import Register from './pages/Register';
import Pending from './pages/Pending';
import UsersPage from './pages/admin/UsersPage';
import ItemsPage from './pages/admin/ItemsPage';
import WarehousesPage from './pages/admin/WarehousesPage';
import StoresPage from './pages/admin/StoresPage';
import WarehouseStockPage from './pages/admin/WarehouseStockPage';
import AlertsPage from './pages/warehouse/AlertsPage';
import WarehouseStockClientPage from './pages/warehouse/StockPage';
import BoxesPage from './pages/warehouse/BoxesPage';
import AssignPage from './pages/warehouse/AssignPage';
import ScanPage from './pages/store/ScanPage';
import StoreStockPage from './pages/store/StockPage';
import HistoryPage from './pages/store/HistoryPage';
import RoleHomePlaceholder from './pages/RoleHomePlaceholder';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<Layout />}>
          <Route path="/" element={<RoleRedirect />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/pending" element={<Pending />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/items" element={<ItemsPage />} />
            <Route path="/admin/warehouses" element={<WarehousesPage />} />
            <Route path="/admin/stores" element={<StoresPage />} />
            <Route path="/admin/warehouse-stock" element={<WarehouseStockPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
            <Route path="/warehouse/alerts" element={<AlertsPage />} />
            <Route path="/warehouse/stock" element={<WarehouseStockClientPage />} />
            <Route path="/warehouse/boxes" element={<BoxesPage />} />
            <Route path="/warehouse/assign" element={<AssignPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['store_admin']} />}>
            <Route path="/store/scan" element={<ScanPage />} />
            <Route path="/store/stock" element={<StoreStockPage />} />
            <Route path="/store/history" element={<HistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['driver']} />}>
            <Route path="/driver" element={<RoleHomePlaceholder label="Driver" />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
