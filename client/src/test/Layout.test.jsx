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

  test('shows the store name and address for a store_admin user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: '3',
        role: 'store_admin',
        name: 'Sari',
        store: { id: 's1', name: 'Toko Maju', address: 'Jl. Mawar 1' },
      },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByText('Toko Maju')).toBeInTheDocument();
    expect(screen.getByText('Jl. Mawar 1')).toBeInTheDocument();
  });

  test('shows no store info for non-store roles', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: '2', role: 'driver', name: 'Dri' },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText(/your store/i)).not.toBeInTheDocument();
  });
});
