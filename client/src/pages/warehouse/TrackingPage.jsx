import { useState, useEffect } from "react";
import apiClient from "../../api/client";
import LogisticsMap from "../../components/LogisticsMap";

function formatEta(seconds) {
  if (seconds == null) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} menit`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} jam ${m} menit`;
}

function formatArrival(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function TrackingPage() {
  const [locations, setLocations] = useState({ warehouses: [], stores: [], drivers: [] });
  const [selectedDriver, setSelectedDriver] = useState("");
  const [routeInfo, setRouteInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocations();
    const interval = setInterval(loadLocations, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadLocations() {
    try {
      const res = await apiClient.get("/tracking/locations");
      setLocations(res.data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  const currentDriver = locations.drivers.find((d) => d.id === selectedDriver);
  const expectedArrival = formatArrival(currentDriver?.expectedArrival);

  return (
    <div className="tracking-layout">
      <div className="tracking-sidebar">
        <h2 style={{ margin: 0 }}>Tracking</h2>

        <div>
          <label>Pilih Driver</label>
          <select
            value={selectedDriver}
            onChange={(e) => {
              setRouteInfo(null);
              setSelectedDriver(e.target.value);
            }}
          >
            <option value="">-- Pilih Driver --</option>
            {locations.drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {currentDriver && (
          <div className="tracking-stats">
            <p>Tujuan: <strong>{currentDriver.destination?.name || "—"}</strong></p>
            {expectedArrival && (
              <p>Perkiraan tiba: <strong>{expectedArrival}</strong></p>
            )}
            {currentDriver.destination && (
              <p>
                Estimasi rute:{" "}
                <strong>{routeInfo?.duration != null ? formatEta(routeInfo.duration) : "Menghitung..."}</strong>
              </p>
            )}
            {currentDriver.destination && routeInfo?.distance != null && (
              <p>Jarak: <strong>{(routeInfo.distance / 1000).toFixed(1)} km</strong></p>
            )}
          </div>
        )}

        <div className="tracking-stats">
          <p>Gudang: <strong>{locations.warehouses.length}</strong></p>
          <p>Toko: <strong>{locations.stores.length}</strong></p>
          <p>Driver: <strong>{locations.drivers.length}</strong></p>
        </div>
      </div>

      <div className="tracking-map">
        <LogisticsMap
          locations={locations}
          selectedDriverId={selectedDriver}
          onRouteInfo={setRouteInfo}
        />
      </div>
    </div>
  );
}
