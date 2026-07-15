import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WarehouseHistoryPage from '../../pages/warehouse/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

const LOGS = [
  {
    _id: 'l1',
    timestamp: '2026-07-01T10:00:00.000Z',
    action: 'BOX_PACKED',
    actor: { name: 'Wanda' },
    box: { code: 'BX-0001' },
  },
  {
    _id: 'l2',
    timestamp: '2026-07-02T11:00:00.000Z',
    action: 'DELIVERED',
    actor: { name: 'Sari' },
    box: { code: 'BX-0001' },
  },
];

function renderPage(initialEntry = '/warehouse/history') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WarehouseHistoryPage />
    </MemoryRouter>
  );
}

describe('WarehouseHistoryPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists box events with time, code, action, and actor', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: LOGS, total: 2, page: 1, limit: 50 } });

    renderPage();
    await waitFor(() => expect(screen.getByText('BOX_PACKED')).toBeInTheDocument());

    expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 50 } });
    expect(screen.getAllByText('BX-0001')).toHaveLength(2);
    expect(screen.getByText('Wanda')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-07-01T10:00:00.000Z').toLocaleString())).toBeInTheDocument();
  });

  test('filters by date range', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: [], total: 0, page: 1, limit: 50 } });

    renderPage();
    await waitFor(() => screen.getByLabelText(/from/i));
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-07-15' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/logs', {
        params: { page: 1, limit: 50, from: '2026-07-01', to: '2026-07-15' },
      })
    );
  });

  test('scopes to a single box when ?box= is in the URL', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: [LOGS[0]], total: 1, page: 1, limit: 50 } });

    renderPage('/warehouse/history?box=b1');
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 50, box: 'b1' } })
    );
    expect(screen.getByRole('link', { name: /show all/i })).toBeInTheDocument();
  });
});
