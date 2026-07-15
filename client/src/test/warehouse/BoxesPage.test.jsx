import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BoxesPage from '../../pages/warehouse/BoxesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

function renderPage() {
  return render(
    <MemoryRouter>
      <BoxesPage />
    </MemoryRouter>
  );
}

describe('BoxesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists boxes and creates a new one, showing its QR', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' }, createdAt: '2026-07-01T10:00:00.000Z' }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'i1', name: 'Indomie' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: { code: 'BX-0002' }, qrDataUrl: 'data:image/png;base64,XYZ' } });

    renderPage();
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

  test('shows when each box was created and links to its history', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' }, createdAt: '2026-07-01T10:00:00.000Z' }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-07-01T10:00:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute('href', '/warehouse/history?box=b1');
  });

  test('filters by status', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => screen.getByLabelText(/status/i));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'DELIVERED' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } })
    );
  });

  test('filters by created date range', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => screen.getByLabelText(/created from/i));
    fireEvent.change(screen.getByLabelText(/created from/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/created to/i), { target: { value: '2026-07-15' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', {
        params: { status: '', search: '', page: 1, limit: 10, from: '2026-07-01', to: '2026-07-15' },
      })
    );
  });
});
