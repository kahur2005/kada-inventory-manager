import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    render(<AlertsPage />);
    await waitFor(() => expect(screen.getByText(/Store 1 — Item X: 3 left \(threshold 10\)/)).toBeInTheDocument());
  });

  test('shows a friendly message when there are no alerts', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { alerts: [] } });
    render(<AlertsPage />);
    await waitFor(() => expect(screen.getByText(/no low-stock alerts/i)).toBeInTheDocument());
  });
});
