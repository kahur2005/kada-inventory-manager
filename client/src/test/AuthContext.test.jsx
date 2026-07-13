import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? `hello ${user.role}` : 'no user'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renders no user when no token stored', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('no user')).toBeInTheDocument());
  });
});
