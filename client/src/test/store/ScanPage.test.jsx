import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScanPage from '../../pages/store/ScanPage';
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

describe('ScanPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('scanning a valid box QR calls /scan/box with the token', async () => {
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'Box delivered', items: [{ name: 'Indomie', qty: 10 }] } });

    render(<ScanPage />);
    scannerOnScan(JSON.stringify({ type: 'box', id: 'b1', token: 'scan-tok' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/box', { token: 'scan-tok' }));
  });

  test('manual code fallback calls /scan/box with the code', async () => {
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'Box delivered', items: [] } });

    render(<ScanPage />);
    fireEvent.change(screen.getByLabelText(/box code/i), { target: { value: 'BX-0007' } });
    fireEvent.click(screen.getByRole('button', { name: /submit code/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/box', { code: 'BX-0007' }));
  });
});
