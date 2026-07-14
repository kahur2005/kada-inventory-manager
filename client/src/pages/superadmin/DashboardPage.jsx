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
        <div>
          <div>Packed: {stats.boxesByStatus.PACKED}</div>
          <div>Assigned: {stats.boxesByStatus.ASSIGNED}</div>
          <div>In transit: {stats.boxesByStatus.IN_TRANSIT}</div>
          <div>Delivered: {stats.boxesByStatus.DELIVERED}</div>
          <div>Total users: {stats.totalUsers}</div>
          <div>Low stock alerts: {stats.lowStockAlerts}</div>
          <div>Warehouse utilization: {stats.warehouseUtilizationPct}%</div>
        </div>
      )}

      <DashboardMap warehouses={warehouses} stores={stores} driverLocations={driverLocations} />

      <h2>Recent activity</h2>
      <ul>
        {logs.map((log) => (
          <li key={log._id}>
            {log.action} by {log.actor?.name} {log.box ? `(box ${log.box.code})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
