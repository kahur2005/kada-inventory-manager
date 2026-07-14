import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoryPage from '../../pages/store/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('HistoryPage', () => {
  test('lists delivered boxes and adjustment log entries', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') {
        return Promise.resolve({
          data: { boxes: [{ _id: 'b1', code: 'BX-0001', assignedDriver: { name: 'Dri' }, items: [{ item: { name: 'Indomie' }, qty: 10 }] }], total: 1, page: 1, limit: 10 },
        });
      }
      if (url === '/logs') {
        return Promise.resolve({
          data: {
            logs: [
              { _id: 'l1', action: 'STOCK_ADJUSTED', meta: { oldQty: 3, newQty: 9 }, timestamp: '2026-07-13T10:00:00.000Z' },
              { _id: 'l2', action: 'DELIVERED', meta: {}, timestamp: '2026-07-13T11:00:00.000Z' },
            ],
            total: 2,
            page: 1,
            limit: 20,
          },
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<HistoryPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } });
    expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 20 } });
    expect(screen.getByText('BX-0001')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.queryByText(new Date('2026-07-13T11:00:00.000Z').toLocaleString())).not.toBeInTheDocument();
  });
});
