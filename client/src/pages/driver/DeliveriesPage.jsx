import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';

const PING_INTERVAL_MS = 45000;
const POLL_INTERVAL_MS = 15000;

export default function DeliveriesPage() {
  const [boxes, setBoxes] = useState([]);
  const [delivering, setDelivering] = useState(false);
  const pingIntervalRef = useRef(null);

  const load = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status: '', search: '', page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  function pingLocation() {
    navigator.geolocation.getCurrentPosition((pos) => {
      apiClient.post('/driver-location', { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
    });
  }

  function toggleDelivering() {
    setDelivering((prev) => {
      const next = !prev;
      if (next) {
        pingLocation();
        pingIntervalRef.current = setInterval(pingLocation, PING_INTERVAL_MS);
      } else if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      return next;
    });
  }

  function handlePickup(box) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await apiClient.patch(`/boxes/${box._id}/pickup`, { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      load();
    });
  }

  const activeBoxes = boxes.filter((b) => ['ASSIGNED', 'IN_TRANSIT'].includes(b.status));
  const deliveredBoxes = boxes.filter((b) => b.status === 'DELIVERED');

  const activeCount = activeBoxes.length;

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ marginBottom: 12 }}>
          My Deliveries {activeCount > 0 && <span aria-label="active deliveries badge">{activeCount}</span>}
        </h1>
        <button onClick={toggleDelivering}>
          {delivering ? 'Stop delivering' : 'Start delivering'}
        </button>
      </div>

      {activeBoxes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2>Active Deliveries</h2>
          </div>
          {activeBoxes.map((box) => (
            <div key={box._id} className="delivery-group">
              <div className="delivery-group-header">
                <span>{box.destinationStore?.name || 'Unknown store'}</span>
                <span className={`badge badge-${box.status === 'IN_TRANSIT' ? 'orange' : 'yellow'}`}>
                  {box.status}
                </span>
              </div>
              <div className="delivery-item">
                <div className="delivery-item-info">
                  <span className="delivery-item-code">{box.code}</span>
                  <span className="delivery-item-address">
                    From: {box.warehouse?.name || 'Unknown'} → To: {box.destinationStore?.name || 'Unknown'}
                  </span>
                  {box.destinationStore?.address && (
                    <span className="delivery-item-address">{box.destinationStore.address}</span>
                  )}
                </div>
                <div className="flex items-center gap-sm">
                  {box.destinationStore?.coords?.lat != null && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${box.destinationStore.coords.lat}&mlon=${box.destinationStore.coords.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-sm"
                    >
                      Map
                    </a>
                  )}
                  {box.status === 'ASSIGNED' && (
                    <button className="btn-success btn-sm" onClick={() => handlePickup(box)}>
                      Pick up
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeBoxes.length === 0 && deliveredBoxes.length === 0 && (
        <div className="empty">
          <p>No deliveries assigned</p>
        </div>
      )}

      {deliveredBoxes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2>Delivery History</h2>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveredBoxes.map((box) => (
                  <tr key={box._id}>
                    <td className="font-mono font-bold">{box.code}</td>
                    <td>{box.warehouse?.name || '-'}</td>
                    <td>{box.destinationStore?.name || '-'}</td>
                    <td>
                      <span className="badge badge-green">{box.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
