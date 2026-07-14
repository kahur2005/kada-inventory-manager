import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import QrPage from '../../pages/driver/QrPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('QrPage', () => {
  test('renders shipment page with form and table', async () => {
    apiClient.get = vi.fn().mockImplementation((url) => {
      if (url === '/shipments') return Promise.resolve({ data: { shipments: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'i1', name: 'Indomie', sku: 'SKU001' }] } });
      if (url === '/warehouse-stock') return Promise.resolve({ data: { stocks: [{ warehouse: { _id: 'w1', name: 'Gudang A' } }] } });
      if (url === '/store-stock') return Promise.resolve({ data: { stocks: [{ store: { _id: 's1', name: 'Toko B' } }] } });
      return Promise.resolve({ data: {} });
    });

    render(<QrPage />);

    await waitFor(() => {
      expect(screen.getByText('Shipment & QR Code')).toBeInTheDocument();
    });

    expect(screen.getByText('Buat Shipment Baru')).toBeInTheDocument();
    expect(screen.getByText('Daftar Shipment')).toBeInTheDocument();
  });
});
