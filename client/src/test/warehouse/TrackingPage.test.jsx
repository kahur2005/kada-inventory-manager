import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrackingPage from '../../pages/warehouse/TrackingPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/DashboardMap', () => ({
  default: ({ driverLocations }) => <div data-testid="map">{driverLocations.length} drivers</div>,
}));

describe('TrackingPage', () => {
  test('shows driver locations on the map', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { driverLocations: [{ _id: 'd1', driver: { name: 'Dri' }, coords: { lat: 1, lng: 1 } }] } });
    render(<TrackingPage />);
    await waitFor(() => expect(screen.getByText('1 drivers')).toBeInTheDocument());
  });
});
