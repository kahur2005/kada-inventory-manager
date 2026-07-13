import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;"></div>`,
  });
}

const warehouseIcon = dotIcon('#3366ff');
const storeIcon = dotIcon('#33aa55');
const driverIcon = dotIcon('#ff8c00');

function minutesAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(Math.round(diffMs / 60000), 0);
}

export default function DashboardMap({ warehouses = [], stores = [], driverLocations = [], center = [-6.2, 106.8], zoom = 11 }) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: 400, width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

      {warehouses
        .filter((wh) => wh.coords?.lat != null && wh.coords?.lng != null)
        .map((wh) => (
          <Marker key={wh._id} position={[wh.coords.lat, wh.coords.lng]} icon={warehouseIcon}>
            <Popup>{wh.name}</Popup>
          </Marker>
        ))}

      {stores
        .filter((store) => store.coords?.lat != null && store.coords?.lng != null)
        .map((store) => (
          <Marker key={store._id} position={[store.coords.lat, store.coords.lng]} icon={storeIcon}>
            <Popup>{store.name}</Popup>
          </Marker>
        ))}

      {driverLocations
        .filter((dl) => dl.coords?.lat != null && dl.coords?.lng != null)
        .map((dl) => (
          <Marker key={dl._id} position={[dl.coords.lat, dl.coords.lng]} icon={driverIcon}>
            <Popup>
              {dl.driver?.name} — updated {minutesAgo(dl.updatedAt)} min ago
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
