import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.get('/alerts').then((res) => setAlerts(res.data.alerts));
  }, []);

  if (alerts === null) return <div>Loading...</div>;
  if (alerts.length === 0) return <p>No low-stock alerts right now.</p>;

  return (
    <div>
      <h1>Low Stock Alerts</h1>
      {alerts.map((alert) => (
        <div key={alert._id} style={{ background: '#fdd', padding: 8, marginBottom: 8 }}>
          <p>
            {alert.store.name} — {alert.item.name}: {alert.qty} left (threshold {alert.threshold})
          </p>
          <button onClick={() => navigate('/warehouse/boxes')}>Pack a box for this store</button>
        </div>
      ))}
    </div>
  );
}
