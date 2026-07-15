import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrackingPage from '../../pages/warehouse/TrackingPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/LogisticsMap', () => ({
  default: ({ locations }) => (
    <div data-testid="map">
      {locations.warehouses.length} warehouses, {locations.stores.length} stores, {locations.drivers.length} drivers
    </div>
  ),
}));
vi.mock('../../components/DriverTripToggle', () => ({
  default: () => <div data-testid="driver-toggle" />,
}));

describe('TrackingPage', () => {
  test('shows driver locations on the map', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        warehouses: [{ id: 'w1', name: 'Gudang 1', lat: -6.2, lng: 106.8, address: 'Jakarta' }],
        stores: [{ id: 's1', name: 'Toko 1', lat: -6.3, lng: 106.7, address: 'Bekasi' }],
        drivers: [{ id: 'd1', name: 'Dri', lat: -6.25, lng: 106.75, heading: 0, speedKph: 60, status: 'idle', lastUpdated: new Date() }],
      },
    });
    render(<TrackingPage />);
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('1 drivers'));
  });
});
