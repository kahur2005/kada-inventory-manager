import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignPage from '../../pages/warehouse/AssignPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({}) } }));

let scannerOnScan;
vi.mock('../../components/QrScanner', () => ({
  default: ({ onScan }) => {
    scannerOnScan = onScan;
    return <div data-testid="scanner" />;
  },
}));

describe('AssignPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('checking boxes then scanning a driver QR assigns them', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001' }], total: 1, page: 1, limit: 10 } });
      if (url === '/drivers') return Promise.resolve({ data: { drivers: [{ id: 'd1', name: 'Dri' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'assigned', driver: { id: 'd1', name: 'Dri' } } });

    render(<AssignPage />);
    await waitFor(() => screen.getByLabelText(/bx-0001/i));

    fireEvent.click(screen.getByLabelText(/bx-0001/i));
    scannerOnScan(JSON.stringify({ type: 'driver', id: 'd1', token: 'drv-tok' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/driver', { token: 'drv-tok', boxIds: ['b1'] }));
  });

  test('manual dropdown fallback assigns checked boxes one by one', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001' }], total: 1, page: 1, limit: 10 } });
      if (url === '/drivers') return Promise.resolve({ data: { drivers: [{ id: 'd1', name: 'Dri' }] } });
      return Promise.reject(new Error('unexpected'));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: {} } });

    render(<AssignPage />);
    await waitFor(() => screen.getByLabelText(/bx-0001/i));

    fireEvent.click(screen.getByLabelText(/bx-0001/i));
    fireEvent.change(screen.getByLabelText(/manual driver/i), { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('button', { name: /assign selected/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/boxes/b1/assign', { driverId: 'd1' }));
  });
});
