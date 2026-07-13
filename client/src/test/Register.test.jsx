import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from '../pages/Register';
import { AuthProvider } from '../context/AuthContext';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('Register', () => {
  test('registers and stores the token', async () => {
    apiClient.post = vi.fn().mockResolvedValue({
      data: { token: 'new-token', user: { id: '1', name: 'Ana', email: 'ana@example.com', role: 'unassigned', warehouse: null, store: null } },
    });
    apiClient.get = vi.fn().mockResolvedValue({ data: { user: { id: '1', role: 'unassigned' } } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(localStorage.getItem('logistiq_token')).toBe('new-token'));
    expect(apiClient.post).toHaveBeenCalledWith('/auth/register', { name: 'Ana', email: 'ana@example.com', password: 'secret123' });
  });
});
