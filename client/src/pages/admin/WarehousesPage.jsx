import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';
import AddressSearch from '../../components/AddressSearch';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [capacityM3, setCapacityM3] = useState(0);
  const [areaM2, setAreaM2] = useState(0);
  const [selectedStores, setSelectedStores] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const load = useCallback(async () => {
    const [whRes, storeRes] = await Promise.all([apiClient.get('/warehouses'), apiClient.get('/stores')]);
    setWarehouses(whRes.data.warehouses);
    setStores(storeRes.data.stores);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/warehouses', {
      name,
      address,
      coords,
      capacityM3: Number(capacityM3),
      areaM2: Number(areaM2),
      stores: selectedStores,
    });
    setName('');
    setAddress('');
    setCoords(null);
    setCapacityM3(0);
    setAreaM2(0);
    setSelectedStores([]);
    load();
  }

  function toggleStore(storeId) {
    setSelectedStores((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    );
  }

  return (
    <div>
      <h1>Warehouses</h1>

      {warehouses.map((wh) => (
        <div key={wh._id} className="warehouse-card">
          <h3>{wh.name}</h3>
          <p>{wh.address}</p>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${wh.utilizationPct}%` }} />
          </div>
          <div className="progress-label">{wh.utilizationPct}% utilized</div>
        </div>
      ))}

      <form onSubmit={handleCreate}>
        <h2>New warehouse</h2>
        <div className="warehouse-form-layout">
          <div className="warehouse-form-fields">
            <label htmlFor="wh-name">Name</label>
            <input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required />

            <label htmlFor="wh-address">Address</label>
            <AddressSearch
              value={address}
              onChange={setAddress}
              onPick={setCoords}
              placeholder="Search warehouse address..."
            />

            <label htmlFor="wh-capacity">Capacity (m³)</label>
            <input id="wh-capacity" type="number" value={capacityM3} onChange={(e) => setCapacityM3(e.target.value)} />

            <label htmlFor="wh-area">Area (m²)</label>
            <input id="wh-area" type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />

            <label>Linked stores</label>
            <div className="custom-dropdown" ref={dropdownRef}>
              <button
                type="button"
                className="custom-dropdown-trigger"
                onClick={() => setDropdownOpen((o) => !o)}
              >
                {selectedStores.length === 0
                  ? 'Select stores...'
                  : `${selectedStores.length} store(s) selected`}
                <span className="custom-dropdown-arrow">&#9662;</span>
              </button>
              {dropdownOpen && (
                <div className="custom-dropdown-menu">
                  {stores.map((store) => (
                    <label key={store._id} className="custom-dropdown-item">
                      <input
                        type="checkbox"
                        checked={selectedStores.includes(store._id)}
                        onChange={() => toggleStore(store._id)}
                      />
                      {store.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="warehouse-form-map">
            <MapPicker key={`${coords?.lat}-${coords?.lng}`} coords={coords} onChange={setCoords} />
          </div>
          <div className="warehouse-form-actions">
            <button type="submit">Create warehouse</button>
          </div>
        </div>
      </form>
    </div>
  );
}
