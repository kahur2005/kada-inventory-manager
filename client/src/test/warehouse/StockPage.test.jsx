import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockPage from '../../pages/warehouse/StockPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');

describe('Warehouse StockPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 'u1', role: 'warehouse_admin', warehouse: 'wh1' } });
  });

  test('shows own warehouse stock and a tab per linked store', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A', stores: [{ _id: 'store1', name: 'Store 1' }] }] } });
      }
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [{ _id: 'ws1', item: { name: 'Indomie' }, qty: 50 }] } });
      if (url === '/store-stock') return Promise.resolve({ data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StockPage />);

    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /store 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /store 1/i }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/store-stock', { params: { store: 'store1' } }));
  });

  test('editing a threshold PATCHes it', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A', stores: [{ _id: 'store1', name: 'Store 1' }] }] } });
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [] } });
      if (url === '/store-stock') return Promise.resolve({ data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] } });
      return Promise.reject(new Error('unexpected'));
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { storeStock: {} } });

    render(<StockPage />);
    fireEvent.click(await screen.findByRole('button', { name: /store 1/i }));
    const thresholdInput = await screen.findByLabelText(/threshold for indomie/i);
    fireEvent.change(thresholdInput, { target: { value: '15' } });
    fireEvent.blur(thresholdInput);

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/store-stock/ss1/threshold', { threshold: 15 }));
  });
});
