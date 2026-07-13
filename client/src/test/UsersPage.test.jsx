import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersPage from '../pages/admin/UsersPage';
import apiClient from '../api/client';
import Swal from 'sweetalert2';

vi.mock('../api/client');
vi.mock('sweetalert2');

describe('UsersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Swal.fire = vi.fn().mockResolvedValue({ isConfirmed: true });
  });

  test('lists users returned by the API', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        users: [
          { id: '1', name: 'Ana', email: 'ana@example.com', role: 'unassigned', warehouse: null, store: null },
        ],
        total: 1,
        page: 1,
        limit: 10,
      },
    });

    render(<UsersPage />);

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/users', { params: { search: '', page: 1, limit: 10 } });
  });

  test('changing a role select PATCHes the role and refreshes the list', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { users: [{ id: '1', name: 'Ana', email: 'ana@example.com', role: 'unassigned', warehouse: null, store: null }], total: 1, page: 1, limit: 10 },
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { user: {} } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText('Ana'));

    fireEvent.change(screen.getByLabelText(/role for ana/i), { target: { value: 'driver' } });

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/users/1/role', { role: 'driver' }));
  });

  test('delete button confirms via SweetAlert2 before calling DELETE', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { users: [{ id: '1', name: 'Ana', email: 'ana@example.com', role: 'unassigned', warehouse: null, store: null }], total: 1, page: 1, limit: 10 },
    });
    apiClient.delete = vi.fn().mockResolvedValue({ data: { message: 'User deleted' } });

    render(<UsersPage />);
    await waitFor(() => screen.getByText('Ana'));

    fireEvent.click(screen.getByRole('button', { name: /delete ana/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/users/1'));
  });
});
