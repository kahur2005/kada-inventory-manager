import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import apiClient from '../api/client';

vi.mock('../api/client');

describe('App routing', () => {
  test('unauthenticated user hitting / is redirected to /login', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { user: null } });
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument());
  });

  test('renders the register page at /register', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /register/i })).toBeInTheDocument();
  });
});
