import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardMap from '../components/DashboardMap';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));
vi.mock('leaflet', () => ({
  default: { divIcon: vi.fn().mockReturnValue({}) },
}));

describe('DashboardMap', () => {
  test('renders one marker per warehouse, store, and driver location with coords', () => {
    render(
      <DashboardMap
        warehouses={[{ _id: 'w1', name: 'WH A', coords: { lat: 1, lng: 1 } }, { _id: 'w2', name: 'WH B (no coords)', coords: null }]}
        stores={[{ _id: 's1', name: 'Store 1', coords: { lat: 2, lng: 2 } }]}
        driverLocations={[{ _id: 'd1', driver: { name: 'Dri' }, coords: { lat: 3, lng: 3 }, updatedAt: new Date().toISOString() }]}
      />
    );
    expect(screen.getAllByTestId('marker')).toHaveLength(3);
    expect(screen.getByText(/dri — updated/i)).toBeInTheDocument();
  });

  test('excludes entries with partial coords (lat present, lng missing)', () => {
    render(
      <DashboardMap
        warehouses={[{ _id: 'w1', name: 'WH A', coords: { lat: 5, lng: null } }]}
        stores={[{ _id: 's1', name: 'Store 1', coords: { lat: 5, lng: null } }]}
        driverLocations={[{ _id: 'd1', driver: { name: 'Dri' }, coords: { lat: 5, lng: null }, updatedAt: new Date().toISOString() }]}
      />
    );
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });
});
