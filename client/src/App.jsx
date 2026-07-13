import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRedirect from './components/RoleRedirect';
import Login from './pages/Login';
import Register from './pages/Register';
import Pending from './pages/Pending';
import UsersPage from './pages/admin/UsersPage';
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
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
            <Route path="/warehouse" element={<RoleHomePlaceholder label="Warehouse Admin" />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['store_admin']} />}>
            <Route path="/store" element={<RoleHomePlaceholder label="Store Admin" />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['driver']} />}>
            <Route path="/driver" element={<RoleHomePlaceholder label="Driver" />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
