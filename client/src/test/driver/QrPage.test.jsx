import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import QrPage from '../../pages/driver/QrPage';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,DRIVERQR') },
}));

describe('QrPage', () => {
  test('renders a full-screen QR built from the driver\'s own id and token', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Dri', role: 'driver', driverQrToken: 'tok-123' },
    });

    render(<QrPage />);

    await waitFor(() => expect(screen.getByAltText(/your driver qr/i)).toHaveAttribute('src', 'data:image/png;base64,DRIVERQR'));

    const QRCode = (await import('qrcode')).default;
    expect(QRCode.toDataURL).toHaveBeenCalledWith(JSON.stringify({ type: 'driver', id: 'u1', token: 'tok-123' }));
  });
});
