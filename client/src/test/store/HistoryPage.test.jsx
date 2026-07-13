import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoryPage from '../../pages/store/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('HistoryPage', () => {
  test('lists delivered boxes for the store', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { boxes: [{ _id: 'b1', code: 'BX-0001', assignedDriver: { name: 'Dri' }, items: [{ item: { name: 'Indomie' }, qty: 10 }] }], total: 1, page: 1, limit: 10 },
    });

    render(<HistoryPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } });
    expect(screen.getByText('Dri')).toBeInTheDocument();
  });
});
