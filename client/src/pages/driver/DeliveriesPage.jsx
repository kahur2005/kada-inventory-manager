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
      <h1>
        My Deliveries {activeCount > 0 && <span aria-label="active deliveries badge">{activeCount}</span>}
      </h1>
      <button onClick={toggleDelivering}>{delivering ? 'Stop delivering' : 'Start delivering'}</button>

      {Object.entries(grouped).map(([storeName, storeBoxes]) => (
        <div key={storeName}>
          <h2>{storeName}</h2>
          {storeBoxes.map((box) => (
            <div key={box._id}>
              <p><span>{box.code}</span> — {box.status}</p>
              {box.destinationStore?.address && (
                <p>{box.destinationStore.address}</p>
              )}
              {box.destinationStore?.coords?.lat != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${box.destinationStore.coords.lat}&mlon=${box.destinationStore.coords.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map pin
                </a>
              )}
              {box.status === 'ASSIGNED' && <button onClick={() => handlePickup(box)}>Pick up</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
