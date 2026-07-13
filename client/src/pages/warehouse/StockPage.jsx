import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function StockPage() {
  const { user } = useAuth();
  const [linkedStores, setLinkedStores] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [storeStock, setStoreStock] = useState([]);

  useEffect(() => {
    if (!user?.warehouse) return;
    apiClient.get('/warehouses').then((res) => {
      const mine = res.data.warehouses.find((w) => w._id === user.warehouse);
      setLinkedStores(mine ? mine.stores : []);
    });
    apiClient.get('/warehouse-stock', { params: { warehouse: user.warehouse } }).then((res) => {
      setWarehouseStock(res.data.warehouseStock);
    });
  }, [user]);

  const loadStoreStock = useCallback((storeId) => {
    setActiveStoreId(storeId);
    apiClient.get('/store-stock', { params: { store: storeId } }).then((res) => setStoreStock(res.data.storeStock));
  }, []);

  async function handleThresholdChange(row, value) {
    const threshold = Number(value);
    await apiClient.patch(`/store-stock/${row._id}/threshold`, { threshold });
    loadStoreStock(activeStoreId);
  }

  return (
    <div>
      <h1>Warehouse Stock</h1>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {warehouseStock.map((row) => (
            <tr key={row._id}>
              <td>{row.item?.name}</td>
              <td>{row.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Linked stores</h2>
      <div>
        {linkedStores.map((store) => (
          <button key={store._id} onClick={() => loadStoreStock(store._id)}>
            {store.name}
          </button>
        ))}
      </div>

      {activeStoreId && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {storeStock.map((row) => (
              <tr key={row._id} style={row.belowThreshold ? { background: '#fdd' } : undefined}>
                <td>{row.item?.name}</td>
                <td>{row.qty}</td>
                <td>
                  <label htmlFor={`threshold-${row._id}`}>{`Threshold for ${row.item?.name}`}</label>
                  <input
                    id={`threshold-${row._id}`}
                    aria-label={`Threshold for ${row.item?.name}`}
                    type="number"
                    defaultValue={row.threshold}
                    onBlur={(e) => handleThresholdChange(row, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
