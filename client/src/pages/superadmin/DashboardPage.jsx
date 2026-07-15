import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import DashboardMap from '../../components/DashboardMap';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [driverLocations, setDriverLocations] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    apiClient.get('/dashboard/stats').then((res) => setStats(res.data));
    apiClient.get('/warehouses').then((res) => setWarehouses(res.data.warehouses));
    apiClient.get('/stores').then((res) => setStores(res.data.stores));
    apiClient.get('/driver-locations').then((res) => setDriverLocations(res.data.driverLocations));
    apiClient.get('/logs', { params: { page: 1, limit: 10 } }).then((res) => setLogs(res.data.logs));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>

      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon icon-primary">&#128230;</div>
            <div className="stat-label">Packed</div>
            <div className="stat-value">{stats.boxesByStatus.PACKED}</div>
            <div className="stat-sub">Boxes ready</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-warning">&#128205;</div>
            <div className="stat-label">Assigned</div>
            <div className="stat-value">{stats.boxesByStatus.ASSIGNED}</div>
            <div className="stat-sub">Awaiting pickup</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-info">&#128666;</div>
            <div className="stat-label">In Transit</div>
            <div className="stat-value">{stats.boxesByStatus.IN_TRANSIT}</div>
            <div className="stat-sub">On the way</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-success">&#9989;</div>
            <div className="stat-label">Delivered</div>
            <div className="stat-value">{stats.boxesByStatus.DELIVERED}</div>
            <div className="stat-sub">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-primary">&#128101;</div>
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{stats.totalUsers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-danger">&#9888;&#65039;</div>
            <div className="stat-label">Low Stock Alerts</div>
            <div className="stat-value">{stats.lowStockAlerts}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon icon-success">&#128200;</div>
            <div className="stat-label">Warehouse Utilization</div>
            <div className="stat-value">{stats.warehouseUtilizationPct}%</div>
          </div>
        </div>
      )}

      <div className="card mb-lg">
        <div className="card-header">
          <h3>Live Map</h3>
        </div>
        <DashboardMap warehouses={warehouses} stores={stores} driverLocations={driverLocations} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent Activity</h3>
        </div>
        <ul>
          {logs.map((log) => (
            <li key={log._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.9375rem' }}>
              {log.action} by <strong>{log.actor?.name}</strong>{' '}
              {log.box && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>(box {log.box.code})</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
