import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [capacityM3, setCapacityM3] = useState(0);
  const [areaM2, setAreaM2] = useState(0);
  const [selectedStores, setSelectedStores] = useState([]);

  const load = useCallback(async () => {
    const [whRes, storeRes] = await Promise.all([apiClient.get('/warehouses'), apiClient.get('/stores')]);
    setWarehouses(whRes.data.warehouses);
    setStores(storeRes.data.stores);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  function handleStoreSelect(e) {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedStores(values);
  }

  return (
    <div>
      <h1>Warehouses</h1>

      {warehouses.map((wh) => (
        <div key={wh._id}>
          <h2>{wh.name}</h2>
          <p>{wh.address}</p>
          <div style={{ background: '#eee', height: 8 }}>
            <div style={{ background: '#3366ff', width: `${wh.utilizationPct}%`, height: 8 }} />
          </div>
          <p>{wh.utilizationPct}% utilized</p>
        </div>
      ))}

      <form onSubmit={handleCreate}>
        <h2>New warehouse</h2>
        <label htmlFor="wh-name">Name</label>
        <input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="wh-address">Address</label>
        <input id="wh-address" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <label htmlFor="wh-capacity">Capacity (m³)</label>
        <input id="wh-capacity" type="number" value={capacityM3} onChange={(e) => setCapacityM3(e.target.value)} />

        <label htmlFor="wh-area">Area (m²)</label>
        <input id="wh-area" type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />

        <label htmlFor="wh-stores">Linked stores</label>
        <select id="wh-stores" multiple value={selectedStores} onChange={handleStoreSelect}>
          {stores.map((store) => (
            <option key={store._id} value={store._id}>
              {store.name}
            </option>
          ))}
        </select>

        <MapPicker coords={coords} onChange={setCoords} />

        <button type="submit">Create warehouse</button>
      </form>
    </div>
  );
}
