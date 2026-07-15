import { useState, useEffect } from "react";
import apiClient from "../../api/client";
import LogisticsMap from "../../components/LogisticsMap";
import DriverTripToggle from "../../components/DriverTripToggle";

export default function TrackingPage() {
  const [locations, setLocations] = useState({ warehouses: [], stores: [], drivers: [] });
  const [selectedDriver, setSelectedDriver] = useState("");
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

  async function handleStatusChange(status) {
    await apiClient.post(`/tracking/drivers/${selectedDriver}/status`, { status });
    loadLocations();
  }

  if (loading) return <div className="loading">Loading...</div>;

  const currentDriver = locations.drivers.find((d) => d.id === selectedDriver);

  return (
    <div className="tracking-layout">
      <div className="tracking-sidebar">
        <h2 style={{ margin: 0 }}>Tracking</h2>

        <div>
          <label>Pilih Driver</label>
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
          >
            <option value="">-- Pilih Driver --</option>
            {locations.drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
            ))}
          </select>
        </div>

        {currentDriver && (
          <DriverTripToggle
            driverId={currentDriver.id}
            currentStatus={currentDriver.status}
            onStatusChange={handleStatusChange}
          />
        )}

        <div className="tracking-stats">
          <p>Gudang: <strong>{locations.warehouses.length}</strong></p>
          <p>Toko: <strong>{locations.stores.length}</strong></p>
          <p>Driver: <strong>{locations.drivers.length}</strong></p>
        </div>
      </div>

      <div className="tracking-map">
        <LogisticsMap locations={locations} selectedDriverId={selectedDriver} />
      </div>
    </div>
  );
}
