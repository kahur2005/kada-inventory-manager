import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import * as AuthContextModule from '../context/AuthContext';

describe('Layout', () => {
  test('shows superadmin nav items for a superadmin user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: '1', role: 'superadmin', name: 'Super' },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /users/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my deliveries/i })).not.toBeInTheDocument();
  });

  test('shows driver nav items for a driver user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: '2', role: 'driver', name: 'Dri' },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /my deliveries/i })).toBeInTheDocument();
  });
});
