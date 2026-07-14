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

  const activeStore = linkedStores.find((s) => s._id === activeStoreId);

  return (
    <div>
      <h1>Warehouse Stock</h1>

      <div className="stock-layout">
        <div className="stock-layout-left">
          <div className="card">
            <div className="card-header">
              <h3>Linked stores</h3>
            </div>
            {linkedStores.length === 0 ? (
              <p className="text-muted">No linked stores</p>
            ) : (
              <div className="store-btn-list">
                {linkedStores.map((store) => (
                  <button
                    key={store._id}
                    className={`store-btn ${activeStoreId === store._id ? 'store-btn-active' : ''}`}
                    onClick={() => loadStoreStock(store._id)}
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Stock items</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {warehouseStock.length === 0 ? (
                  <tr><td colSpan="2" className="text-muted text-center">No stock data</td></tr>
                ) : warehouseStock.map((row) => (
                  <tr key={row._id}>
                    <td className="font-bold">{row.item?.name}</td>
                    <td>{row.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stock-layout-right">
          {activeStoreId ? (
            <div className="card">
              <div className="card-header">
                <h3>Store stock: {activeStore?.name}</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {storeStock.length === 0 ? (
                    <tr><td colSpan="3" className="text-muted text-center">No stock data for this store</td></tr>
                  ) : storeStock.map((row) => (
                    <tr key={row._id} className={row.belowThreshold ? 'row-low-stock' : ''}>
                      <td className="font-bold">{row.item?.name}</td>
                      <td>{row.qty}</td>
                      <td>
                        <label htmlFor={`threshold-${row._id}`} className="sr-only">{`Threshold for ${row.item?.name}`}</label>
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
            </div>
          ) : (
            <div className="card">
              <div className="empty" style={{ padding: '40px 0' }}>
                <p className="text-muted">Pilih toko untuk melihat stock</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
