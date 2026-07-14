import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeliveriesPage from '../../pages/driver/DeliveriesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('DeliveriesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success) => success({ coords: { latitude: -6.2, longitude: 106.8 } })),
      },
    });
  });

  test('groups boxes by destination store and shows an active-deliveries badge', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        boxes: [
          { _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Store 1', address: 'Jl. A', coords: { lat: 1, lng: 1 } } },
          { _id: 'b2', code: 'BX-0002', status: 'DELIVERED', destinationStore: { name: 'Store 1', address: 'Jl. A', coords: { lat: 1, lng: 1 } } },
        ],
        total: 2,
        page: 1,
        limit: 50,
      },
    });

    render(<DeliveriesPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(screen.getByText('Store 1')).toBeInTheDocument();
    expect(screen.getByLabelText(/active deliveries badge/i)).toHaveTextContent('1');
  });

  test('picking up a box sends geolocation coords', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Store 1', address: 'Jl. A' } }], total: 1, page: 1, limit: 50 },
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { box: {} } });

    render(<DeliveriesPage />);
    await waitFor(() => screen.getByText('BX-0001'));
    fireEvent.click(screen.getByRole('button', { name: /pick up/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/boxes/b1/pickup', { coords: { lat: -6.2, lng: 106.8 } })
    );
  });

  test('starting delivering pings location immediately', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { boxes: [], total: 0, page: 1, limit: 50 } });
    apiClient.post = vi.fn().mockResolvedValue({ data: {} });

    render(<DeliveriesPage />);
    await waitFor(() => screen.getByRole('button', { name: /start delivering/i }));
    fireEvent.click(screen.getByRole('button', { name: /start delivering/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/driver-location', { coords: { lat: -6.2, lng: 106.8 } }));
  });
});
