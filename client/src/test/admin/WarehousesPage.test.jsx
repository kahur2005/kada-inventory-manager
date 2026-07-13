import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WarehousesPage from '../../pages/admin/WarehousesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -6.3, lng: 106.9 })}>
      mock-map
    </button>
  ),
}));

describe('WarehousesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists warehouses with a utilization bar', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { warehouses: [{ _id: '1', name: 'WH A', address: 'x', capacityM3: 100, usedM3: 40, utilizationPct: 40, stores: [] }] } });
      }
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    render(<WarehousesPage />);
    await waitFor(() => expect(screen.getByText('WH A')).toBeInTheDocument());
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  test('creates a warehouse using the map picker for coords', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [] } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { warehouse: {} } });

    render(<WarehousesPage />);
    await waitFor(() => screen.getByRole('button', { name: /mock-map/i }));

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'WH B' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'Jl. X' } });
    fireEvent.click(screen.getByRole('button', { name: /mock-map/i }));
    fireEvent.click(screen.getByRole('button', { name: /create warehouse/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/warehouses', {
        name: 'WH B',
        address: 'Jl. X',
        coords: { lat: -6.3, lng: 106.9 },
        capacityM3: 0,
        areaM2: 0,
        stores: [],
      })
    );
  });

  test('links multiple selected stores when creating a warehouse', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [] } });
      if (url === '/stores') {
        return Promise.resolve({
          data: {
            stores: [
              { _id: 's1', name: 'Store 1' },
              { _id: 's2', name: 'Store 2' },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { warehouse: {} } });

    render(<WarehousesPage />);
    await waitFor(() => screen.getByRole('button', { name: /mock-map/i }));

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'WH C' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'Jl. Y' } });
    fireEvent.click(screen.getByRole('button', { name: /mock-map/i }));

    const storesSelect = screen.getByLabelText(/linked stores/i);
    const option1 = screen.getByRole('option', { name: 'Store 1' });
    const option2 = screen.getByRole('option', { name: 'Store 2' });
    option1.selected = true;
    option2.selected = true;
    fireEvent.change(storesSelect);

    fireEvent.click(screen.getByRole('button', { name: /create warehouse/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/warehouses', {
        name: 'WH C',
        address: 'Jl. Y',
        coords: { lat: -6.3, lng: 106.9 },
        capacityM3: 0,
        areaM2: 0,
        stores: ['s1', 's2'],
      })
    );
  });
});
