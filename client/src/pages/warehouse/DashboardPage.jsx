import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import apiClient from '../../api/client';

export default function WarehouseDashboardPage() {
  const [driverData, setDriverData] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWhItem, setSelectedWhItem] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedStoreItem, setSelectedStoreItem] = useState('');

  useEffect(() => {
    Promise.all([
      apiClient.get('/dashboard/warehouse/driver-performance'),
      apiClient.get('/dashboard/warehouse/stock-availability'),
    ]).then(([driverRes, stockRes]) => {
      setDriverData(driverRes.data);
      setStockData(stockRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="card"><p>Loading dashboard...</p></div>;
  if (!driverData || !stockData) return <div className="card"><p>Failed to load dashboard data.</p></div>;

  const whItemOptions = stockData.warehouseStock.map((s) => ({ id: s.itemId, label: `${s.itemName} (${s.itemSku})` }));
  const uniqueStoreIds = [...new Set(stockData.storeStock.map((s) => s.storeId))];
  const storeOptions = uniqueStoreIds.map((sid) => {
    const found = stockData.storeStock.find((s) => s.storeId === sid);
    return { id: sid, label: found?.storeName || sid };
  });

  const whHistoryForItem = selectedWhItem
    ? (stockData.warehouseHistory[selectedWhItem] || []).map((h) => ({
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      qty: h.qty,
    }))
    : [];

  const whItemMeta = stockData.warehouseStock.find((s) => s.itemId === selectedWhItem);

  const storeHistoryKey = selectedStore && selectedStoreItem ? `${selectedStore}:${selectedStoreItem}` : '';
  const storeHistoryForItem = storeHistoryKey
    ? (stockData.storeHistory[storeHistoryKey] || []).map((h) => ({
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      qty: h.qty,
    }))
    : [];

  const storeItemMeta = stockData.storeStock.find(
    (s) => s.storeId === selectedStore && s.itemId === selectedStoreItem
  );

  const storeItemOptionsForStore = stockData.storeStock
    .filter((s) => s.storeId === selectedStore)
    .map((s) => ({ id: s.itemId, label: `${s.itemName} (${s.itemSku})` }));

  return (
    <div>
      <h1>Warehouse Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon icon-primary">&#128230;</div>
          <div className="stat-label">Total Delivered</div>
          <div className="stat-value">{driverData.totalDelivered}</div>
          <div className="stat-sub">Completed deliveries</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-info">&#9201;</div>
          <div className="stat-label">Avg Actual Time</div>
          <div className="stat-value">{driverData.overallAvgActualMinutes ?? '—'}<span style={{ fontSize: '0.875rem', fontWeight: 400 }}> min</span></div>
          <div className="stat-sub">Across all drivers</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-success">&#127919;</div>
          <div className="stat-label">Avg Estimated Time</div>
          <div className="stat-value">{driverData.overallAvgEstimatedMinutes ?? '—'}<span style={{ fontSize: '0.875rem', fontWeight: 400 }}> min</span></div>
          <div className="stat-sub">Based on distance</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon icon-danger">&#9888;&#65039;</div>
          <div className="stat-label">Low Stock Alerts</div>
          <div className="stat-value">{stockData.reorderAlerts.length}</div>
          <div className="stat-sub">Items below threshold</div>
        </div>
      </div>

      {/* Reorder Alerts */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Reorder Alerts</h3>
        </div>
        {stockData.reorderAlerts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>All store stock levels are above their reorder thresholds.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Store</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Threshold</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Days Left</th>
              </tr>
            </thead>
            <tbody>
              {stockData.reorderAlerts.map((alert, i) => (
                <tr key={`${alert.storeId}-${alert.itemId}-${i}`} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 500 }}>{alert.storeName}</td>
                  <td style={{ padding: '12px 8px' }}>{alert.itemName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>({alert.itemSku})</span></td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{alert.currentQty} {alert.unit}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{alert.threshold}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {alert.estimatedDaysUntilEmpty !== null ? `${alert.estimatedDaysUntilEmpty}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Store Proximity */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Store Proximity Ranking</h3>
        </div>
        {driverData.storeProximity.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No store proximity data available.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Store</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance (km)</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Time (min)</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deliveries</th>
              </tr>
            </thead>
            <tbody>
              {driverData.storeProximity.map((s, i) => (
                <tr key={s.storeId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 500 }}>{s.storeName}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.distanceKm}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.estimatedMinutes}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.deliveries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Warehouse Stock Availability */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Stock Availability — Warehouse</h3>
        </div>
        {whItemOptions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No warehouse stock data.</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: 8 }}>Select Item:</label>
              <select
                value={selectedWhItem}
                onChange={(e) => setSelectedWhItem(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
              >
                <option value="">-- choose item --</option>
                {whItemOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
            {selectedWhItem && whHistoryForItem.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>No history data for this item yet. Stock history is recorded on restock and adjustment events.</p>
            )}
            {selectedWhItem && whHistoryForItem.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={whHistoryForItem} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis label={{ value: 'Qty', angle: -90, position: 'insideLeft', fontSize: 13 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)' }} />
                  <Line type="monotone" dataKey="qty" stroke="#2f80ed" strokeWidth={2} dot={{ r: 4 }} name="Current Qty" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {selectedWhItem && whItemMeta && (
              <div style={{ marginTop: 12, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Current stock: <strong>{whItemMeta.currentQty}</strong> {whItemMeta.unit}
              </div>
            )}
          </>
        )}
      </div>

      {/* Store Stock Availability */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3>Stock Availability — Stores</h3>
        </div>
        {storeOptions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No store stock data.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: 8 }}>Store:</label>
                <select
                  value={selectedStore}
                  onChange={(e) => { setSelectedStore(e.target.value); setSelectedStoreItem(''); }}
                  style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                >
                  <option value="">-- choose store --</option>
                  {storeOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {selectedStore && (
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, marginRight: 8 }}>Item:</label>
                  <select
                    value={selectedStoreItem}
                    onChange={(e) => setSelectedStoreItem(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}
                  >
                    <option value="">-- choose item --</option>
                    {storeItemOptionsForStore.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {selectedStore && selectedStoreItem && storeHistoryForItem.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>No history data for this store item yet.</p>
            )}
            {selectedStore && selectedStoreItem && storeHistoryForItem.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={storeHistoryForItem} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis label={{ value: 'Qty', angle: -90, position: 'insideLeft', fontSize: 13 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)' }} />
                  {storeItemMeta?.maxLevel > 0 && (
                    <ReferenceLine y={storeItemMeta.maxLevel} stroke="#2f80ed" strokeDasharray="5 5" label={{ value: 'Max', position: 'right', fontSize: 12, fill: '#2f80ed' }} />
                  )}
                  {storeItemMeta?.threshold > 0 && (
                    <ReferenceLine y={storeItemMeta.threshold} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Min/Reorder', position: 'right', fontSize: 12, fill: '#ef4444' }} />
                  )}
                  <Line type="monotone" dataKey="qty" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Current Qty" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {selectedStore && selectedStoreItem && storeItemMeta && (
              <div style={{ marginTop: 12, fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <span>Current: <strong>{storeItemMeta.currentQty}</strong> {storeItemMeta.unit}</span>
                <span>Reorder Point: <strong>{storeItemMeta.threshold}</strong></span>
                <span>Max Level: <strong>{storeItemMeta.maxLevel || '—'}</strong></span>
                {storeItemMeta.belowThreshold && (
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>&#9888; Below threshold</span>
                )}
              </div>
            )}
          </>
        )}
      </div>


    </div>
  );
}
