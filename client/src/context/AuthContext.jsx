import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

const AuthContext = createContext(null);
const TOKEN_KEY = 'logistiq_token';

function decodeJwtPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    const payload = decodeJwtPayload(token);
    if (!payload) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Plan 1 replaces this stub with `apiClient.get('/auth/me')`.
    setUser({ id: payload.id, role: payload.role });
    setLoading(false);
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setToken(res.data.token);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
