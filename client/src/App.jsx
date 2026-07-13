import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Placeholder label="LogistiQ" />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
