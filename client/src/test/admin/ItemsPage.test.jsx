import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemsPage from '../../pages/admin/ItemsPage';
import apiClient from '../../api/client';
import Swal from 'sweetalert2';

vi.mock('../../api/client');
vi.mock('sweetalert2');

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Swal.fire = vi.fn().mockResolvedValue({ isConfirmed: true });
  });

  test('lists items and creates a new one', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { items: [{ _id: '1', name: 'Indomie', sku: 'SKU1', unit: 'pcs' }] } });
    apiClient.post = vi.fn().mockResolvedValue({ data: { item: { _id: '2', name: 'Beras', sku: 'SKU2', unit: 'kg' } } });

    render(<ItemsPage />);
    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Beras' } });
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'SKU2' } });
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/items', { name: 'Beras', sku: 'SKU2', unit: 'pcs', volumeM3: undefined }));
  });

  test('deletes an item after confirming', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { items: [{ _id: '1', name: 'Indomie', sku: 'SKU1', unit: 'pcs' }] } });
    apiClient.delete = vi.fn().mockResolvedValue({ data: { message: 'Item deleted' } });

    render(<ItemsPage />);
    await waitFor(() => screen.getByText('Indomie'));
    fireEvent.click(screen.getByRole('button', { name: /delete indomie/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/items/1'));
  });
});
