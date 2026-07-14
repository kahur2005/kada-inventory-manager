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

  const grouped = boxes.reduce((acc, box) => {
    const key = box.destinationStore?.name || 'Unknown store';
    acc[key] = acc[key] || [];
    acc[key].push(box);
    return acc;
  }, {});

  const activeCount = boxes.filter((b) => ['ASSIGNED', 'IN_TRANSIT'].includes(b.status)).length;

  return (
    <div>
      <div className="section-header">
        <h1>
          My Deliveries {activeCount > 0 && <span aria-label="active deliveries badge">{activeCount}</span>}
        </h1>
        <button onClick={toggleDelivering}>
          {delivering ? 'Stop delivering' : 'Start delivering'}
        </button>
      </div>

      {Object.entries(grouped).map(([storeName, storeBoxes]) => (
        <div key={storeName} className="delivery-group">
          <div className="delivery-group-header">
            <span>{storeName}</span>
            <span className="badge badge-gray">{storeBoxes.length} box{storeBoxes.length !== 1 ? 'es' : ''}</span>
          </div>
          {storeBoxes.map((box) => (
            <div key={box._id} className="delivery-item">
              <div className="delivery-item-info">
                <span className="delivery-item-code">{box.code}</span>
                {box.destinationStore?.address && (
                  <span className="delivery-item-address">{box.destinationStore.address}</span>
                )}
              </div>
              <div className="flex items-center gap-sm">
                <span className={`badge badge-${box.status === 'IN_TRANSIT' ? 'orange' : box.status === 'ASSIGNED' ? 'yellow' : 'green'}`}>
                  {box.status}
                </span>
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
          ))}
        </div>
      ))}
    </div>
  );
}
