import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('Login', () => {
  test('submits credentials and shows an error on failure', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { user: null } });
    apiClient.post = vi.fn().mockRejectedValue({ response: { data: { message: 'Invalid credentials' } } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });
});
