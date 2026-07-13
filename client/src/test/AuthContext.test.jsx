import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

vi.mock('../api/client');

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? `hello ${user.role}` : 'no user'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  test('renders no user when no token stored', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('no user')).toBeInTheDocument());
  });

  test('fetches /auth/me when a token is stored and exposes the returned user', async () => {
    localStorage.setItem('logistiq_token', 'fake-token');
    apiClient.get = vi.fn().mockResolvedValue({ data: { user: { id: '1', role: 'driver', name: 'D', email: 'd@example.com', warehouse: null, store: null } } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('hello driver')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  test('clears user and token if /auth/me fails (expired/invalid token)', async () => {
    localStorage.setItem('logistiq_token', 'stale-token');
    apiClient.get = vi.fn().mockRejectedValue(new Error('401'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('no user')).toBeInTheDocument());
    expect(localStorage.getItem('logistiq_token')).toBeNull();
  });
});
