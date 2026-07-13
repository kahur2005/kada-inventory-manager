import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WarehouseStockPage from '../../pages/admin/WarehouseStockPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('WarehouseStockPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('adds stock for the selected warehouse and item', async () => {
    apiClient.get = vi.fn((url, config) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'it1', name: 'Indomie' }] } });
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { warehouseStock: {} } });

    render(<WarehouseStockPage />);
    await waitFor(() => screen.getByLabelText(/warehouse/i));

    fireEvent.change(screen.getByLabelText(/warehouse/i), { target: { value: 'wh1' } });
    await waitFor(() => screen.getByLabelText(/^item$/i));
    fireEvent.change(screen.getByLabelText(/^item$/i), { target: { value: 'it1' } });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /add stock/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/warehouse-stock/add', { warehouse: 'wh1', item: 'it1', qty: 25 }));
  });
});
