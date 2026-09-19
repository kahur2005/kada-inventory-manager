import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogisticsMap from '../components/LogisticsMap';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => null,
  useMap: () => ({ flyTo: vi.fn() }),
}));

vi.mock('leaflet', () => ({
  default: { DivIcon: class DivIcon {} },
}));

describe('LogisticsMap', () => {
  test('does not render markers for locations without finite coordinates', () => {
    render(
      <LogisticsMap
        locations={{
          warehouses: [
            { id: 'w1', name: 'Valid warehouse', lat: 1, lng: 1 },
            { id: 'w2', name: 'Missing warehouse', lat: undefined, lng: 2 },
          ],
          stores: [{ id: 's1', name: 'Missing store', lat: 3, lng: null }],
          drivers: [{ id: 'd1', name: 'Missing driver', lat: Number.NaN, lng: 4 }],
        }}
      />,
    );

    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });
});
