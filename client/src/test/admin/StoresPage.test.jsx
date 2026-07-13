import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StoresPage from '../../pages/admin/StoresPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -6.2, lng: 106.8 })}>
      mock-map
    </button>
  ),
}));

describe('StoresPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists stores and creates a new one via the map picker', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { stores: [{ _id: '1', name: 'Store 1', address: 'x' }] } });
    apiClient.post = vi.fn().mockResolvedValue({ data: { store: {} } });

    render(<StoresPage />);
    await waitFor(() => expect(screen.getByText('Store 1')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Store 2' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'Jl. Y' } });
    fireEvent.click(screen.getByRole('button', { name: /mock-map/i }));
    fireEvent.click(screen.getByRole('button', { name: /create store/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/stores', { name: 'Store 2', address: 'Jl. Y', coords: { lat: -6.2, lng: 106.8 } })
    );
  });
});
