import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const driverIcon = new L.DivIcon({
  html: `<div style="background:#dc2626;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  className: '',
});

const destIcon = new L.DivIcon({
  html: `<div style="background:#16a34a;width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
});

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, bounds]);
  return null;
}

export default function DriverMapModal({ destination, onClose }) {
  const [driverPos, setDriverPos] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setError('Unable to get your location');
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    if (!driverPos || !destination?.lat || !destination?.lng) return;
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${driverPos.lng},${driverPos.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    fetch(osrmUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRouteCoords(coords);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Could not fetch route');
        setLoading(false);
      });
  }, [driverPos, destination]);

  if (!destination?.lat || !destination?.lng) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <p>Destination coordinates not available.</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const destLatLng = [destination.lat, destination.lng];
  const driverLatLng = driverPos ? [driverPos.lat, driverPos.lng] : null;
  const bounds = driverLatLng ? [driverLatLng, destLatLng] : [destLatLng];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-map" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Route to Destination</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        {loading && <p style={{ padding: 16 }}>Loading route...</p>}
        {error && <p style={{ padding: 16, color: 'red' }}>{error}</p>}
        <MapContainer center={destLatLng} zoom={13} style={{ width: '100%', height: 400 }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={bounds} />
          {driverLatLng && (
            <Marker position={driverLatLng} icon={driverIcon}>
              <Popup>Your location</Popup>
            </Marker>
          )}
          <Marker position={destLatLng} icon={destIcon}>
            <Popup>Destination</Popup>
          </Marker>
          {routeCoords.length > 0 && (
            <Polyline positions={routeCoords} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />
          )}
        </MapContainer>
        <div style={{ padding: '8px 16px' }}>
          <a
            href={`https://www.openstreetmap.org/directions?engine=osrm_car&route=${driverPos?.lat},${driverPos?.lng};${destination.lat},${destination.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in OpenStreetMap
          </a>
        </div>
      </div>
    </div>
  );
}
