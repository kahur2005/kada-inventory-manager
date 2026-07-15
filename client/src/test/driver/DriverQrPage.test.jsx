import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DriverQrPage from '../../pages/driver/DriverQrPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}));

describe('DriverQrPage', () => {
  beforeEach(() => {
    // clearAllMocks (not resetAllMocks): resetting would wipe the qrcode
    // factory's mockResolvedValue and toDataURL would return undefined
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'd1', role: 'driver', name: 'Dri', driverQrToken: 'tok-1' },
    });
  });

  test('lists the packages the driver carries with code and destination', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        boxes: [
          { _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Toko A', address: 'Jl. Mawar 1' } },
          { _id: 'b2', code: 'BX-0002', status: 'IN_TRANSIT', destinationStore: { name: 'Toko B', address: 'Jl. Melati 2' } },
          { _id: 'b3', code: 'BX-0003', status: 'DELIVERED', destinationStore: { name: 'Toko C', address: 'Jl. Anggrek 3' } },
        ],
        total: 3,
        page: 1,
        limit: 50,
      },
    });

    render(<DriverQrPage />);
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { page: 1, limit: 50 } });
    expect(screen.getByText(/packages you carry/i)).toBeInTheDocument();
    expect(screen.getByText('Toko A')).toBeInTheDocument();
    expect(screen.getByText('Jl. Mawar 1')).toBeInTheDocument();
    expect(screen.getByText('BX-0002')).toBeInTheDocument();
    // DELIVERED boxes are history, not cargo
    expect(screen.queryByText('BX-0003')).not.toBeInTheDocument();
  });

  test('shows an empty message when carrying nothing', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { boxes: [], total: 0, page: 1, limit: 50 } });

    render(<DriverQrPage />);
    await waitFor(() => expect(screen.getByText(/no packages assigned yet/i)).toBeInTheDocument());
  });
});
