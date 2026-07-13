import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import MapPicker from '../components/MapPicker';

let capturedHandlers;

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => <div data-testid="marker" />,
  useMapEvents: (handlers) => {
    capturedHandlers = handlers;
    return null;
  },
}));

vi.mock('leaflet', () => ({
  default: { icon: vi.fn().mockReturnValue({}) },
}));

describe('MapPicker', () => {
  beforeEach(() => {
    capturedHandlers = undefined;
  });

  test('calls onChange with lat/lng when the map is clicked', () => {
    const onChange = vi.fn();
    render(<MapPicker coords={null} onChange={onChange} />);
    capturedHandlers.click({ latlng: { lat: -6.3, lng: 106.9 } });
    expect(onChange).toHaveBeenCalledWith({ lat: -6.3, lng: 106.9 });
  });

  test('renders no marker when coords is null', () => {
    const { queryByTestId } = render(<MapPicker coords={null} onChange={vi.fn()} />);
    expect(queryByTestId('marker')).not.toBeInTheDocument();
  });

  test('renders a marker when coords is set', () => {
    const { getByTestId } = render(<MapPicker coords={{ lat: 1, lng: 2 }} onChange={vi.fn()} />);
    expect(getByTestId('marker')).toBeInTheDocument();
  });
});
