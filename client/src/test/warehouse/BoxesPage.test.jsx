import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BoxesPage from '../../pages/warehouse/BoxesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('BoxesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists boxes and creates a new one, showing its QR', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' } }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'i1', name: 'Indomie' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: { code: 'BX-0002' }, qrDataUrl: 'data:image/png;base64,XYZ' } });

    render(<BoxesPage />);
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/destination store/i), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/^item$/i), { target: { value: 'i1' } });
    fireEvent.change(screen.getByLabelText(/^qty$/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /create box/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/boxes', { destinationStore: 's1', items: [{ item: 'i1', qty: 5 }] })
    );
    await waitFor(() => expect(screen.getByAltText(/BX-0002/)).toBeInTheDocument());
  });

  test('filters by status', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    render(<BoxesPage />);
    await waitFor(() => screen.getByLabelText(/status/i));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'DELIVERED' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } })
    );
  });
});
