import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.get('/alerts').then((res) => setAlerts(res.data.alerts));
  }, []);

  if (alerts === null) return <div className="loading">Loading...</div>;
  if (alerts.length === 0) {
    return (
      <div>
        <h1>Low Stock Alerts</h1>
        <div className="empty">
          <p>No low-stock alerts right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Low Stock Alerts</h1>
      {alerts.map((alert) => (
        <div key={alert._id} className="alert-card">
          <div>
            <p>
              <strong>{alert.store.name}</strong> &mdash; {alert.item.name}
            </p>
            <small>
              {alert.qty} left (threshold: {alert.threshold})
            </small>
          </div>
          <button className="btn-sm btn-nav" onClick={() => navigate('/warehouse/boxes')}>
            Pack a box
          </button>
        </div>
      ))}
    </div>
  );
}
