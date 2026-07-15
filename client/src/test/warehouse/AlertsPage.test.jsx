import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AlertsPage from '../../pages/warehouse/AlertsPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('AlertsPage', () => {
  test('renders one card per alert', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        alerts: [
          { _id: '1', store: { name: 'Store 1' }, item: { name: 'Item X' }, qty: 3, threshold: 10 },
        ],
      },
    });

    render(
      <BrowserRouter>
        <AlertsPage />
      </BrowserRouter>
    );
    await waitFor(() => {
      const card = screen.getAllByRole('button', { name: /pack a box/i })[0];
      expect(card).toBeInTheDocument();
    });
    const card = screen.getAllByRole('button', { name: /pack a box/i })[0].closest('.alert-card');
    expect(within(card).getByText(/Store 1/)).toBeInTheDocument();
    expect(within(card).getByText(/3 left/)).toBeInTheDocument();
  });

  test('shows a friendly message when there are no alerts', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { alerts: [] } });
    render(
      <BrowserRouter>
        <AlertsPage />
      </BrowserRouter>
    );
    await waitFor(() => expect(screen.getByText(/no low-stock alerts/i)).toBeInTheDocument());
  });
});
