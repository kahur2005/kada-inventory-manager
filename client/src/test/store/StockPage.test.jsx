import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockPage from '../../pages/store/StockPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');

describe('Store StockPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 'u1', role: 'store_admin', store: 'store1' } });
  });

  test('shows stock with a below-threshold badge', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] },
    });

    render(<StockPage />);
    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());
    expect(screen.getByText(/low stock/i)).toBeInTheDocument();
  });

  test('opname mode: editing qty and saving PATCHes /adjust', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] },
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { storeStock: {} } });

    render(<StockPage />);
    await waitFor(() => screen.getByText('Indomie'));

    fireEvent.click(screen.getByRole('button', { name: /opname mode/i }));
    const qtyInput = screen.getByLabelText(/qty for indomie/i);
    fireEvent.change(qtyInput, { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /save indomie/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/store-stock/ss1/adjust', { qty: 8 }));
  });
});
