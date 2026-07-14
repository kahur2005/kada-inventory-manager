import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const warehouseIcon = new L.DivIcon({
  html: `<div style="background:#2563eb;width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: "",
});

const storeIcon = new L.DivIcon({
  html: `<div style="background:#16a34a;width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: "",
});

const driverIcon = new L.DivIcon({
  html: `<div style="background:#dc2626;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  className: "",
});

const STATUS_LABEL = {
  idle: "Idle",
  "on-route": "Sedang Dalam Perjalanan",
  delivering: "Sedang Mengantar",
  offline: "Offline",
};

export default function LogisticsMap({ locations }) {
  const center = [-6.2, 106.8];

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {locations.warehouses.map((w) => (
        <Marker key={w.id} position={[w.lat, w.lng]} icon={warehouseIcon}>
          <Popup>
            <strong>Gudang</strong>
            <br />
            {w.name}
            <br />
            <small>{w.address}</small>
          </Popup>
        </Marker>
      ))}

      {locations.stores.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={storeIcon}>
          <Popup>
            <strong>Toko</strong>
            <br />
            {s.name}
            <br />
            <small>{s.address}</small>
          </Popup>
        </Marker>
      ))}

      {locations.drivers.map((d) => (
        <Marker
          key={d.id}
          position={[d.lat, d.lng]}
          icon={driverIcon}
        >
          <Popup>
            <strong>Driver</strong>
            <br />
            {d.name}
            <br />
            <small>Status: {STATUS_LABEL[d.status] || d.status}</small>
            <br />
            <small>Kecepatan: {d.speedKph} km/h</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
